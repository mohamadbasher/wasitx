import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { PrismaService } from "../src/common/prisma.service.js";
import { ReconciliationService } from "../src/modules/jobs/reconciliation.service.js";
import type { JobsService } from "../src/modules/jobs/jobs.service.js";
import { TradesService } from "../src/modules/trades/trades.service.js";
import { bootApp, deposit, idem, sellOffer, settle, staffUser, take, verifiedUser, type Api } from "./helpers.js";

let app: NestExpressApplication;
let http: () => Api;
let prisma: PrismaService;
let jobs: JobsService;

beforeAll(async () => {
  ({ app, http, prisma, jobs } = await bootApp());
});
afterAll(async () => app?.close());

describe("concurrency & stale prices", () => {
  it("never oversells an offer under parallel takes", async () => {
    const seller = await verifiedUser(http);
    await deposit(seller, "1000");
    const offer = await sellOffer(seller, { amount: "1000", price: "3.7", min: "100", max: "10000" });
    const buyers = await Promise.all(Array.from({ length: 8 }, () => verifiedUser(http)));

    // every buyer races for 150 USDT at the same displayed version; only one can match the version
    // at a time, so losers get OFFER_CHANGED and retry with the fresh version — like a real client.
    const results = await Promise.all(
      buyers.map(async (b) => {
        for (let attempt = 0; attempt < 10; attempt++) {
          const o = await http().get(`/api/v1/offers/${offer.id}`);
          if (o.body.status !== "ACTIVE") return o.body.status;
          const r = await take(b, o.body, "150");
          if (r.status === 201) return "OK";
          if (r.body.code !== "OFFER_CHANGED" && r.body.code !== "OFFER_UNAVAILABLE") return r.body.code;
        }
        return "GAVE_UP";
      }),
    );
    expect(results.filter((r) => r === "OK"), JSON.stringify(results)).toHaveLength(6); // 6 × 150 = 900 ≤ 1000 < 7 × 150
    const o = await http().get(`/api/v1/offers/${offer.id}`).expect(200);
    expect(o.body.remainingUsdt).toBe("100.00");
    expect(o.body.status).toBe("ACTIVE"); // 100 USDT × ₪3.7 = ₪370 ≥ min order ₪100, so still takeable
  });

  it("rejects a take quoted at a price the seller has since changed", async () => {
    const seller = await verifiedUser(http);
    const buyer = await verifiedUser(http);
    await deposit(seller, "500");
    const offer = await sellOffer(seller, { amount: "500", price: "3.70" });
    await seller.call("patch", `/offers/${offer.id}`, { priceIls: "3.95", version: offer.version }).expect(200);
    const r = await take(buyer, offer, "100").expect(409);
    expect(r.body.code).toBe("OFFER_CHANGED");
    expect(r.body.details.priceIls).toBe("3.95");
  });

  it("does not allow taking your own offer", async () => {
    const seller = await verifiedUser(http);
    await deposit(seller, "300");
    const offer = await sellOffer(seller, { amount: "300" });
    const r = await take(seller, offer, "100").expect(422);
    expect(r.body.code).toBe("CANNOT_TAKE_OWN_OFFER");
  });
});

describe("expiry & cancellation", () => {
  it("expires unpaid trades, returns escrow to the offer and cancels the custody hold", async () => {
    const seller = await verifiedUser(http);
    const buyer = await verifiedUser(http);
    await deposit(seller, "400");
    const offer = await sellOffer(seller, { amount: "400" });
    const t = await take(buyer, offer, "100").expect(201);
    await prisma.trade.update({ where: { id: t.body.id }, data: { paymentDeadline: new Date(Date.now() - 60_000) } });
    // the shared test DB may hold other overdue trades from earlier runs — assert on this trade only
    expect(await app.get(TradesService).expireOverdue()).toBeGreaterThanOrEqual(1);
    await settle(jobs);
    const after = await buyer.call("get", `/trades/${t.body.id}`).expect(200);
    expect(after.body.status).toBe("EXPIRED");
    const bal = await seller.call("get", "/wallet/balances").expect(200);
    expect(bal.body).toMatchObject({ reservedInOffers: "400.00", inEscrow: "0.00", reconciled: true });
    const hold = await prisma.escrowOperation.findFirst({ where: { tradeId: t.body.id, type: "CANCEL_HOLD" } });
    expect(hold?.status).toBe("CONFIRMED");
  });

  it("never expires a trade the buyer marked as paid", async () => {
    const seller = await verifiedUser(http);
    const buyer = await verifiedUser(http);
    await deposit(seller, "200");
    const offer = await sellOffer(seller, { amount: "200" });
    const t = await take(buyer, offer, "100").expect(201);
    await buyer.call("post", `/trades/${t.body.id}/mark-paid`, { paidFromOwnAccount: true }, { "Idempotency-Key": idem() }).expect(200);
    await prisma.trade.update({ where: { id: t.body.id }, data: { paymentDeadline: new Date(Date.now() - 3600_000) } });
    await app.get(TradesService).expireOverdue();
    const still = await buyer.call("get", `/trades/${t.body.id}`).expect(200);
    expect(still.body.status).toBe("BUYER_MARKED_PAID");
  });

  it("lets the buyer cancel before paying but never the seller after escrow", async () => {
    const seller = await verifiedUser(http);
    const buyer = await verifiedUser(http);
    await deposit(seller, "200");
    const offer = await sellOffer(seller, { amount: "200" });
    const t = await take(buyer, offer, "100").expect(201);
    await seller.call("post", `/trades/${t.body.id}/cancel`, { reason: "changed my mind" }, { "Idempotency-Key": idem() }).expect(403);
    const c = await buyer.call("post", `/trades/${t.body.id}/cancel`, { reason: "changed my mind" }, { "Idempotency-Key": idem() }).expect(200);
    expect(c.body.status).toBe("CANCELLED");
    const o = await http().get(`/api/v1/offers/${offer.id}`).expect(200);
    expect(o.body.remainingUsdt).toBe("200.00");
  });
});

describe("disputes and four-eyes approval", () => {
  it("resolves small disputes directly and requires a second approver above the threshold", async () => {
    const manager = await staffUser(http, prisma, ["DISPUTE_MANAGER"]);
    const manager2 = await staffUser(http, prisma, ["DISPUTE_MANAGER"]);

    // small trade → direct refund to seller
    const seller = await verifiedUser(http);
    const buyer = await verifiedUser(http);
    await deposit(seller, "5000");
    const offer = await sellOffer(seller, { amount: "5000", price: "3.5", max: "20000" });
    const small = await take(buyer, offer, "100").expect(201);
    await buyer.call("post", `/trades/${small.body.id}/mark-paid`, { paidFromOwnAccount: true }, { "Idempotency-Key": idem() }).expect(200);
    // buyer must wait before disputing; seller may dispute at once
    const early = await buyer.call("post", `/trades/${small.body.id}/dispute`, { reason: "PAID_BUT_NOT_CONFIRMED", description: "I paid twenty minutes ago and nothing happened" }).expect(409);
    expect(early.body.code).toBe("DISPUTE_TOO_EARLY");
    const d1 = await seller.call("post", `/trades/${small.body.id}/dispute`, { reason: "PAYMENT_NOT_RECEIVED", description: "No transfer arrived in my Hapoalim account" }).expect(201);
    const r1 = await manager.call("post", `/admin/disputes/${d1.body.id}/resolve`, { outcome: "REFUND_TO_SELLER", findings: "Bank statement shows no incoming transfer" }).expect(200);
    expect(r1.body.pendingApproval).toBe(false);
    await settle(jobs);
    const st = await buyer.call("get", `/trades/${small.body.id}`).expect(200);
    expect(st.body.status).toBe("CANCELLED");

    // big trade (≥ 2000 USDT dual-approval threshold). New accounts are capped at ₪5,000/trade, so age them.
    const current = (await http().get(`/api/v1/offers/${offer.id}`).expect(200)).body;
    const blocked = await take(buyer, current, "2500").expect(422);
    expect(blocked.body.code).toBe("LIMIT_NEW_ACCOUNT");
    await prisma.user.updateMany({ where: { id: { in: [buyer.id, seller.id] } }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
    const fresh = (await http().get(`/api/v1/offers/${offer.id}`).expect(200)).body;
    const big = await take(buyer, fresh, "2500").expect(201); // ₪8,750 < ₪15,000 review threshold → straight to escrow
    expect(big.body.status).toBe("AWAITING_FIAT_PAYMENT");
    await buyer.call("post", `/trades/${big.body.id}/mark-paid`, { paidFromOwnAccount: true }, { "Idempotency-Key": idem() }).expect(200);
    const d2 = await seller.call("post", `/trades/${big.body.id}/dispute`, { reason: "WRONG_AMOUNT", description: "Received a different amount than the trade total" }).expect(201);
    const r2 = await manager.call("post", `/admin/disputes/${d2.body.id}/resolve`, { outcome: "RELEASE_TO_BUYER", findings: "Statement shows the full amount arrived on time" }).expect(200);
    expect(r2.body.pendingApproval).toBe(true);
    const self = await manager.call("post", `/admin/approvals/${r2.body.approvalId}/approve`, {}).expect(403);
    expect(self.body.code).toBe("DUAL_APPROVAL_SAME_PERSON");
    const still = await buyer.call("get", `/trades/${big.body.id}`).expect(200);
    expect(still.body.status).toBe("DISPUTED");
    await manager2.call("post", `/admin/approvals/${r2.body.approvalId}/approve`, { note: "Agree with findings" }).expect(200);
    await settle(jobs);
    const final = await buyer.call("get", `/trades/${big.body.id}`).expect(200);
    expect(final.body.status).toBe("COMPLETED");
    const bal = await buyer.call("get", "/wallet/balances").expect(200);
    expect(bal.body.available).toBe("2481.25"); // 2500 − 0.75% fee (18.75)
  });
});

describe("chat safety → compliance review before release", () => {
  it("flags payment-redirection, masks account numbers for the counterparty and holds release for review", async () => {
    const officer = await staffUser(http, prisma, ["COMPLIANCE_OFFICER"]);
    const seller = await verifiedUser(http);
    const buyer = await verifiedUser(http);
    await deposit(seller, "300");
    const offer = await sellOffer(seller, { amount: "300" });
    const t = await take(buyer, offer, "100").expect(201);
    const m = await seller.call("post", `/trades/${t.body.id}/messages`, { body: "please pay to my brother account 12-345-678901 instead" }).expect(201);
    expect(m.body.riskSignals).toEqual(expect.arrayContaining(["THIRD_PARTY_PAYMENT", "ACCOUNT_NUMBER"]));
    const seen = await buyer.call("get", `/trades/${t.body.id}/messages`).expect(200);
    const msg = seen.body.find((x: { id: string }) => x.id === m.body.id);
    expect(msg.body).not.toContain("678901");
    expect(msg.body).toContain("8901");

    await buyer.call("post", `/trades/${t.body.id}/mark-paid`, { paidFromOwnAccount: true }, { "Idempotency-Key": idem() }).expect(200);
    const c = await seller.call("post", `/trades/${t.body.id}/confirm-receipt`, { receivedFullAmount: true, senderNameMatches: true }, { "Idempotency-Key": idem() }).expect(200);
    expect(c.body.status).toBe("SELLER_CONFIRMED_RECEIPT"); // held: chat risk signals
    await officer.call("post", `/admin/trades/${t.body.id}/compliance-approve`, { note: "Buyer paid the platform-issued account; verified" }).expect(200);
    await settle(jobs);
    const done = await buyer.call("get", `/trades/${t.body.id}`).expect(200);
    expect(done.body.status).toBe("COMPLETED");
  });

  it("freezes and unfreezes a trade (compliance only)", async () => {
    const officer = await staffUser(http, prisma, ["COMPLIANCE_OFFICER"]);
    const support = await staffUser(http, prisma, ["SUPPORT_AGENT"]);
    const seller = await verifiedUser(http);
    const buyer = await verifiedUser(http);
    await deposit(seller, "200");
    const offer = await sellOffer(seller, { amount: "200" });
    const t = await take(buyer, offer, "100").expect(201);
    await support.call("post", `/admin/trades/${t.body.id}/freeze`, { reason: "suspicious" }).expect(403);
    await officer.call("post", `/admin/trades/${t.body.id}/freeze`, { reason: "Suspicious login pattern" }).expect(200);
    const fz = await buyer.call("get", `/trades/${t.body.id}`).expect(200);
    expect(fz.body).toMatchObject({ status: "FROZEN", frozenFrom: "AWAITING_FIAT_PAYMENT", availableActions: [] });
    await buyer.call("post", `/trades/${t.body.id}/mark-paid`, { paidFromOwnAccount: true }, { "Idempotency-Key": idem() }).expect(409);
    await officer.call("post", `/admin/trades/${t.body.id}/unfreeze`, { reason: "Cleared after review" }).expect(200);
    const back = await buyer.call("get", `/trades/${t.body.id}`).expect(200);
    expect(back.body.status).toBe("AWAITING_FIAT_PAYMENT");
  });
});

describe("authorization", () => {
  it("blocks non-staff from admin, and staff without MFA", async () => {
    const user = await verifiedUser(http, { kyc: false });
    const r = await user.call("get", "/admin/overview").expect(403);
    expect(r.body.code).toBe("FORBIDDEN");
    await prisma.userRole.create({ data: { userId: user.id, role: "SUPPORT_AGENT" } });
    const r2 = await user.call("get", "/admin/overview").expect(403);
    expect(r2.body.code).toBe("STAFF_MFA_REQUIRED");
  });

  it("requires KYC before offering, and a CSRF token for cookie sessions", async () => {
    const user = await verifiedUser(http, { kyc: false });
    const r = await user.call("post", "/offers", { side: "BUY", amountUsdt: "100", priceIls: "3.6", minOrderIls: "100", maxOrderIls: "300", paymentMethod: "IL_BANK_TRANSFER", expiresInHours: 2 }).expect(403);
    expect(r.body.code).toBe("NOT_ELIGIBLE_TO_TRADE");
    expect(r.body.details).toContain("KYC_NOT_APPROVED");

    const agent = (await import("supertest")).default.agent(app.getHttpServer());
    await agent.post("/api/v1/auth/login").send({ email: user.email, password: "correct horse battery staple" }).expect(200);
    const noCsrf = await agent.post("/api/v1/auth/logout-all").expect(403);
    expect(noCsrf.body.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("locks the account after repeated bad passwords", async () => {
    const user = await verifiedUser(http, { kyc: false });
    for (let i = 0; i < 5; i++) await http().post("/api/v1/auth/login").send({ email: user.email, password: "wrong-password-123" }).expect(401);
    const r = await http().post("/api/v1/auth/login").send({ email: user.email, password: "correct horse battery staple" }).expect(423);
    expect(r.body.code).toBe("ACCOUNT_TEMPORARILY_LOCKED");
  });

  it("detects refresh-token reuse and revokes the session family", async () => {
    const user = await verifiedUser(http, { kyc: false });
    const login = await http().post("/api/v1/auth/login").set("X-Client", "mobile").send({ email: user.email, password: "correct horse battery staple" }).expect(200);
    const first = login.body.refreshToken;
    const rotated = await http().post("/api/v1/auth/refresh").set("X-Client", "mobile").send({ refreshToken: first }).expect(200);
    await http().post("/api/v1/auth/refresh").set("X-Client", "mobile").send({ refreshToken: first }).expect(401); // reuse
    const r = await http().post("/api/v1/auth/refresh").set("X-Client", "mobile").send({ refreshToken: rotated.body.refreshToken }).expect(401);
    expect(r.body.code).toBe("SESSION_INVALID");
  });
});

describe("ledger integrity (database-enforced)", () => {
  it("refuses direct edits, deletes, balance writes and unbalanced entries", async () => {
    const line = await prisma.ledgerLine.findFirst();
    expect(line).toBeTruthy();
    await expect(prisma.ledgerLine.update({ where: { id: line!.id }, data: { amount: 1n } })).rejects.toThrow(/APPEND_ONLY/);
    await expect(prisma.ledgerLine.delete({ where: { id: line!.id } })).rejects.toThrow(/APPEND_ONLY/);
    const acct = await prisma.ledgerAccount.findFirst({ where: { kind: "USER_AVAILABLE" } });
    await expect(prisma.ledgerAccount.update({ where: { id: acct!.id }, data: { balance: 999_999_999n } })).rejects.toThrow(/LEDGER_BALANCE_DIRECT_WRITE/);
    await expect(
      prisma.$transaction(async (tx) => {
        const e = await tx.journalEntry.create({ data: { type: "ADJUSTMENT", referenceType: "Test", referenceId: "x", idempotencyKey: `test-unbalanced-${Date.now()}`, description: "should fail" } });
        await tx.ledgerLine.create({ data: { entryId: e.id, accountId: acct!.id, amount: 5n } });
      }),
    ).rejects.toThrow(/LEDGER_UNBALANCED/);
    const trade = await prisma.tradeEvent.findFirst();
    await expect(prisma.tradeEvent.delete({ where: { id: trade!.id } })).rejects.toThrow(/APPEND_ONLY/);
  });

  it("reconciles ledger and custodian after everything above", async () => {
    await settle(jobs);
    const r = await app.get(ReconciliationService).run();
    expect(r.exceptions).toEqual([]);
  });
});
