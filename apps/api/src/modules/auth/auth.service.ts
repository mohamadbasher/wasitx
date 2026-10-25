import { Inject, Injectable } from "@nestjs/common";
import { hash, verify as argonVerify } from "@node-rs/argon2";
import { generateSecret, generateURI, verify as totpVerify } from "otplib";
import QRCode from "qrcode";
import {
  isStaff,
  maskPhone,
  permissionsFor,
  verificationTier,
  type LoginInput,
  type MeDto,
  type RegisterInput,
  type Role,
} from "@wasitx/shared";
import type { RequestContext } from "../../common/auth/auth.types.js";
import { EligibilityService } from "../../common/auth/eligibility.service.js";
import { CryptoService } from "../../common/crypto.service.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService, type Tx } from "../../common/prisma.service.js";
import { env } from "../../config/env.js";
import { AuditService } from "../audit/audit.service.js";
import { EMAIL_PROVIDER, SMS_PROVIDER, type EmailProvider, type SmsProvider } from "../integrations/providers.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { renderEmail } from "../notifications/templates.js";

const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 }; // OWASP Password Storage Cheat Sheet (argon2id)
const REFRESH_TTL_MS = 30 * 86_400_000;
const STAFF_REFRESH_TTL_MS = 12 * 3600_000;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MS = 15 * 60_000;
const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60_000;

export interface IssuedTokens {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
}

@Injectable()
export class AuthService {
  /** Precomputed hash so unknown-email logins cost the same as real ones (no user enumeration by timing). */
  private dummyHash = hash("timing-equaliser-not-a-password", ARGON);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly eligibility: EligibilityService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  // ── registration & verification ───────────────────────────────────────────
  async register(input: RegisterInput, ctx: RequestContext): Promise<IssuedTokens> {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (exists) throw new AppError("EMAIL_ALREADY_REGISTERED", 409);
    const passwordHash = await hash(input.password, ARGON);
    const tokens = await this.prisma.tx(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          locale: input.locale,
          roles: { create: { role: "USER" } },
          kyc: { create: {} },
          stats: { create: {} },
        },
      });
      await this.audit.record(tx, { actorType: "USER", actorId: user.id, action: "auth.register", entityType: "User", entityId: user.id, ctx });
      await this.issueEmailVerification(tx, user.id, user.email, user.locale);
      return this.createSession(tx, user.id, ctx, false, false);
    });
    return tokens;
  }

  private async issueEmailVerification(tx: Tx, userId: string, email: string, locale: string) {
    const token = this.crypto.randomToken();
    await tx.verificationToken.create({
      data: { userId, type: "EMAIL_VERIFY", tokenHash: this.crypto.sha256(token), target: email, expiresAt: new Date(Date.now() + 24 * 3600_000) },
    });
    const link = `${env.WEB_URL}/${locale}/verify-email?token=${token}`;
    const msg = renderEmail("verifyEmail", locale, { link, brand: env.BRAND_NAME });
    await this.email.send({ to: email, ...msg });
  }

  async resendEmailVerification(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.emailVerifiedAt) return { ok: true };
    await this.prisma.tx((tx) => this.issueEmailVerification(tx, u.id, u.email, u.locale));
    return { ok: true };
  }

  async verifyEmail(token: string, ctx: RequestContext) {
    const t = await this.prisma.verificationToken.findUnique({ where: { tokenHash: this.crypto.sha256(token) } });
    if (!t || t.type !== "EMAIL_VERIFY" || t.consumedAt || t.expiresAt < new Date()) throw new AppError("TOKEN_INVALID_OR_EXPIRED", 400);
    await this.prisma.tx(async (tx) => {
      await tx.verificationToken.update({ where: { id: t.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } });
      await this.audit.record(tx, { actorType: "USER", actorId: t.userId, action: "auth.email_verified", entityType: "User", entityId: t.userId, ctx });
    });
    return { ok: true };
  }

  async startPhoneVerification(userId: string, phone: string) {
    const taken = await this.prisma.user.findFirst({ where: { phoneE164: phone, phoneVerifiedAt: { not: null }, NOT: { id: userId } }, select: { id: true } });
    if (taken) throw new AppError("PHONE_ALREADY_REGISTERED", 409);
    const recent = await this.prisma.verificationToken.findFirst({
      where: { userId, type: "PHONE_OTP", createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) } },
    });
    if (recent) throw new AppError("OTP_COOLDOWN", 429, undefined, { retryAfterSec: 60 });
    const hourCount = await this.prisma.verificationToken.count({ where: { userId, type: "PHONE_OTP", createdAt: { gt: new Date(Date.now() - 3600_000) } } });
    if (hourCount >= 5) throw new AppError("OTP_HOURLY_LIMIT", 429);

    const code = this.crypto.numericCode(6);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { locale: true } });
    await this.prisma.verificationToken.create({
      data: { userId, type: "PHONE_OTP", tokenHash: this.crypto.lookupHash(`${phone}:${code}:${userId}`), target: phone, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    const text = renderEmail("phoneOtp", user.locale, { code, brand: env.BRAND_NAME }).text;
    await this.sms.send(phone, text);
    return { ok: true, expiresInSec: OTP_TTL_MS / 1000 };
  }

  async verifyPhone(userId: string, phone: string, code: string, ctx: RequestContext) {
    const t = await this.prisma.verificationToken.findFirst({
      where: { userId, type: "PHONE_OTP", target: phone, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!t || t.expiresAt < new Date() || t.attempts >= OTP_MAX_ATTEMPTS) throw new AppError("OTP_INVALID_OR_EXPIRED", 400);
    if (!this.crypto.safeEqual(t.tokenHash, this.crypto.lookupHash(`${phone}:${code}:${userId}`))) {
      await this.prisma.verificationToken.update({ where: { id: t.id }, data: { attempts: { increment: 1 } } });
      throw new AppError("OTP_INVALID_OR_EXPIRED", 400);
    }
    await this.prisma.tx(async (tx) => {
      await tx.verificationToken.update({ where: { id: t.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: userId }, data: { phoneE164: phone, phoneVerifiedAt: new Date() } });
      await this.audit.record(tx, { actorType: "USER", actorId: userId, action: "auth.phone_verified", entityType: "User", entityId: userId, data: { phone: maskPhone(phone) }, ctx });
    });
    return { ok: true };
  }

  // ── login / sessions ───────────────────────────────────────────────────────
  async login(input: LoginInput, ctx: RequestContext): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email }, include: { roles: true } });
    const fail = async (reason: string, userId?: string) => {
      await this.prisma.loginEvent.create({ data: { userId: userId ?? null, email: input.email, success: false, reason, ip: ctx.ip, userAgent: ctx.userAgent } });
      throw new AppError("INVALID_CREDENTIALS", 401);
    };

    if (!user) {
      await argonVerify(await this.dummyHash, input.password).catch(() => false);
      return fail("UNKNOWN_EMAIL");
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError("ACCOUNT_TEMPORARILY_LOCKED", 423, undefined, { until: user.lockedUntil.toISOString() });
    }
    const ok = await argonVerify(user.passwordHash, input.password).catch(() => false);
    if (!ok) {
      const failures = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: failures, lockedUntil: failures >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MS) : null },
      });
      return fail("BAD_PASSWORD", user.id);
    }
    if (user.status === "SUSPENDED" || user.status === "CLOSED") return fail(`ACCOUNT_${user.status}`, user.id);

    let mfaVerified = false;
    if (user.mfaEnabledAt && user.mfaSecretEnc) {
      if (input.totp) {
        mfaVerified = await this.checkTotp(user.mfaSecretEnc, input.totp);
      } else if (input.recoveryCode) {
        mfaVerified = await this.consumeRecoveryCode(user.id, user.recoveryCodeHashes, input.recoveryCode);
      } else {
        throw new AppError("MFA_REQUIRED", 401);
      }
      if (!mfaVerified) return fail("BAD_MFA", user.id);
    }

    const roles = user.roles.map((r) => r.role as Role);
    return this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastSeenAt: new Date() } });
      const tokens = await this.createSession(tx, user.id, ctx, mfaVerified, isStaff(roles), input.deviceName);
      await this.audit.record(tx, { actorType: isStaff(roles) ? "STAFF" : "USER", actorId: user.id, action: "auth.login", entityType: "Session", entityId: tokens.sessionId, ctx });
      return tokens;
    });
  }

  private async createSession(tx: Tx, userId: string, ctx: RequestContext, mfaVerified: boolean, staff: boolean, deviceName?: string, familyId?: string): Promise<IssuedTokens> {
    let deviceId: string | null = null;
    let newDevice = false;
    if (ctx.deviceId) {
      const fingerprint = this.crypto.sha256(ctx.deviceId);
      const existing = await tx.device.findUnique({ where: { userId_fingerprint: { userId, fingerprint } } });
      const priorDevices = existing ? 1 : await tx.device.count({ where: { userId } });
      const d = await tx.device.upsert({
        where: { userId_fingerprint: { userId, fingerprint } },
        create: { userId, fingerprint, name: deviceName ?? ctx.userAgent?.slice(0, 80) ?? null, lastIp: ctx.ip },
        update: { lastSeenAt: new Date(), lastIp: ctx.ip },
      });
      deviceId = d.id;
      newDevice = !existing && priorDevices > 0;
    }
    const refreshToken = this.crypto.randomToken(48);
    const refreshExpiresAt = new Date(Date.now() + (staff ? STAFF_REFRESH_TTL_MS : REFRESH_TTL_MS));
    const session = await tx.session.create({
      data: {
        userId,
        familyId: familyId ?? this.crypto.randomToken(12),
        refreshTokenHash: this.crypto.sha256(refreshToken),
        deviceId,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        mfaVerified,
        expiresAt: refreshExpiresAt,
      },
    });
    if (!familyId) {
      await tx.loginEvent.create({ data: { userId, email: "", success: true, ip: ctx.ip, userAgent: ctx.userAgent, newDevice } });
      if (newDevice) {
        await this.outbox.notify(tx, userId, "SECURITY_NEW_LOGIN", { device: ctx.userAgent?.slice(0, 60) ?? "unknown", ip: ctx.ip ?? "" }, "/security");
      }
    }
    const access = this.crypto.signAccessToken(session.id, userId);
    return { accessToken: access.token, accessExpiresAt: access.expiresAt, refreshToken, refreshExpiresAt, sessionId: session.id };
  }

  /**
   * Refresh-token rotation with reuse detection: each refresh revokes the presented session and
   * creates a new one in the same family. Presenting an already-rotated token means it was stolen
   * (or replayed) — the whole family is revoked and the user alerted.
   */
  async refresh(refreshToken: string, ctx: RequestContext): Promise<IssuedTokens> {
    const s = await this.prisma.session.findUnique({ where: { refreshTokenHash: this.crypto.sha256(refreshToken) }, include: { user: { include: { roles: true } } } });
    if (!s) throw Errors.unauthorized("SESSION_INVALID");
    if (s.revokedAt) {
      if (s.revokeReason === "rotated") {
        await this.prisma.tx(async (tx) => {
          await tx.session.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "refresh_reuse_detected" } });
          await this.audit.record(tx, { actorType: "SYSTEM", action: "auth.refresh_reuse_detected", entityType: "User", entityId: s.userId, data: { familyId: s.familyId }, ctx });
          await this.outbox.notify(tx, s.userId, "SECURITY_SESSION_REVOKED", { reason: "reuse" }, "/security");
        });
      }
      throw Errors.unauthorized("SESSION_INVALID");
    }
    if (s.expiresAt < new Date() || s.user.status === "SUSPENDED" || s.user.status === "CLOSED") throw Errors.unauthorized("SESSION_INVALID");

    const roles = s.user.roles.map((r) => r.role as Role);
    return this.prisma.tx(async (tx) => {
      const revoked = await tx.session.updateMany({ where: { id: s.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "rotated", rotatedAt: new Date() } });
      if (revoked.count === 0) throw Errors.unauthorized("SESSION_INVALID"); // concurrent refresh won
      await tx.user.update({ where: { id: s.userId }, data: { lastSeenAt: new Date() } });
      return this.createSession(tx, s.userId, { ...ctx, deviceId: null }, s.mfaVerified, isStaff(roles), undefined, s.familyId).then(async (t) => {
        if (s.deviceId) await tx.session.update({ where: { id: t.sessionId }, data: { deviceId: s.deviceId } });
        return t;
      });
    });
  }

  async logout(sessionId: string) {
    const s = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (s) await this.prisma.session.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "logout" } });
  }

  async logoutAll(userId: string, ctx: RequestContext, exceptSessionId?: string) {
    await this.prisma.tx(async (tx) => {
      const keepFamily = exceptSessionId ? (await tx.session.findUnique({ where: { id: exceptSessionId } }))?.familyId : undefined;
      await tx.session.updateMany({
        where: { userId, revokedAt: null, ...(keepFamily ? { NOT: { familyId: keepFamily } } : {}) },
        data: { revokedAt: new Date(), revokeReason: "logout_all" },
      });
      await this.audit.record(tx, { actorType: "USER", actorId: userId, action: "auth.logout_all", entityType: "User", entityId: userId, ctx });
    });
  }

  async listSessions(userId: string, currentSessionId: string) {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { device: true },
      orderBy: { lastUsedAt: "desc" },
    });
    const current = await this.prisma.session.findUnique({ where: { id: currentSessionId } });
    return rows.map((s) => ({
      id: s.id,
      current: s.familyId === current?.familyId,
      device: s.device?.name ?? s.userAgent ?? "Unknown device",
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
    }));
  }

  async revokeSession(userId: string, sessionId: string, ctx: RequestContext) {
    const s = await this.prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!s) throw Errors.notFound("SESSION");
    await this.prisma.session.updateMany({ where: { familyId: s.familyId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "user_revoked" } });
    await this.audit.recordNow({ actorType: "USER", actorId: userId, action: "auth.session_revoked", entityType: "Session", entityId: sessionId, ctx });
  }

  async loginHistory(userId: string) {
    const rows = await this.prisma.loginEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((r) => ({ id: r.id, success: r.success, reason: r.reason, ip: r.ip, userAgent: r.userAgent, newDevice: r.newDevice, createdAt: r.createdAt.toISOString() }));
  }

  // ── passwords ──────────────────────────────────────────────────────────────
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Same response whether or not the account exists (no enumeration).
    if (!user || user.status === "CLOSED") return { ok: true };
    const token = this.crypto.randomToken();
    await this.prisma.verificationToken.create({
      data: { userId: user.id, type: "PASSWORD_RESET", tokenHash: this.crypto.sha256(token), expiresAt: new Date(Date.now() + 3600_000) },
    });
    const link = `${env.WEB_URL}/${user.locale}/reset-password?token=${token}`;
    await this.email.send({ to: user.email, ...renderEmail("resetPassword", user.locale, { link, brand: env.BRAND_NAME }) });
    return { ok: true };
  }

  async resetPassword(token: string, password: string, ctx: RequestContext) {
    const t = await this.prisma.verificationToken.findUnique({ where: { tokenHash: this.crypto.sha256(token) } });
    if (!t || t.type !== "PASSWORD_RESET" || t.consumedAt || t.expiresAt < new Date()) throw new AppError("TOKEN_INVALID_OR_EXPIRED", 400);
    const passwordHash = await hash(password, ARGON);
    await this.prisma.tx(async (tx) => {
      await tx.verificationToken.update({ where: { id: t.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: t.userId }, data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
      await tx.session.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "password_reset" } });
      await this.audit.record(tx, { actorType: "USER", actorId: t.userId, action: "auth.password_reset", entityType: "User", entityId: t.userId, ctx });
      await this.outbox.notify(tx, t.userId, "SECURITY_PASSWORD_CHANGED", {}, "/security");
    });
    return { ok: true };
  }

  async changePassword(userId: string, sessionId: string, current: string, next: string, ctx: RequestContext) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argonVerify(u.passwordHash, current).catch(() => false))) throw new AppError("INVALID_CREDENTIALS", 401);
    const passwordHash = await hash(next, ARGON);
    await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash, passwordChangedAt: new Date() } });
      await this.audit.record(tx, { actorType: "USER", actorId: userId, action: "auth.password_changed", entityType: "User", entityId: userId, ctx });
      await this.outbox.notify(tx, userId, "SECURITY_PASSWORD_CHANGED", {}, "/security");
    });
    await this.logoutAll(userId, ctx, sessionId);
    return { ok: true };
  }

  // ── MFA (TOTP + recovery codes) ────────────────────────────────────────────
  private async checkTotp(secretEnc: string, code: string): Promise<boolean> {
    const secret = this.crypto.decrypt(secretEnc);
    const r = await totpVerify({ secret, token: code, epochTolerance: 30 }).catch(() => ({ valid: false }));
    return r.valid;
  }

  private async consumeRecoveryCode(userId: string, hashes: string[], code: string): Promise<boolean> {
    const h = this.crypto.sha256(code.replace(/\s|-/g, "").toUpperCase());
    if (!hashes.includes(h)) return false;
    await this.prisma.user.update({ where: { id: userId }, data: { recoveryCodeHashes: hashes.filter((x) => x !== h) } });
    return true;
  }

  async mfaSetup(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.mfaEnabledAt) throw new AppError("MFA_ALREADY_ENABLED", 409);
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: this.crypto.encrypt(secret) } });
    const uri = generateURI({ issuer: env.BRAND_NAME, label: u.email, secret });
    return { secret, otpauthUri: uri, qrDataUrl: await QRCode.toDataURL(uri) };
  }

  async mfaEnable(userId: string, sessionId: string, code: string, ctx: RequestContext) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.mfaSecretEnc || u.mfaEnabledAt) throw new AppError("MFA_SETUP_REQUIRED", 409);
    if (!(await this.checkTotp(u.mfaSecretEnc, code))) throw new AppError("MFA_CODE_INVALID", 400);
    const codes = Array.from({ length: 10 }, () => this.crypto.reference("", 10));
    await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { mfaEnabledAt: new Date(), recoveryCodeHashes: codes.map((c) => this.crypto.sha256(c)) } });
      await tx.session.update({ where: { id: sessionId }, data: { mfaVerified: true } });
      await this.audit.record(tx, { actorType: "USER", actorId: userId, action: "auth.mfa_enabled", entityType: "User", entityId: userId, ctx });
      await this.outbox.notify(tx, userId, "SECURITY_MFA_CHANGED", { state: "enabled" }, "/security");
    });
    return { recoveryCodes: codes };
  }

  /** Step-up for an existing session (e.g. staff session created before MFA verification). */
  async mfaVerifySession(userId: string, sessionId: string, code: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.mfaSecretEnc || !u.mfaEnabledAt) throw new AppError("MFA_NOT_ENABLED", 409);
    if (!(await this.checkTotp(u.mfaSecretEnc, code))) throw new AppError("MFA_CODE_INVALID", 400);
    await this.prisma.session.update({ where: { id: sessionId }, data: { mfaVerified: true } });
    return { ok: true };
  }

  async mfaDisable(userId: string, code: string, roles: Role[], ctx: RequestContext) {
    if (isStaff(roles)) throw new AppError("STAFF_MFA_MANDATORY", 403);
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.mfaSecretEnc || !u.mfaEnabledAt) throw new AppError("MFA_NOT_ENABLED", 409);
    if (!(await this.checkTotp(u.mfaSecretEnc, code))) throw new AppError("MFA_CODE_INVALID", 400);
    await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { mfaEnabledAt: null, mfaSecretEnc: null, recoveryCodeHashes: [] } });
      await this.audit.record(tx, { actorType: "USER", actorId: userId, action: "auth.mfa_disabled", entityType: "User", entityId: userId, ctx });
      await this.outbox.notify(tx, userId, "SECURITY_MFA_CHANGED", { state: "disabled" }, "/security");
    });
    return { ok: true };
  }

  /** Verifies a TOTP for step-up actions (withdrawals). */
  async assertTotp(userId: string, code: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!u.mfaSecretEnc || !u.mfaEnabledAt) throw new AppError("MFA_REQUIRED_FOR_ACTION", 403);
    if (!(await this.checkTotp(u.mfaSecretEnc, code))) throw new AppError("MFA_CODE_INVALID", 400);
  }

  async me(userId: string): Promise<MeDto> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true, kyc: { select: { status: true } } } });
    const roles = u.roles.map((r) => r.role as Role);
    const kycStatus = u.kyc?.status ?? "NOT_STARTED";
    return {
      id: u.id,
      email: u.email,
      emailVerified: !!u.emailVerifiedAt,
      phoneMasked: u.phoneE164 && u.phoneVerifiedAt ? maskPhone(u.phoneE164) : null,
      phoneVerified: !!u.phoneVerifiedAt,
      displayName: u.displayName,
      locale: u.locale,
      roles,
      permissions: [...permissionsFor(roles)],
      tier: verificationTier({ emailVerified: !!u.emailVerifiedAt, phoneVerified: !!u.phoneVerifiedAt, kycStatus }),
      kycStatus,
      accountStatus: u.status,
      mfaEnabled: !!u.mfaEnabledAt,
      ineligibility: await this.eligibility.reasons(u.id),
      createdAt: u.createdAt.toISOString(),
    };
  }
}
