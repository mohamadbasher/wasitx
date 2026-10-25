import { Injectable, Logger } from "@nestjs/common";
import {
  fiatForUsdt,
  minBig,
  parsePrice,
  parseUsdt,
  quoteFee,
  formatUsdt,
  formatIls,
  formatPrice,
  type Paginated,
  type QuoteDto,
  type TakeOfferInput,
  type TradeDto,
} from "@wasitx/shared";
import { z } from "zod";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { EligibilityService } from "../../common/auth/eligibility.service.js";
import { CryptoService } from "../../common/crypto.service.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService, type Tx } from "../../common/prisma.service.js";
import type { Prisma, Trade } from "../../generated/prisma/client.js";
import { isSandbox } from "../../config/env.js";
import { SystemConfigService } from "../config/system-config.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { EscrowService } from "./escrow.service.js";
import { toTradeDto, tradeInclude, type TradeRow } from "./mappers.js";
import { SYSTEM_ACTOR, TradeEngine } from "./trade-engine.service.js";
import { TradeRiskService } from "./trade-risk.service.js";
import type { confirmReceiptSchema, markPaidSchema, rateTradeSchema } from "@wasitx/shared";

type MarkPaidInput = z.infer<typeof markPaidSchema>;
type RateInput = z.infer<typeof rateTradeSchema>;
type ConfirmInput = z.infer<typeof confirmReceiptSchema>;

@Injectable()
export class TradesService {
  private readonly logger = new Logger("Trades");

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: TradeEngine,
    private readonly escrow: EscrowService,
    private readonly risk: TradeRiskService,
    private readonly config: SystemConfigService,
    private readonly eligibility: EligibilityService,
    private readonly outbox: OutboxService,
    private readonly crypto: CryptoService,
  ) {}

  /** Fee & total preview shown before the user confirms (no state change). */
  async quote(offerId: string, amountUsdt: string): Promise<QuoteDto> {
    const offer = await this.prisma.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw Errors.notFound("OFFER");
    const amount = parseUsdt(amountUsdt);
    const { cfg } = await this.config.currentCommission();
    const q = this.safeQuote(amount, cfg);
    return {
      amountUsdt: formatUsdt(amount),
      priceIls: formatPrice(offer.priceE4),
      fiatAmountIls: formatIls(fiatForUsdt(amount, offer.priceE4)),
      fee: {
        rateBps: q.rateBps,
        payer: q.payer,
        feeUsdt: formatUsdt(q.feeUsdtMicro),
        buyerFeeUsdt: formatUsdt(q.buyerFeeMicro),
        sellerFeeUsdt: formatUsdt(q.sellerFeeMicro),
      },
      buyerReceivesUsdt: formatUsdt(q.buyerReceivesMicro),
      sellerLocksUsdt: formatUsdt(q.sellerLocksMicro),
    };
  }

  private safeQuote(amount: bigint, cfg: Parameters<typeof quoteFee>[1]) {
    try {
      return quoteFee(amount, cfg);
    } catch {
      throw new AppError("AMOUNT_TOO_SMALL_FOR_FEE", 422);
    }
  }

  /**
   * Takes an offer. Concurrency safety: the offer row is locked, and price + version must equal what
   * the user was shown (stale-price guard). Idempotent per (user, Idempotency-Key).
   */
  async take(user: AuthUser, input: TakeOfferInput, idemKey: string, ctx: RequestContext): Promise<TradeDto> {
    const takeKey = `${user.id}:${idemKey}`;
    const amount = parseUsdt(input.amountUsdt);
    const quotedPrice = parsePrice(input.quotedPriceIls);
    const rules = await this.config.parsedRiskRules();
    const commission = await this.config.currentCommission();

    let tradeId: string;
    try {
      tradeId = await this.prisma.tx(async (tx) => {
        const prior = await tx.trade.findUnique({ where: { takeIdempotencyKey: takeKey }, select: { id: true } });
        if (prior) return prior.id;

        const offer = await this.engine.lockOffer(tx, input.offerId);
        if (offer.ownerId === user.id) throw new AppError("CANNOT_TAKE_OWN_OFFER", 422);
        if (offer.status !== "ACTIVE" || offer.expiresAt <= new Date()) throw new AppError("OFFER_UNAVAILABLE", 409);
        if (offer.priceE4 !== quotedPrice || offer.version !== input.quotedVersion) {
          throw new AppError("OFFER_CHANGED", 409, "Offer changed since it was displayed", {
            priceIls: formatPrice(offer.priceE4),
            version: offer.version,
          });
        }
        if (!(await this.config.isPaymentMethodEnabled(offer.paymentMethod, tx))) throw new AppError("PAYMENT_METHOD_DISABLED", 409);
        if (amount > offer.remainingUsdt) throw new AppError("OFFER_INSUFFICIENT_REMAINING", 409);
        const fiat = fiatForUsdt(amount, offer.priceE4);
        if (fiat < offer.minOrderAgorot || fiat > offer.maxOrderAgorot) {
          throw new AppError("ORDER_OUTSIDE_LIMITS", 422, undefined, { minIls: formatIls(offer.minOrderAgorot), maxIls: formatIls(offer.maxOrderAgorot) });
        }
        if ((await this.eligibility.reasons(offer.ownerId)).length) throw new AppError("OFFER_UNAVAILABLE", 409);

        const fee = this.safeQuote(amount, commission.cfg);
        const isSellOffer = offer.side === "SELL";
        const buyerId = isSellOffer ? user.id : offer.ownerId;
        const sellerId = isSellOffer ? offer.ownerId : user.id;
        const sellerBankAccountId = isSellOffer ? offer.bankAccountId : input.bankAccountId;
        if (!sellerBankAccountId) throw new AppError("BANK_ACCOUNT_REQUIRED", 422);
        const bank = await tx.bankAccount.findFirst({ where: { id: sellerBankAccountId, userId: sellerId, deletedAt: null, status: "VERIFIED" } });
        if (!bank) throw new AppError(isSellOffer ? "OFFER_UNAVAILABLE" : "BANK_ACCOUNT_NOT_VERIFIED", 422);

        // Self-dealing guard: the buyer must not own the account they'd be "paying".
        const sameAccount = await tx.bankAccount.count({ where: { userId: buyerId, accountHash: bank.accountHash } });
        if (sameAccount) {
          await tx.riskFlag.create({ data: { userId: user.id, type: "SELF_TRADE_SUSPECTED", severity: "HIGH", details: { offerId: offer.id } } });
          throw new AppError("SELF_TRADE_SUSPECTED", 422);
        }

        await this.risk.checkLimits(tx, user.id, offer.ownerId, fiat, rules);

        const remaining = offer.remainingUsdt - amount;
        const effectiveMax = minBig(offer.maxOrderAgorot, fiatForUsdt(remaining, offer.priceE4));
        await tx.offer.update({
          where: { id: offer.id },
          data: {
            remainingUsdt: remaining,
            effectiveMaxAgorot: effectiveMax,
            status: effectiveMax < offer.minOrderAgorot ? "EXHAUSTED" : "ACTIVE",
            version: { increment: 1 },
          },
        });

        const trade = await tx.trade.create({
          data: {
            reference: this.crypto.reference("T", 8),
            offerId: offer.id,
            offerSide: offer.side,
            makerId: offer.ownerId,
            takerId: user.id,
            buyerId,
            sellerId,
            amountUsdt: amount,
            priceE4: offer.priceE4,
            fiatAgorot: fiat,
            feeUsdt: fee.feeUsdtMicro,
            buyerFeeUsdt: fee.buyerFeeMicro,
            sellerFeeUsdt: fee.sellerFeeMicro,
            feeRateBps: fee.rateBps,
            feePayer: fee.payer,
            commissionConfigId: commission.id,
            sellerLocksUsdt: fee.sellerLocksMicro,
            buyerReceivesUsdt: fee.buyerReceivesMicro,
            paymentMethod: offer.paymentMethod,
            sellerBankAccountId: bank.id,
            paymentReference: this.crypto.reference("WX", 6),
            takeIdempotencyKey: takeKey,
            sandbox: isSandbox(),
          },
        });
        await this.engine.recordCreated(tx, trade, { type: "USER", id: user.id, role: isSellOffer ? "buyer" : "seller" }, ctx);
        await this.outbox.notify(tx, offer.ownerId, "TRADE_STARTED", { reference: trade.reference, amount: formatUsdt(amount), fiat: formatIls(fiat) }, `/trades/${trade.id}`);
        await this.outbox.enqueue(tx, "ws.offer", { offerId: offer.id });

        const reasons = await this.risk.preTradeReviewReasons(tx, trade);
        if (reasons.length) {
          await this.engine.transition(trade.id, "route_to_review", SYSTEM_ACTOR, { tx, metadata: { reasons } });
          await tx.complianceCase.create({
            data: { type: "TRANSACTION_REVIEW", tradeId: trade.id, priority: reasons.includes("HIGH_RISK_PARTY") ? "HIGH" : "MEDIUM", summary: `Pre-trade review: ${reasons.join(", ")}` },
          });
        } else {
          await this.engine.transition(trade.id, "pass_compliance", SYSTEM_ACTOR, { tx });
        }
        return trade.id;
      });
    } catch (e) {
      // A concurrent duplicate with the same key won the race — return its trade.
      if ((e as { code?: string }).code === "P2002") {
        const existing = await this.prisma.trade.findUnique({ where: { takeIdempotencyKey: takeKey }, select: { id: true } });
        if (existing) return this.get(user, existing.id);
      }
      throw e;
    }
    this.outbox.kick();
    await this.escrow.processTrade(tradeId).catch((e) => this.logger.warn(`escrow processing deferred: ${(e as Error).message}`));
    return this.get(user, tradeId);
  }

  async markPaid(user: AuthUser, tradeId: string, input: MarkPaidInput, ctx: RequestContext): Promise<TradeDto> {
    const settings = await this.config.tradingSettings();
    await this.engine.transition(tradeId, "mark_paid", { type: "USER", id: user.id, role: "buyer" }, {
      ctx,
      note: input.note,
      guard: async (t, tx) => {
        const graceMs = settings.markPaidGraceMinutes * 60_000;
        if (t.paymentDeadline && t.paymentDeadline.getTime() + graceMs < Date.now()) throw new AppError("PAYMENT_WINDOW_CLOSED", 409);
        if (input.evidenceFileIds?.length) {
          const n = await tx.fileObject.updateMany({
            where: { id: { in: input.evidenceFileIds }, ownerId: user.id, purpose: "PAYMENT_EVIDENCE", tradeId: null, scanStatus: "CLEAN" },
            data: { tradeId: t.id },
          });
          if (n.count !== input.evidenceFileIds.length) throw new AppError("INVALID_ATTACHMENTS", 422);
        }
        if (input.note) await tx.payment.update({ where: { tradeId: t.id }, data: { buyerNote: input.note } });
      },
      metadata: { evidenceFiles: input.evidenceFileIds?.length ?? 0 },
    });
    return this.get(user, tradeId);
  }

  /**
   * Seller confirms the shekels arrived in their account. Then the settlement policy decides:
   * automatic release, or a compliance review (case opened) before release.
   */
  async confirmReceipt(user: AuthUser, tradeId: string, _input: ConfirmInput, ctx: RequestContext): Promise<TradeDto> {
    await this.prisma.tx(async (tx) => {
      const t = await this.engine.transition(tradeId, "confirm_receipt", { type: "USER", id: user.id, role: "seller" }, { tx, ctx });
      const decision = await this.risk.settlementDecision(tx, t);
      if (decision.autoRelease) {
        await this.engine.transition(t.id, "settlement_verified", SYSTEM_ACTOR, {
          tx,
          data: { settlementBasis: decision.basis },
          metadata: { basis: decision.basis },
        });
      } else {
        await tx.trade.update({ where: { id: t.id }, data: { requiresReleaseReview: true } });
        await tx.complianceCase.create({
          data: { type: "TRANSACTION_REVIEW", tradeId: t.id, priority: "HIGH", summary: `Release review: ${decision.reasons.join(", ")}` },
        });
      }
    });
    this.outbox.kick();
    await this.escrow.processTrade(tradeId).catch((e) => this.logger.warn(`release deferred: ${(e as Error).message}`));
    return this.get(user, tradeId);
  }

  async cancel(user: AuthUser, tradeId: string, reason: string, ctx: RequestContext): Promise<TradeDto> {
    await this.engine.transition(tradeId, "cancel", { type: "USER", id: user.id, role: "buyer" }, {
      ctx,
      note: reason,
      data: { cancelReason: reason },
      faultParty: "buyer",
    });
    await this.escrow.processTrade(tradeId).catch(() => undefined);
    return this.get(user, tradeId);
  }

  async rate(user: AuthUser, tradeId: string, input: RateInput): Promise<TradeDto> {
    await this.prisma.tx(async (tx) => {
      const t = await tx.trade.findUnique({ where: { id: tradeId } });
      if (!t || (t.buyerId !== user.id && t.sellerId !== user.id)) throw Errors.notFound("TRADE");
      if (t.status !== "COMPLETED") throw new AppError("RATING_ONLY_AFTER_COMPLETION", 409);
      const rateeId = t.buyerId === user.id ? t.sellerId : t.buyerId;
      try {
        await tx.rating.create({ data: { tradeId, raterId: user.id, rateeId, positive: input.positive, comment: input.comment ?? null } });
      } catch {
        throw new AppError("ALREADY_RATED", 409);
      }
      await tx.traderStats.upsert({
        where: { userId: rateeId },
        create: { userId: rateeId, totalRatings: 1, positiveRatings: input.positive ? 1 : 0 },
        update: { totalRatings: { increment: 1 }, ...(input.positive ? { positiveRatings: { increment: 1 } } : {}) },
      });
    });
    return this.get(user, tradeId);
  }

  // ── queries ────────────────────────────────────────────────────────────────
  async loadForViewer(user: AuthUser, tradeId: string): Promise<TradeRow> {
    const t = await this.prisma.trade.findUnique({ where: { id: tradeId }, include: tradeInclude });
    const isParty = t && (t.buyerId === user.id || t.sellerId === user.id);
    if (!t || (!isParty && !user.permissions.has("trades:read_all"))) throw Errors.notFound("TRADE");
    return t;
  }

  async get(user: AuthUser, tradeId: string, withEvents = true): Promise<TradeDto> {
    const t = await this.loadForViewer(user, tradeId);
    return this.toDto(user, t, withEvents);
  }

  async toDto(user: AuthUser, t: TradeRow, withEvents = false): Promise<TradeDto> {
    const settings = await this.config.tradingSettings();
    const isStaff = user.permissions.has("trades:read_all");
    // Bank details are revealed to the buyer (to pay), the seller (their own) and staff — never to anyone else.
    let bank: { bankCode: string; branchNumber: string; accountNumber: string; holderName: string } | null = null;
    if (t.buyerId === user.id || t.sellerId === user.id || isStaff) {
      const b = await this.prisma.bankAccount.findUnique({ where: { id: t.sellerBankAccountId } });
      if (b) bank = { bankCode: b.bankCode, branchNumber: b.branchNumber, accountNumber: this.crypto.decrypt(b.accountNumberEnc), holderName: b.holderName };
    }
    const lastRead = await this.prisma.messageRead.findUnique({ where: { tradeId_userId: { tradeId: t.id, userId: user.id } } });
    const unread = await this.prisma.message.count({
      where: { tradeId: t.id, createdAt: { gt: lastRead?.lastReadAt ?? new Date(0) }, NOT: { senderId: user.id }, senderRole: { not: "SYSTEM" } },
    });
    const events = withEvents
      ? (await this.prisma.tradeEvent.findMany({ where: { tradeId: t.id }, orderBy: { createdAt: "asc" } })).map((e) => ({
          id: e.id,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          action: e.action,
          actorRole: e.actorRole,
          note: isStaff || e.actorType !== "STAFF" ? e.note : null,
          createdAt: e.createdAt.toISOString(),
        }))
      : undefined;
    return toTradeDto(t, { viewerId: user.id, isStaff, disputeAfterMinutes: settings.disputeAfterMinutes, unread, bank, events });
  }

  async list(user: AuthUser, q: { scope: "active" | "completed" | "cancelled" | "disputed" | "all"; cursor?: string; limit: number }): Promise<Paginated<TradeDto>> {
    const statusFilter: Record<typeof q.scope, Prisma.TradeWhereInput> = {
      active: { status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] } },
      completed: { status: "COMPLETED" },
      cancelled: { status: { in: ["CANCELLED", "EXPIRED"] } },
      disputed: { dispute: { isNot: null } },
      all: {},
    };
    const rows = await this.prisma.trade.findMany({
      where: { AND: [{ OR: [{ buyerId: user.id }, { sellerId: user.id }] }, statusFilter[q.scope]] },
      include: tradeInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return { items: await Promise.all(page.map((t) => this.toDto(user, t))), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
  }

  async receipt(user: AuthUser, tradeId: string) {
    const t = await this.loadForViewer(user, tradeId);
    if (t.status !== "COMPLETED") throw new AppError("RECEIPT_ONLY_FOR_COMPLETED", 409);
    const role = t.buyerId === user.id ? "buyer" : "seller";
    return {
      reference: t.reference,
      paymentReference: t.paymentReference,
      role,
      completedAt: t.completedAt!.toISOString(),
      buyer: t.buyer.displayName,
      seller: t.seller.displayName,
      amountUsdt: formatUsdt(t.amountUsdt),
      priceIls: formatPrice(t.priceE4),
      fiatAmountIls: formatIls(t.fiatAgorot),
      feeUsdt: formatUsdt(role === "buyer" ? t.buyerFeeUsdt : t.sellerFeeUsdt),
      feeRateBps: t.feeRateBps,
      netUsdt: formatUsdt(role === "buyer" ? t.buyerReceivesUsdt : t.sellerLocksUsdt),
      sandbox: t.sandbox,
    };
  }

  /** Staff: compliance approval of a trade waiting in COMPLIANCE_REVIEW or a release review. */
  async complianceApprove(staff: AuthUser, tradeId: string, note: string, ctx: RequestContext): Promise<Trade> {
    const t = await this.prisma.trade.findUniqueOrThrow({ where: { id: tradeId } });
    const actor = { type: "STAFF" as const, id: staff.id, role: "compliance" as const };
    let result: Trade;
    if (t.status === "COMPLIANCE_REVIEW") {
      result = await this.engine.transition(tradeId, "approve_compliance", actor, { note, ctx });
    } else if (t.status === "SELLER_CONFIRMED_RECEIPT") {
      result = await this.engine.transition(tradeId, "approve_release", actor, { note, ctx, data: { settlementBasis: "COMPLIANCE" } });
    } else {
      throw new AppError("INVALID_TRANSITION", 409);
    }
    await this.prisma.complianceCase.updateMany({
      where: { tradeId, type: "TRANSACTION_REVIEW", status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } },
      data: { status: "CLOSED_NO_ACTION", closedAt: new Date(), assignedToId: staff.id },
    });
    await this.escrow.processTrade(tradeId).catch(() => undefined);
    return result;
  }

  async complianceReject(staff: AuthUser, tradeId: string, note: string, ctx: RequestContext): Promise<Trade> {
    const result = await this.engine.transition(tradeId, "reject_compliance", { type: "STAFF", id: staff.id, role: "compliance" }, { note, ctx, data: { cancelReason: note } });
    await this.prisma.complianceCase.updateMany({
      where: { tradeId, status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } },
      data: { status: "CLOSED_NO_ACTION", closedAt: new Date(), assignedToId: staff.id },
    });
    return result;
  }

  /** Background: expire unpaid trades whose window closed. Paid trades never auto-expire. */
  async expireOverdue(): Promise<number> {
    const due = await this.prisma.trade.findMany({
      where: { status: "AWAITING_FIAT_PAYMENT", paymentDeadline: { lt: new Date() } },
      select: { id: true },
      take: 100,
    });
    let n = 0;
    for (const { id } of due) {
      try {
        await this.engine.transition(id, "expire", SYSTEM_ACTOR, { note: "Payment window elapsed", faultParty: "buyer" });
        await this.escrow.processTrade(id);
        n++;
      } catch (e) {
        if ((e as AppError).code !== "INVALID_TRANSITION") this.logger.error(e);
      }
    }
    return n;
  }

  /** Used by the outbox for deadline reminders. */
  async sendDeadlineReminder(tx: Tx, tradeId: string) {
    const t = await tx.trade.findUnique({ where: { id: tradeId } });
    if (t?.status !== "AWAITING_FIAT_PAYMENT") return;
    await this.outbox.notify(tx, t.buyerId, "TRADE_PAYMENT_DEADLINE", { reference: t.reference, fiat: formatIls(t.fiatAgorot), minutes: 10 }, `/trades/${t.id}`);
  }
}
