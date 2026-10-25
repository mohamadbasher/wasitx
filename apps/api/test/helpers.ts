import type { NestExpressApplication } from "@nestjs/platform-express";
import { generate } from "otplib";
import request from "supertest";
import { randomBytes, randomUUID } from "node:crypto";
import type { Role } from "@wasitx/shared";
import { createApp } from "../src/main.js";
import { PrismaService } from "../src/common/prisma.service.js";
import { DevOutbox } from "../src/modules/integrations/sandbox/sandbox-guard.js";
import { JobsService } from "../src/modules/jobs/jobs.service.js";

export type Api = ReturnType<typeof request>;

export interface TestUser {
  id: string;
  email: string;
  token: string;
  bankAccountId?: string;
  call: (method: "get" | "post" | "patch" | "put" | "delete", path: string, body?: unknown, headers?: Record<string, string>) => request.Test;
}

let counter = 0;

/** Valid Teudat Zehut: random 8 digits + computed check digit. */
export function israeliId(): string {
  const base = String(10_000_000 + Math.floor(Math.random() * 89_999_999)).slice(0, 8);
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let n = Number(base[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return base + String((10 - (sum % 10)) % 10);
}

export async function bootApp(): Promise<{ app: NestExpressApplication; http: () => Api; prisma: PrismaService; jobs: JobsService }> {
  const app = await createApp();
  await app.init();
  const prisma = app.get(PrismaService);
  await baselineConfig(prisma);
  return { app, http: () => request(app.getHttpServer()), prisma, jobs: app.get(JobsService) };
}

export async function baselineConfig(prisma: PrismaService) {
  for (const [code, enabled] of [["IL_BANK_TRANSFER", true], ["IL_INSTANT_TRANSFER", true], ["BIT", false], ["PAYBOX", false]] as const) {
    await prisma.paymentMethodConfig.upsert({ where: { code }, create: { code, enabled }, update: { enabled } });
  }
  await prisma.networkConfig.upsert({
    where: { code: "TRON_TRC20" },
    create: { code: "TRON_TRC20", enabled: true, label: "TRON (TRC-20)", tokenContract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", withdrawalFeeUsdt: 1_000_000n },
    update: { enabled: true },
  });
}

function caller(http: () => Api, token: string): TestUser["call"] {
  return (method, path, body, headers = {}) => {
    let r = http()[method](`/api/v1${path}`).set("Authorization", `Bearer ${token}`).set("X-Client", "mobile");
    for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
    return body === undefined ? r : r.send(body as object);
  };
}

export const idem = () => randomUUID();

/** Full onboarding through the public API: register → email → phone OTP → KYC (sandbox) → bank account. */
export async function verifiedUser(http: () => Api, opts: { name?: string; kyc?: boolean; bank?: boolean; first?: string; last?: string } = {}): Promise<TestUser> {
  counter++;
  const email = `u${counter}-${randomBytes(3).toString("hex")}@test.local`;
  const first = opts.first ?? `First${counter}`;
  const last = opts.last ?? `Last${randomBytes(2).toString("hex")}`;
  const reg = await http()
    .post("/api/v1/auth/register")
    .set("X-Client", "mobile")
    .send({ email, password: "correct horse battery staple", displayName: opts.name ?? first, locale: "en", acceptTerms: true, confirmAge: true })
    .expect(201);
  const token: string = reg.body.accessToken;
  const call = caller(http, token);
  const me = await call("get", "/auth/me").expect(200);

  const mail = DevOutbox.list(email).find((m) => m.channel === "email")!;
  const emailToken = /token=([A-Za-z0-9_-]+)/.exec(mail.body)![1];
  await http().post("/api/v1/auth/verify-email").send({ token: emailToken }).expect(200);

  const phone = `05${["0", "2", "4"][counter % 3]}${String(randomBytes(4).readUInt32BE() % 10_000_000).padStart(7, "0")}`;
  await call("post", "/auth/phone/start", { phone }).expect(200);
  const e164 = `+972${phone.slice(1)}`;
  const sms = DevOutbox.list(e164)[0]!;
  const code = /(\d{6})/.exec(sms.body)![1];
  await call("post", "/auth/phone/verify", { phone, code }).expect(200);

  const user: TestUser = { id: me.body.id, email, token, call };
  if (opts.kyc === false) return user;
  await call("post", "/kyc/start", {
    legalFirstName: first,
    legalLastName: last,
    nationalId: israeliId(),
    dateOfBirth: "1991-03-02",
    city: "Nazareth",
    street: "Paulus VI",
    houseNumber: "5",
    postalCode: "1600000",
    occupation: "Accountant",
    expectedMonthlyVolumeIls: "UP_TO_10K",
    sourceOfFunds: "SALARY",
    isPep: false,
  }).expect(201);
  await call("post", "/kyc/sandbox/complete", { outcome: "APPROVE" }).expect(200);
  if (opts.bank !== false) {
    const acct = String(100000 + Math.floor(Math.random() * 899999));
    const b = await call("post", "/bank-accounts", { bankCode: "12", branchNumber: "601", accountNumber: acct, holderName: `${first} ${last}` }).expect(201);
    user.bankAccountId = b.body.id;
  }
  return user;
}

export async function deposit(u: TestUser, amount: string) {
  await u.call("post", "/wallet/sandbox/deposit", { network: "TRON_TRC20", amountUsdt: amount }, { "Idempotency-Key": idem() }).expect(200);
}

export async function sellOffer(u: TestUser, p: { amount?: string; price?: string; min?: string; max?: string } = {}) {
  const r = await u
    .call("post", "/offers", {
      side: "SELL",
      amountUsdt: p.amount ?? "1000",
      priceIls: p.price ?? "3.7",
      minOrderIls: p.min ?? "100",
      maxOrderIls: p.max ?? "10000",
      paymentMethod: "IL_BANK_TRANSFER",
      bankAccountId: u.bankAccountId,
      expiresInHours: 24,
    })
    .expect(201);
  return r.body as { id: string; priceIls: string; version: number };
}

export function take(u: TestUser, offer: { id: string; priceIls: string; version: number }, amount: string, key = idem(), extra: object = {}) {
  return u.call("post", "/trades", { offerId: offer.id, amountUsdt: amount, quotedPriceIls: offer.priceIls, quotedVersion: offer.version, acceptFees: true, ...extra }, { "Idempotency-Key": key });
}

/** Creates a staff member with TOTP enrolled and an MFA-verified session. */
export async function staffUser(http: () => Api, prisma: PrismaService, roles: Role[]): Promise<TestUser> {
  const u = await verifiedUser(http, { kyc: false });
  await prisma.userRole.createMany({ data: roles.map((role) => ({ userId: u.id, role })) });
  // fresh login so the session reflects new roles
  const setup = await u.call("post", "/auth/mfa/setup").expect(200);
  const code = await generate({ secret: setup.body.secret });
  await u.call("post", "/auth/mfa/enable", { code }).expect(200);
  const login = await http()
    .post("/api/v1/auth/login")
    .set("X-Client", "mobile")
    .send({ email: u.email, password: "correct horse battery staple", totp: await generate({ secret: setup.body.secret }) })
    .expect(200);
  return { ...u, token: login.body.accessToken, call: caller(http, login.body.accessToken) };
}

/** Lets the outbox and escrow worker run to completion (jobs are disabled in tests). */
export async function settle(jobs: JobsService) {
  for (let i = 0; i < 3; i++) await jobs.drainOutbox();
}
