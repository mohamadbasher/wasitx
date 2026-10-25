import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AuditService } from "../src/modules/audit/audit.service.js";
import { ReconciliationService } from "../src/modules/jobs/reconciliation.service.js";
import type { JobsService } from "../src/modules/jobs/jobs.service.js";
import type { PrismaService } from "../src/common/prisma.service.js";
import { bootApp, deposit, idem, sellOffer, settle, take, verifiedUser, type Api } from "./helpers.js";

let app: NestExpressApplication;
let http: () => Api;
let prisma: PrismaService;
let jobs: JobsService;

beforeAll(async () => {
  ({ app, http, prisma, jobs } = await bootApp());
});
afterAll(async () => app?.close());

describe("full SELL-offer trade lifecycle (sandbox)", () => {
  it("onboards, escrows, settles, charges the disclosed fee and reconciles", async () => {
    const firstAuditId = ((await prisma.auditEvent.findFirst({ orderBy: { id: "desc" } }))?.id ?? 0n) + 1n;
    const seller = await verifiedUser(http, { name: "Seller" });
    const buyer = await verifiedUser(http, { name: "Buyer" });
    await deposit(seller, "1500");

    const me = await buyer.call("get", "/auth/me").expect(200);
    expect(me.body.tier).toBe("VERIFIED_TRADER");
    expect(me.body.ineligibility).toEqual([]);

    const feeBefore = (await prisma.ledgerAccount.findUnique({ where: { key: "platform:PLATFORM_FEE_REVENUE:USDT" } }))?.balance ?? 0n;
    const offer = await sellOffer(seller, { amount: "1000", price: "3.7" });
    let bal = await seller.call("get", "/wallet/balances").expect(200);
    expect(bal.body).toMatchObject({ available: "500.00", reservedInOffers: "1000.00", reconciled: true, source: "SANDBOX_CUSTODY" });

    // fee preview before confirming
    const quote = await http().get(`/api/v1/market/quote?offerId=${offer.id}&amountUsdt=200`).expect(200);
    expect(quote.body).toMatchObject({ fiatAmountIls: "740.00", buyerReceivesUsdt: "198.50", fee: { feeUsdt: "1.50", payer: "BUYER" } });

    const key = idem();
    const t1 = await take(buyer, offer, "200", key).expect(201);
    expect(t1.body.status).toBe("AWAITING_FIAT_PAYMENT");
    expect(t1.body.myRole).toBe("buyer");
    expect(t1.body.paymentInstructions).toMatchObject({ amountIls: "740.00", bankCode: "12" });
    expect(t1.body.paymentInstructions.reference).toMatch(/^WX[2-9A-HJ-NP-Z]{6}$/);
    expect(t1.body.availableActions.sort()).toEqual(["cancel", "mark_paid"]);

    // idempotent replay returns the same trade, no second reservation
    const replay = await take(buyer, offer, "200", key).expect(201);
    expect(replay.body.id).toBe(t1.body.id);
    const off = await http().get(`/api/v1/offers/${offer.id}`).expect(200);
    expect(off.body.remainingUsdt).toBe("800.00");

    // a third party cannot see the trade at all
    const stranger = await verifiedUser(http, { kyc: false });
    await stranger.call("get", `/trades/${t1.body.id}`).expect(404);

    // role enforcement
    await seller.call("post", `/trades/${t1.body.id}/mark-paid`, { paidFromOwnAccount: true }, { "Idempotency-Key": idem() }).expect(403);
    await buyer.call("post", `/trades/${t1.body.id}/confirm-receipt`, { receivedFullAmount: true, senderNameMatches: true }, { "Idempotency-Key": idem() }).expect(403);

    const paid = await buyer.call("post", `/trades/${t1.body.id}/mark-paid`, { paidFromOwnAccount: true, note: "sent via Leumi" }, { "Idempotency-Key": idem() }).expect(200);
    expect(paid.body.status).toBe("BUYER_MARKED_PAID");
    // marking paid never releases anything by itself
    bal = await buyer.call("get", "/wallet/balances").expect(200);
    expect(bal.body.available).toBe("0.00");

    const done = await seller.call("post", `/trades/${t1.body.id}/confirm-receipt`, { receivedFullAmount: true, senderNameMatches: true }, { "Idempotency-Key": idem() }).expect(200);
    expect(done.body.status).toBe("COMPLETED");

    bal = await buyer.call("get", "/wallet/balances").expect(200);
    expect(bal.body).toMatchObject({ available: "198.50", reconciled: true });
    bal = await seller.call("get", "/wallet/balances").expect(200);
    expect(bal.body).toMatchObject({ available: "500.00", reservedInOffers: "800.00", inEscrow: "0.00", reconciled: true });

    const fee = await prisma.ledgerAccount.findUnique({ where: { key: "platform:PLATFORM_FEE_REVENUE:USDT" } });
    expect(fee!.balance - feeBefore).toBe(1_500_000n);

    // receipts, ratings, events
    const receipt = await buyer.call("get", `/trades/${t1.body.id}/receipt`).expect(200);
    expect(receipt.body).toMatchObject({ role: "buyer", amountUsdt: "200.00", feeUsdt: "1.50", netUsdt: "198.50", sandbox: true });
    await buyer.call("post", `/trades/${t1.body.id}/rate`, { positive: true }).expect(200);
    await buyer.call("post", `/trades/${t1.body.id}/rate`, { positive: true }).expect(409);
    const full = await buyer.call("get", `/trades/${t1.body.id}`).expect(200);
    expect(full.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      "OFFER_ACCEPTED",
      "ESCROW_PENDING",
      "ESCROW_CONFIRMED",
      "AWAITING_FIAT_PAYMENT",
      "BUYER_MARKED_PAID",
      "SELLER_CONFIRMED_RECEIPT",
      "RELEASE_PENDING",
      "COMPLETED",
    ]);

    await settle(jobs);
    const notes = await seller.call("get", "/notifications").expect(200);
    expect(notes.body.items.map((n: { type: string }) => n.type)).toEqual(expect.arrayContaining(["TRADE_STARTED", "TRADE_MARKED_PAID", "TRADE_COMPLETED"]));

    const recon = await app.get(ReconciliationService).run();
    expect(recon.exceptions).toEqual([]);
    const chain = await app.get(AuditService).verifyChain(firstAuditId);
    expect(chain.checkedRows).toBeGreaterThan(10);
    expect(chain.problem).toBeNull();
  });

  it("supports BUY offers where the taker is the seller and must name a verified bank account", async () => {
    const maker = await verifiedUser(http);
    const taker = await verifiedUser(http);
    await deposit(taker, "300");
    const offer = await maker
      .call("post", "/offers", { side: "BUY", amountUsdt: "500", priceIls: "3.65", minOrderIls: "100", maxOrderIls: "5000", paymentMethod: "IL_BANK_TRANSFER", expiresInHours: 24 })
      .expect(201);
    await take(taker, offer.body, "100").expect(422); // BANK_ACCOUNT_REQUIRED
    const t = await take(taker, offer.body, "100", idem(), { bankAccountId: taker.bankAccountId }).expect(201);
    expect(t.body).toMatchObject({ status: "AWAITING_FIAT_PAYMENT", myRole: "seller", fiatAmountIls: "365.00" });
    const bal = await taker.call("get", "/wallet/balances").expect(200);
    expect(bal.body).toMatchObject({ available: "200.00", inEscrow: "100.00" });
    // maker (buyer) sees the taker's bank details to pay
    const asBuyer = await maker.call("get", `/trades/${t.body.id}`).expect(200);
    expect(asBuyer.body.paymentInstructions.amountIls).toBe("365.00");
  });

  it("refuses to take with insufficient seller funds and keeps the book intact", async () => {
    const maker = await verifiedUser(http);
    const taker = await verifiedUser(http);
    const offer = await maker
      .call("post", "/offers", { side: "BUY", amountUsdt: "500", priceIls: "3.65", minOrderIls: "100", maxOrderIls: "5000", paymentMethod: "IL_BANK_TRANSFER", expiresInHours: 24 })
      .expect(201);
    const r = await take(taker, offer.body, "100", idem(), { bankAccountId: taker.bankAccountId }).expect(422);
    expect(r.body.code).toBe("INSUFFICIENT_BALANCE");
    const o = await http().get(`/api/v1/offers/${offer.body.id}`).expect(200);
    expect(o.body.remainingUsdt).toBe("500.00");
  });
});
