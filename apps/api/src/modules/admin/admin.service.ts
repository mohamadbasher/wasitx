import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  PRODUCTION_GATES,
  STAFF_ROLES,
  TIME_ZONE,
  canAccountTransition,
  formatIls,
  formatUsdt,
  parseIls,
  parseUsdt,
  type AccountStatus,
  type RiskRules,
  type Role,
} from "@wasitx/shared";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService } from "../../common/prisma.service.js";
import type { CaseStatus, Prisma } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { ApprovalsService } from "../approvals/approvals.service.js";
import { AuditService } from "../audit/audit.service.js";
import { DEFAULT_TRADING_SETTINGS, SystemConfigService, type TradingSettings } from "../config/system-config.service.js";
import { ReconciliationService } from "../jobs/reconciliation.service.js";
import { platformKey } from "../ledger/ledger.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { EscrowService } from "../trades/escrow.service.js";
import { TradeEngine } from "../trades/trade-engine.service.js";
import { TradesService } from "../trades/trades.service.js";

/** Start of the current day / month in Asia/Jerusalem, as UTC instants. */
function jerusalemStart(unit: "day" | "month"): Date {
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const localNowAsUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  const offset = localNowAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  const startLocal = unit === "day" ? Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!) : Date.UTC(+parts.year!, +parts.month! - 1, 1);
  return new Date(startLocal - offset);
}

const csv = (rows: (string | number | null)[][]) =>
  rows.map((r) => r.map((v) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");

@Injectable()
export class AdminService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: SystemConfigService,
    private readonly approvals: ApprovalsService,
    private readonly engine: TradeEngine,
    private readonly trades: TradesService,
    private readonly escrow: EscrowService,
    private readonly recon: ReconciliationService,
    private readonly outbox: OutboxService,
  ) {}

  onModuleInit() {
    this.approvals.register("FROZEN_TRADE_CANCEL", async (p, c) => {
      const tradeId = p.tradeId as string;
      const release = await this.prisma.escrowOperation.findFirst({ where: { tradeId, type: "RELEASE", OR: [{ status: "CONFIRMED" }, { attempts: { gt: 0 } }] } });
      if (release) throw new AppError("RELEASE_ALREADY_SENT_TO_CUSTODIAN", 409);
      await this.engine.transition(tradeId, "cancel_frozen", { type: "STAFF", id: c.approvedById, role: "compliance" }, {
        note: p.reason as string,
        data: { cancelReason: p.reason as string },
        metadata: { requestedById: c.requestedById },
        ctx: c.requestCtx,
      });
      await this.escrow.processTrade(tradeId);
    });
    this.approvals.register("ROLE_GRANT_PRIVILEGED", async (p, c) => this.applyRoles(p.userId as string, p.roles as Role[], c.approvedById));
  }

  // ── overview ───────────────────────────────────────────────────────────────
  /**
   * Metric definitions (documented in docs/ADMIN-METRICS.md):
   *  registeredUsers = users not CLOSED; verifiedUsers = KYC APPROVED; activeTraders30d = distinct buyers/sellers
   *  of trades created in the last 30 days; volume = Σ amount of COMPLETED trades by completedAt (Asia/Jerusalem
   *  day/month); failed = CANCELLED + EXPIRED by cancelledAt (30d); disputeRate30d = disputes opened / trades created
   *  in 30d; fees = Σ ledger lines on PLATFORM_FEE_REVENUE (the accounting source of truth).
   */
  async overview() {
    const d30 = new Date(Date.now() - 30 * 86_400_000);
    const day = jerusalemStart("day");
    const month = jerusalemStart("month");
    const [registered, verified, partiesB, partiesS, dayVol, monthVol, completed30, failed30, created30, disputes30, feeAcct, feeMonth, openFlags, openCases, pendingKyc, pendingApprovals, pendingPayments, openDisputes] =
      await Promise.all([
        this.prisma.user.count({ where: { status: { not: "CLOSED" } } }),
        this.prisma.kycProfile.count({ where: { status: "APPROVED" } }),
        this.prisma.trade.findMany({ where: { createdAt: { gte: d30 } }, distinct: ["buyerId"], select: { buyerId: true } }),
        this.prisma.trade.findMany({ where: { createdAt: { gte: d30 } }, distinct: ["sellerId"], select: { sellerId: true } }),
        this.prisma.trade.aggregate({ _sum: { amountUsdt: true, fiatAgorot: true }, _count: true, where: { status: "COMPLETED", completedAt: { gte: day } } }),
        this.prisma.trade.aggregate({ _sum: { amountUsdt: true, fiatAgorot: true }, _count: true, where: { status: "COMPLETED", completedAt: { gte: month } } }),
        this.prisma.trade.count({ where: { status: "COMPLETED", completedAt: { gte: d30 } } }),
        this.prisma.trade.count({ where: { status: { in: ["CANCELLED", "EXPIRED"] }, cancelledAt: { gte: d30 } } }),
        this.prisma.trade.count({ where: { createdAt: { gte: d30 } } }),
        this.prisma.dispute.count({ where: { createdAt: { gte: d30 } } }),
        this.prisma.ledgerAccount.findUnique({ where: { key: platformKey("PLATFORM_FEE_REVENUE") } }),
        this.prisma.ledgerLine.aggregate({ _sum: { amount: true }, where: { account: { key: platformKey("PLATFORM_FEE_REVENUE") }, createdAt: { gte: month } } }),
        this.prisma.riskFlag.count({ where: { resolvedAt: null, severity: { in: ["HIGH", "CRITICAL"] } } }),
        this.prisma.complianceCase.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } } }),
        this.prisma.kycProfile.count({ where: { status: "IN_REVIEW" } }),
        this.prisma.approvalRequest.count({ where: { status: "PENDING" } }),
        this.prisma.trade.count({ where: { status: { in: ["AWAITING_FIAT_PAYMENT", "BUYER_MARKED_PAID", "SELLER_CONFIRMED_RECEIPT"] } } }),
        this.prisma.dispute.count({ where: { status: { not: "RESOLVED" } } }),
      ]);
    const activeTraders = new Set([...partiesB.map((p) => p.buyerId), ...partiesS.map((p) => p.sellerId)]).size;
    const recon = await this.config.get<{ ok: boolean; exceptions: unknown[]; ranAt: string } | null>("recon.last", null);
    return {
      tradingMode: env.TRADING_MODE,
      registeredUsers: registered,
      verifiedUsers: verified,
      activeTraders30d: activeTraders,
      volumeToday: { usdt: formatUsdt(dayVol._sum.amountUsdt ?? 0n), ils: formatIls(dayVol._sum.fiatAgorot ?? 0n), trades: dayVol._count },
      volumeMonth: { usdt: formatUsdt(monthVol._sum.amountUsdt ?? 0n), ils: formatIls(monthVol._sum.fiatAgorot ?? 0n), trades: monthVol._count },
      completedTrades30d: completed30,
      failedTrades30d: failed30,
      disputeRate30d: created30 ? ((disputes30 / created30) * 100).toFixed(2) : "0.00",
      feesTotalUsdt: formatUsdt(feeAcct?.balance ?? 0n),
      feesMonthUsdt: formatUsdt(feeMonth._sum.amount ?? 0n),
      openRiskAlerts: openFlags,
      openComplianceCases: openCases,
      kycQueue: pendingKyc,
      pendingApprovals,
      pendingPayments,
      openDisputes,
      reconciliation: recon ? { ok: recon.ok, exceptions: recon.exceptions.length, ranAt: recon.ranAt } : null,
    };
  }

  // ── users ──────────────────────────────────────────────────────────────────
  async users(q: { q?: string; status?: string; cursor?: string; limit: number }) {
    const where: Prisma.UserWhereInput = {
      ...(q.status ? { status: q.status as AccountStatus } : {}),
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: "insensitive" } }, { displayName: { contains: q.q, mode: "insensitive" } }, { id: q.q }] } : {}),
    };
    const rows = await this.prisma.user.findMany({
      where,
      include: { roles: true, kyc: { select: { status: true, riskLevel: true } }, stats: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        status: u.status,
        roles: u.roles.map((r) => r.role),
        kycStatus: u.kyc?.status ?? "NOT_STARTED",
        riskLevel: u.kyc?.riskLevel ?? null,
        completedTrades: u.stats?.completedTrades ?? 0,
        emailVerified: !!u.emailVerifiedAt,
        phoneVerified: !!u.phoneVerifiedAt,
        mfaEnabled: !!u.mfaEnabledAt,
        createdAt: u.createdAt.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  async user(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: true,
        kyc: { include: { events: { orderBy: { createdAt: "desc" }, take: 20 } } },
        stats: true,
        bankAccounts: { where: { deletedAt: null } },
        devices: { orderBy: { lastSeenAt: "desc" }, take: 10 },
      },
    });
    if (!u) throw Errors.notFound("USER");
    const [flags, logins, balances] = await Promise.all([
      this.prisma.riskFlag.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
      this.prisma.loginEvent.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
      this.prisma.ledgerAccount.findMany({ where: { userId: id } }),
    ]);
    const k = u.kyc;
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      locale: u.locale,
      phone: u.phoneE164,
      status: u.status,
      statusReason: u.statusReason,
      roles: u.roles.map((r) => r.role),
      mfaEnabled: !!u.mfaEnabledAt,
      createdAt: u.createdAt.toISOString(),
      kyc: k && {
        id: k.id,
        status: k.status,
        legalName: k.legalFirstName ? `${k.legalFirstName} ${k.legalLastName}` : null,
        dateOfBirth: k.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        residencyCountry: k.residencyCountry,
        address: k.city ? `${k.street} ${k.houseNumber}, ${k.city} ${k.postalCode}` : null,
        occupation: k.occupation,
        expectedVolume: k.expectedVolume,
        sourceOfFunds: k.sourceOfFunds,
        selfDeclaredPep: k.selfDeclaredPep,
        sanctionsHit: k.sanctionsHit,
        pepHit: k.pepHit,
        riskLevel: k.riskLevel,
        documentVerified: k.documentVerified,
        livenessVerified: k.livenessVerified,
        provider: k.provider,
        reviewNote: k.reviewNote,
        events: k.events.map((e) => ({ from: e.fromStatus, to: e.toStatus, actorType: e.actorType, note: e.note, at: e.createdAt.toISOString() })),
      },
      stats: u.stats && { completed: u.stats.completedTrades, finished: u.stats.finishedTrades, bought: formatUsdt(u.stats.boughtUsdt), sold: formatUsdt(u.stats.soldUsdt), fees: formatUsdt(u.stats.feesPaidUsdt) },
      balances: Object.fromEntries(balances.map((b) => [b.kind, formatUsdt(b.balance)])),
      bankAccounts: u.bankAccounts.map((b) => ({ id: b.id, bankCode: b.bankCode, branch: b.branchNumber, last4: b.accountLast4, holderName: b.holderName, status: b.status, nameMatchesKyc: b.nameMatchesKyc })),
      devices: u.devices.map((d) => ({ id: d.id, name: d.name, lastSeenAt: d.lastSeenAt.toISOString(), lastIp: d.lastIp })),
      riskFlags: flags.map((f) => ({ id: f.id, type: f.type, severity: f.severity, resolvedAt: f.resolvedAt?.toISOString() ?? null, createdAt: f.createdAt.toISOString() })),
      logins: logins.map((l) => ({ success: l.success, reason: l.reason, ip: l.ip, newDevice: l.newDevice, at: l.createdAt.toISOString() })),
    };
  }

  async setUserStatus(staff: AuthUser, id: string, status: AccountStatus, reason: string, ctx: RequestContext) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { roles: true } });
    if (!u) throw Errors.notFound("USER");
    if (u.roles.some((r) => r.role === "SUPER_ADMIN") && !staff.roles.includes("SUPER_ADMIN")) throw Errors.forbidden();
    if (!canAccountTransition(u.status, status)) throw new AppError("INVALID_STATUS_TRANSITION", 409);
    await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id }, data: { status, statusReason: reason } });
      if (status === "SUSPENDED" || status === "CLOSED") {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: `account_${status.toLowerCase()}` } });
      }
      if (status !== "ACTIVE") {
        await tx.offer.updateMany({ where: { ownerId: id, status: "ACTIVE" }, data: { status: "PAUSED" } });
      }
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "user.status_changed", entityType: "User", entityId: id, data: { from: u.status, to: status, reason }, ctx });
    });
    return { ok: true };
  }

  /** Granting staff roles: ADMIN/SUPER_ADMIN grants go through four-eyes approval. */
  async setUserRoles(staff: AuthUser, id: string, roles: Role[], ctx: RequestContext) {
    const next = [...new Set<Role>(["USER", ...roles])];
    const privileged = next.some((r) => r === "ADMIN" || r === "SUPER_ADMIN");
    if (privileged) {
      const r = await this.prisma.tx((tx) => this.approvals.request(tx, "ROLE_GRANT_PRIVILEGED", id, { userId: id, roles: next }, staff.id, `Grant ${next.join(", ")}`));
      return { pendingApproval: true, approvalId: r.id };
    }
    await this.applyRoles(id, next, staff.id, ctx);
    return { pendingApproval: false };
  }

  private async applyRoles(userId: string, roles: Role[], byId: string, ctx?: RequestContext) {
    await this.prisma.tx(async (tx) => {
      const before = await tx.userRole.findMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({ data: roles.map((role) => ({ userId, role, grantedById: byId })) });
      // Staff sessions must re-authenticate with MFA under the new role set.
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: "roles_changed" } });
      await this.audit.record(tx, { actorType: "STAFF", actorId: byId, action: "user.roles_changed", entityType: "User", entityId: userId, data: { before: before.map((r) => r.role), after: roles }, ctx });
    });
  }

  async employees() {
    const rows = await this.prisma.user.findMany({
      where: { roles: { some: { role: { in: [...STAFF_ROLES] } } } },
      include: { roles: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, roles: u.roles.map((r) => r.role), mfaEnabled: !!u.mfaEnabledAt, status: u.status, lastSeenAt: u.lastSeenAt?.toISOString() ?? null }));
  }

  // ── KYC queue ──────────────────────────────────────────────────────────────
  async kycQueue(status = "IN_REVIEW") {
    const rows = await this.prisma.kycProfile.findMany({
      where: { status: status as never },
      include: { user: { select: { id: true, email: true, displayName: true } } },
      orderBy: { submittedAt: "asc" },
      take: 200,
    });
    return rows.map((k) => ({
      id: k.id,
      user: k.user,
      status: k.status,
      legalName: `${k.legalFirstName ?? ""} ${k.legalLastName ?? ""}`.trim(),
      riskLevel: k.riskLevel,
      sanctionsHit: k.sanctionsHit,
      pepHit: k.pepHit || k.selfDeclaredPep,
      residencyCountry: k.residencyCountry,
      reviewNote: k.reviewNote,
      submittedAt: k.submittedAt?.toISOString() ?? null,
    }));
  }

  // ── trades ─────────────────────────────────────────────────────────────────
  async tradesList(q: { q?: string; status?: string; cursor?: string; limit: number }) {
    const where: Prisma.TradeWhereInput = {
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.q ? { OR: [{ reference: q.q.toUpperCase() }, { paymentReference: q.q.toUpperCase() }, { id: q.q }, { buyerId: q.q }, { sellerId: q.q }] } : {}),
    };
    const rows = await this.prisma.trade.findMany({
      where,
      include: { buyer: { select: { displayName: true } }, seller: { select: { displayName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((t) => ({
        id: t.id,
        reference: t.reference,
        status: t.status,
        buyer: t.buyer.displayName,
        seller: t.seller.displayName,
        amountUsdt: formatUsdt(t.amountUsdt),
        fiatIls: formatIls(t.fiatAgorot),
        feeUsdt: formatUsdt(t.feeUsdt),
        requiresReleaseReview: t.requiresReleaseReview,
        paymentDeadline: t.paymentDeadline?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
    };
  }

  async tradeDetail(staff: AuthUser, id: string) {
    const dto = await this.trades.get(staff, id, true);
    const [ops, flags, cases, payment] = await Promise.all([
      this.prisma.escrowOperation.findMany({ where: { tradeId: id }, orderBy: { createdAt: "asc" } }),
      this.prisma.riskFlag.findMany({ where: { tradeId: id } }),
      this.prisma.complianceCase.findMany({ where: { tradeId: id } }),
      this.prisma.payment.findUnique({ where: { tradeId: id } }),
    ]);
    return {
      trade: dto,
      escrowOps: ops.map((o) => ({ id: o.id, type: o.type, status: o.status, amountUsdt: formatUsdt(o.amountUsdt), attempts: o.attempts, providerRef: o.providerRef, error: o.error, createdAt: o.createdAt.toISOString() })),
      riskFlags: flags.map((f) => ({ id: f.id, type: f.type, severity: f.severity, resolvedAt: f.resolvedAt?.toISOString() ?? null })),
      cases: cases.map((c) => ({ id: c.id, type: c.type, status: c.status, summary: c.summary })),
      payment: payment && { status: payment.status, reference: payment.reference, amountIls: formatIls(payment.amountAgorot), buyerNote: payment.buyerNote, reconciledAt: payment.reconciledAt?.toISOString() ?? null },
    };
  }

  async requestCancelFrozen(staff: AuthUser, tradeId: string, reason: string) {
    const t = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (t?.status !== "FROZEN") throw new AppError("TRADE_NOT_FROZEN", 409);
    const r = await this.prisma.tx((tx) => this.approvals.request(tx, "FROZEN_TRADE_CANCEL", tradeId, { tradeId, reason }, staff.id, reason));
    return { pendingApproval: true, approvalId: r.id };
  }

  // ── compliance ─────────────────────────────────────────────────────────────
  async riskFlags(open = true) {
    const rows = await this.prisma.riskFlag.findMany({ where: open ? { resolvedAt: null } : {}, orderBy: [{ createdAt: "desc" }], take: 200 });
    return rows.map((f) => ({ ...f, createdAt: f.createdAt.toISOString(), resolvedAt: f.resolvedAt?.toISOString() ?? null }));
  }

  async resolveFlag(staff: AuthUser, id: string, resolution: string, ctx: RequestContext) {
    await this.prisma.tx(async (tx) => {
      await tx.riskFlag.update({ where: { id }, data: { resolvedAt: new Date(), resolvedById: staff.id, resolution } });
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "risk_flag.resolved", entityType: "RiskFlag", entityId: id, data: { resolution }, ctx });
    });
    return { ok: true };
  }

  async cases(status?: string) {
    const rows = await this.prisma.complianceCase.findMany({
      where: status ? { status: status as CaseStatus } : { status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } },
      include: { notes: { orderBy: { createdAt: "asc" } } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 200,
    });
    return rows.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), closedAt: c.closedAt?.toISOString() ?? null }));
  }

  async updateCase(staff: AuthUser, id: string, p: { status?: CaseStatus; note?: string }, ctx: RequestContext) {
    await this.prisma.tx(async (tx) => {
      const closing = p.status === "CLOSED_NO_ACTION" || p.status === "CLOSED_REPORTED";
      if (p.status) await tx.complianceCase.update({ where: { id }, data: { status: p.status, assignedToId: staff.id, ...(closing ? { closedAt: new Date() } : {}) } });
      if (p.note) await tx.complianceCaseNote.create({ data: { caseId: id, authorId: staff.id, body: p.note } });
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "compliance_case.updated", entityType: "ComplianceCase", entityId: id, data: p, ctx });
    });
    return { ok: true };
  }

  // ── configuration ──────────────────────────────────────────────────────────
  async setRiskRules(staff: AuthUser, rules: RiskRules, ctx: RequestContext) {
    if (parseIls(rules.dailyLimitIls) > parseIls(rules.monthlyLimitIls)) throw new AppError("DAILY_EXCEEDS_MONTHLY", 422);
    await this.prisma.tx(async (tx) => {
      const before = await this.config.riskRules(tx);
      await this.config.set(tx, "risk.rules", rules, staff.id);
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "config.risk_rules", entityType: "SystemConfig", entityId: "risk.rules", data: { before, after: rules }, ctx });
    });
    return this.config.riskRules();
  }

  async setTradingSettings(staff: AuthUser, s: Partial<TradingSettings>, ctx: RequestContext) {
    const next = { ...(await this.config.tradingSettings()), ...s };
    if (next.disputeAfterMinutes < 0 || next.disputeAfterMinutes > 240) throw new AppError("INVALID_SETTING", 422);
    parseUsdt(next.autoWithdrawalLimitUsdt);
    await this.prisma.tx(async (tx) => {
      await this.config.set(tx, "trading.settings", next, staff.id);
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "config.trading_settings", entityType: "SystemConfig", entityId: "trading.settings", data: next as unknown as Record<string, unknown>, ctx });
    });
    return next;
  }

  async commissionHistory() {
    const rows = await this.prisma.commissionConfig.findMany({ orderBy: { effectiveFrom: "desc" }, take: 50 });
    return rows.map((r) => ({ id: r.id, rateBps: r.rateBps, minUsdt: formatUsdt(r.minUsdt), maxUsdt: formatUsdt(r.maxUsdt), payer: r.payer, note: r.note, effectiveFrom: r.effectiveFrom.toISOString(), createdById: r.createdById }));
  }

  /** New commission version (applies to trades started from now on; open trades keep their snapshot). */
  async setCommission(staff: AuthUser, p: { rateBps: number; minUsdt: string; maxUsdt: string; payer: "BUYER" | "SELLER" | "SPLIT"; note: string }, ctx: RequestContext) {
    const min = parseUsdt(p.minUsdt === "0" ? "0" : p.minUsdt);
    const max = parseUsdt(p.maxUsdt);
    if (min > max) throw new AppError("MIN_EXCEEDS_MAX", 422);
    await this.prisma.tx(async (tx) => {
      const c = await tx.commissionConfig.create({ data: { rateBps: p.rateBps, minUsdt: min, maxUsdt: max, payer: p.payer, note: p.note, createdById: staff.id } });
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "config.commission", entityType: "CommissionConfig", entityId: c.id, data: p, ctx });
    });
    return this.commissionHistory();
  }

  async paymentMethods() {
    return this.prisma.paymentMethodConfig.findMany({ orderBy: { displayOrder: "asc" } });
  }

  async togglePaymentMethod(staff: AuthUser, code: string, enabled: boolean, note: string, ctx: RequestContext) {
    if (enabled && (code === "BIT" || code === "PAYBOX") && !note.toLowerCase().includes("terms")) {
      throw new AppError("CONFIRM_PROVIDER_TERMS", 422, "Record in the note that the provider's terms permit this use (e.g. 'terms confirmed: …')");
    }
    await this.prisma.tx(async (tx) => {
      await tx.paymentMethodConfig.update({ where: { code: code as never }, data: { enabled, note, updatedById: staff.id } });
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "config.payment_method", entityType: "PaymentMethodConfig", entityId: code, data: { enabled, note }, ctx });
    });
    return this.paymentMethods();
  }

  async networks() {
    const rows = await this.prisma.networkConfig.findMany();
    return rows.map((n) => ({ ...n, withdrawalFeeUsdt: formatUsdt(n.withdrawalFeeUsdt), minWithdrawalUsdt: formatUsdt(n.minWithdrawalUsdt) }));
  }

  async toggleNetwork(staff: AuthUser, code: string, enabled: boolean, note: string, ctx: RequestContext) {
    const n = await this.prisma.networkConfig.findUnique({ where: { code: code as never } });
    if (!n) throw Errors.notFound("NETWORK");
    if (enabled && !n.tokenContract) throw new AppError("TOKEN_CONTRACT_REQUIRED", 422);
    await this.prisma.tx(async (tx) => {
      await tx.networkConfig.update({ where: { code: code as never }, data: { enabled, note, updatedById: staff.id } });
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "config.network", entityType: "NetworkConfig", entityId: code, data: { enabled, note }, ctx });
    });
    return this.networks();
  }

  async gates() {
    return { tradingMode: env.TRADING_MODE, gates: await this.config.gates(), allSatisfied: await this.config.allGatesSatisfied() };
  }

  async setGate(staff: AuthUser, gate: string, value: boolean, evidence: string, ctx: RequestContext) {
    if (!(PRODUCTION_GATES as readonly string[]).includes(gate)) throw new AppError("UNKNOWN_GATE", 422);
    await this.prisma.tx(async (tx) => {
      await this.config.set(tx, gate, { value, evidence, by: staff.id, at: new Date().toISOString() }, staff.id);
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "config.gate", entityType: "SystemConfig", entityId: gate, data: { value, evidence }, ctx });
    });
    return this.gates();
  }

  // ── announcements ──────────────────────────────────────────────────────────
  async announcements() {
    return this.prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  }

  async createAnnouncement(staff: AuthUser, p: { title: object; body: object; severity: string; publish: boolean }, ctx: RequestContext) {
    const a = await this.prisma.tx(async (tx) => {
      const row = await tx.announcement.create({ data: { title: p.title, body: p.body, severity: p.severity, createdById: staff.id, publishedAt: p.publish ? new Date() : null } });
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "announcement.created", entityType: "Announcement", entityId: row.id, ctx });
      return row;
    });
    return a;
  }

  async archiveAnnouncement(id: string) {
    await this.prisma.announcement.update({ where: { id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }

  // ── revenue & reports ──────────────────────────────────────────────────────
  /** Daily fee revenue from the ledger (source of truth), last `days` days, Asia/Jerusalem dates. */
  async revenue(days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.$queryRaw<{ day: string; fees: bigint; trades: bigint }[]>`
      SELECT to_char(timezone('Asia/Jerusalem', l."createdAt"), 'YYYY-MM-DD') AS day,
             SUM(l.amount)::bigint AS fees,
             COUNT(*)::bigint AS trades
      FROM "LedgerLine" l JOIN "LedgerAccount" a ON a.id = l."accountId"
      WHERE a.key = ${platformKey("PLATFORM_FEE_REVENUE")} AND l."createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`;
    const total = rows.reduce((s, r) => s + r.fees, 0n);
    return { days, totalUsdt: formatUsdt(total), series: rows.map((r) => ({ day: r.day, feesUsdt: formatUsdt(r.fees), trades: Number(r.trades) })) };
  }

  async exportCsv(kind: "trades" | "fees" | "ledger", from?: string, to?: string): Promise<string> {
    const gte = from ? new Date(from) : new Date(Date.now() - 31 * 86_400_000);
    const lte = to ? new Date(to) : new Date();
    if (kind === "trades") {
      const rows = await this.prisma.trade.findMany({ where: { createdAt: { gte, lte } }, orderBy: { createdAt: "asc" }, take: 50_000 });
      return csv([
        ["reference", "status", "created_at", "completed_at", "buyer_id", "seller_id", "amount_usdt", "price_ils", "fiat_ils", "fee_usdt", "fee_payer", "fee_bps", "settlement_basis", "sandbox"],
        ...rows.map((t) => [t.reference, t.status, t.createdAt.toISOString(), t.completedAt?.toISOString() ?? null, t.buyerId, t.sellerId, formatUsdt(t.amountUsdt), (Number(t.priceE4) / 10_000).toFixed(4), formatIls(t.fiatAgorot), formatUsdt(t.feeUsdt), t.feePayer, t.feeRateBps, t.settlementBasis, String(t.sandbox)]),
      ]);
    }
    const where: Prisma.LedgerLineWhereInput = { createdAt: { gte, lte }, ...(kind === "fees" ? { account: { key: platformKey("PLATFORM_FEE_REVENUE") } } : {}) };
    const lines = await this.prisma.ledgerLine.findMany({ where, include: { entry: true, account: { select: { key: true } } }, orderBy: { createdAt: "asc" }, take: 100_000 });
    return csv([
      ["created_at", "entry_id", "type", "reference_type", "reference_id", "account", "amount_usdt", "description"],
      ...lines.map((l) => [l.createdAt.toISOString(), l.entryId, l.entry.type, l.entry.referenceType, l.entry.referenceId, l.account.key, formatUsdt(l.amount), l.entry.description]),
    ]);
  }

  async auditLog(q: { q?: string; cursor?: string; limit: number }) {
    const rows = await this.prisma.auditEvent.findMany({
      where: q.q ? { OR: [{ action: { contains: q.q } }, { entityId: q.q }, { actorId: q.q }] } : {},
      orderBy: { id: "desc" },
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: BigInt(q.cursor) }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return {
      items: page.map((e) => ({ id: e.id.toString(), actorType: e.actorType, actorId: e.actorId, action: e.action, entityType: e.entityType, entityId: e.entityId, ip: e.ip, data: e.data, digest: e.hash.slice(0, 12), createdAt: e.createdAt.toISOString() })),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id.toString() : null,
    };
  }

  verifyAudit() {
    return this.audit.verifyChain();
  }

  reconciliation() {
    return this.recon.run();
  }

  /**
   * Imports bank statement lines (CSV: date,amount,reference,payer_name) and matches them to awaiting
   * payments by platform reference + exact amount. In production this feed comes from a licensed
   * open-banking provider; in sandbox staff paste CSV.
   */
  async importStatement(staff: AuthUser, csvText: string, ctx: RequestContext) {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let imported = 0;
    let matched = 0;
    for (const line of lines) {
      const [date, amount, reference, payerName] = line.split(",").map((s) => s?.trim() ?? "");
      if (!date || !amount || !reference || date.toLowerCase() === "date") continue;
      let agorot: bigint;
      try {
        agorot = parseIls(amount);
      } catch {
        continue;
      }
      const ref = reference.toUpperCase().match(/WX[2-9A-HJ-NP-Z]{6}/)?.[0] ?? reference.toUpperCase();
      const row = await this.prisma.bankStatementLine.create({ data: { source: "CSV_IMPORT", amountAgorot: agorot, reference: ref, payerName: payerName || null, valueDate: new Date(date), importedById: staff.id } });
      imported++;
      const payment = await this.prisma.payment.findFirst({ where: { reference: ref, amountAgorot: agorot, status: { in: ["MARKED_SENT", "AWAITING", "CONFIRMED_BY_SELLER"] } } });
      if (payment) {
        await this.prisma.tx(async (tx) => {
          await tx.payment.update({ where: { id: payment.id }, data: { status: "RECONCILED", reconciledAt: new Date(), reconciliationSource: "CSV_IMPORT" } });
          await tx.bankStatementLine.update({ where: { id: row.id }, data: { matchedPaymentId: payment.id } });
        });
        matched++;
      }
    }
    await this.audit.recordNow({ actorType: "STAFF", actorId: staff.id, action: "reconciliation.statement_imported", entityType: "BankStatementLine", data: { imported, matched }, ctx });
    return { imported, matched };
  }
}
