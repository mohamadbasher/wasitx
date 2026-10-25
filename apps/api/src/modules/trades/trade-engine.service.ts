import { Injectable } from "@nestjs/common";
import {
  ESCROW_HELD_STATUSES,
  OFFER_OPEN_STATUSES,
  canFreeze,
  fiatForUsdt,
  findTradeTransition,
  formatIls,
  formatUsdt,
  minBig,
  type NotificationType,
  type TradeAction,
  type TradeActor,
  type TradeStatus,
} from "@wasitx/shared";
import type { RequestContext } from "../../common/auth/auth.types.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService, type Tx } from "../../common/prisma.service.js";
import type { Offer, Prisma, Trade } from "../../generated/prisma/client.js";
import { AuditService } from "../audit/audit.service.js";
import { platformKey, userKey, LedgerService } from "../ledger/ledger.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { SystemConfigService } from "../config/system-config.service.js";

export interface TradeActorRef {
  type: "USER" | "STAFF" | "SYSTEM";
  id: string | null;
  role: TradeActor;
}

export const SYSTEM_ACTOR: TradeActorRef = { type: "SYSTEM", id: null, role: "system" };

export interface TransitionOptions {
  note?: string;
  data?: Prisma.TradeUncheckedUpdateInput;
  metadata?: Record<string, unknown>;
  ctx?: RequestContext | null;
  /** Run inside an existing transaction (caller commits and kicks the outbox). */
  tx?: Tx;
  guard?: (trade: Trade, tx: Tx) => Promise<void> | void;
  /** Party whose behaviour ended the trade unsuccessfully (feeds completion-rate stats). */
  faultParty?: "buyer" | "seller" | null;
}

/** Statuses in which the seller's funds have been moved to USER_ESCROW in the ledger. */
const LEDGER_ESCROWED: readonly TradeStatus[] = ["ESCROW_PENDING", ...ESCROW_HELD_STATUSES];

const NOTIFY_ON: Partial<Record<TradeStatus, { buyer?: NotificationType; seller?: NotificationType }>> = {
  AWAITING_FIAT_PAYMENT: { buyer: "TRADE_ESCROW_LOCKED", seller: "TRADE_ESCROW_LOCKED" },
  BUYER_MARKED_PAID: { seller: "TRADE_MARKED_PAID" },
  SELLER_CONFIRMED_RECEIPT: { buyer: "TRADE_RECEIPT_CONFIRMED" },
  COMPLETED: { buyer: "TRADE_COMPLETED", seller: "TRADE_COMPLETED" },
  CANCELLED: { buyer: "TRADE_CANCELLED", seller: "TRADE_CANCELLED" },
  EXPIRED: { buyer: "TRADE_EXPIRED", seller: "TRADE_EXPIRED" },
  DISPUTED: { buyer: "TRADE_DISPUTED", seller: "TRADE_DISPUTED" },
  FROZEN: { buyer: "TRADE_FROZEN", seller: "TRADE_FROZEN" },
};

/**
 * Executes trade state transitions. Every transition:
 *   1. locks the trade row (SELECT … FOR NO KEY UPDATE — does not block FK inserts that reference it),
 *   2. asks the shared state machine whether (status, action, actor) is legal,
 *   3. applies ledger / offer / escrow-instruction effects,
 *   4. writes TradeEvent + AuditEvent + notifications + outbox rows,
 * all in one database transaction. Custody calls happen afterwards in EscrowService, driven by
 * EscrowOperation rows created here, so a crash never leaves the ledger and instructions out of step.
 */
@Injectable()
export class TradeEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: SystemConfigService,
  ) {}

  async lockTrade(tx: Tx, tradeId: string): Promise<Trade> {
    await tx.$executeRaw`SELECT 1 FROM "Trade" WHERE id = ${tradeId} FOR NO KEY UPDATE`;
    const t = await tx.trade.findUnique({ where: { id: tradeId } });
    if (!t) throw Errors.notFound("TRADE");
    return t;
  }

  async lockOffer(tx: Tx, offerId: string): Promise<Offer> {
    await tx.$executeRaw`SELECT 1 FROM "Offer" WHERE id = ${offerId} FOR NO KEY UPDATE`;
    return tx.offer.findUniqueOrThrow({ where: { id: offerId } });
  }

  private assertParty(t: Trade, actor: TradeActorRef) {
    if (actor.role === "buyer" && actor.id !== t.buyerId) throw Errors.forbidden("NOT_TRADE_BUYER");
    if (actor.role === "seller" && actor.id !== t.sellerId) throw Errors.forbidden("NOT_TRADE_SELLER");
  }

  async transition(tradeId: string, action: TradeAction, actor: TradeActorRef, opts: TransitionOptions = {}): Promise<Trade> {
    const run = async (tx: Tx) => {
      const t = await this.lockTrade(tx, tradeId);
      this.assertParty(t, actor);
      const tr = findTradeTransition(t.status, action, actor.role);
      if (!tr) throw new AppError("INVALID_TRANSITION", 409, `Cannot ${action} from ${t.status}`, { status: t.status, action });
      if (opts.guard) await opts.guard(t, tx);

      const data: Prisma.TradeUncheckedUpdateInput = { ...(opts.data ?? {}) };
      await this.applyEffects(tx, t, t.status, tr.to, data, opts.faultParty ?? null);

      const updated = await tx.trade.update({
        where: { id: t.id },
        data: { ...data, status: tr.to, version: { increment: 1 } },
      });
      await this.record(tx, updated, t.status, tr.to, action, actor, opts);
      return updated;
    };
    if (opts.tx) return run(opts.tx);
    const result = await this.prisma.tx(run);
    this.outbox.kick();
    return result;
  }

  /** Compliance freeze: suspends all actions; remembers the state to return to. */
  async freeze(tradeId: string, actor: TradeActorRef, reason: string, ctx?: RequestContext | null): Promise<Trade> {
    const result = await this.prisma.tx(async (tx) => {
      const t = await this.lockTrade(tx, tradeId);
      if (!canFreeze(t.status)) throw new AppError("INVALID_TRANSITION", 409, `Cannot freeze from ${t.status}`);
      const updated = await tx.trade.update({ where: { id: t.id }, data: { status: "FROZEN", frozenFrom: t.status, version: { increment: 1 } } });
      await this.record(tx, updated, t.status, "FROZEN", "freeze", actor, { note: reason, ctx });
      return updated;
    });
    this.outbox.kick();
    return result;
  }

  async unfreeze(tradeId: string, actor: TradeActorRef, note: string, ctx?: RequestContext | null): Promise<Trade> {
    const result = await this.prisma.tx(async (tx) => {
      const t = await this.lockTrade(tx, tradeId);
      if (t.status !== "FROZEN" || !t.frozenFrom) throw new AppError("INVALID_TRANSITION", 409, "Trade is not frozen");
      const back = t.frozenFrom;
      const data: Prisma.TradeUncheckedUpdateInput = { status: back, frozenFrom: null, version: { increment: 1 } };
      // A frozen payment window must not expire the moment it is unfrozen.
      if (back === "AWAITING_FIAT_PAYMENT") {
        const rules = await this.config.parsedRiskRules(tx);
        data.paymentDeadline = new Date(Date.now() + rules.paymentWindowMinutes * 60_000);
      }
      const updated = await tx.trade.update({ where: { id: t.id }, data });
      await this.record(tx, updated, "FROZEN", back, "unfreeze", actor, { note, ctx });
      // Resume custody work that completed while frozen.
      await this.outbox.enqueue(tx, "escrow.process", { tradeId: t.id });
      return updated;
    });
    this.outbox.kick();
    return result;
  }

  // ── effects ────────────────────────────────────────────────────────────────
  private async applyEffects(tx: Tx, t: Trade, from: TradeStatus, to: TradeStatus, data: Prisma.TradeUncheckedUpdateInput, fault: "buyer" | "seller" | null) {
    switch (to) {
      case "ESCROW_PENDING":
        return this.lockEscrow(tx, t);
      case "AWAITING_FIAT_PAYMENT": {
        const rules = await this.config.parsedRiskRules(tx);
        const deadline = new Date(Date.now() + rules.paymentWindowMinutes * 60_000);
        data.paymentDeadline = deadline;
        await tx.payment.upsert({
          where: { tradeId: t.id },
          create: { tradeId: t.id, method: t.paymentMethod, amountAgorot: t.fiatAgorot, reference: t.paymentReference },
          update: {},
        });
        const reminderAt = new Date(deadline.getTime() - 10 * 60_000);
        if (reminderAt > new Date()) await this.outbox.enqueue(tx, "trade.deadline_reminder", { tradeId: t.id }, reminderAt);
        return;
      }
      case "BUYER_MARKED_PAID":
        data.markedPaidAt = new Date();
        await tx.payment.update({ where: { tradeId: t.id }, data: { status: "MARKED_SENT", markedSentAt: new Date() } });
        return;
      case "SELLER_CONFIRMED_RECEIPT":
        data.confirmedAt = new Date();
        await tx.payment.update({ where: { tradeId: t.id }, data: { status: "CONFIRMED_BY_SELLER", confirmedAt: new Date() } });
        return;
      case "DISPUTED":
        await tx.payment.update({ where: { tradeId: t.id }, data: { status: "DISPUTED" } });
        return;
      case "RELEASE_PENDING":
        await this.instructCustody(tx, t, "RELEASE", t.sellerLocksUsdt);
        return;
      case "COMPLETED":
        data.completedAt = new Date();
        data.releasedAt = new Date();
        return this.settle(tx, t);
      case "CANCELLED":
      case "EXPIRED": {
        data.cancelledAt = new Date();
        const effectiveFrom = from === "FROZEN" ? (t.frozenFrom ?? from) : from;
        await this.unwind(tx, t, effectiveFrom);
        if (fault) await this.bumpFinished(tx, fault === "buyer" ? t.buyerId : t.sellerId);
        if (t.paymentDeadline || from !== "OFFER_ACCEPTED") {
          await tx.payment.updateMany({ where: { tradeId: t.id }, data: { status: "VOID" } });
        }
        return;
      }
      default:
        return;
    }
  }

  /** Seller funds → USER_ESCROW, plus a custody HOLD instruction. */
  private async lockEscrow(tx: Tx, t: Trade) {
    const sellerFromReserve = t.offerSide === "SELL" ? t.amountUsdt : 0n;
    const sellerFromAvailable = t.sellerLocksUsdt - sellerFromReserve;
    await this.ledger.post(tx, {
      type: "ESCROW_LOCK",
      referenceType: "Trade",
      referenceId: t.id,
      idempotencyKey: `trade:${t.id}:escrow_lock`,
      description: `Escrow lock for trade ${t.reference}`,
      lines: [
        { key: userKey(t.sellerId, "USER_OFFER_RESERVED"), amount: -sellerFromReserve },
        { key: userKey(t.sellerId, "USER_AVAILABLE"), amount: -sellerFromAvailable },
        { key: userKey(t.sellerId, "USER_ESCROW"), amount: t.sellerLocksUsdt },
      ],
    });
    await this.instructCustody(tx, t, "HOLD", t.sellerLocksUsdt);
  }

  private async instructCustody(tx: Tx, t: Trade, type: "HOLD" | "RELEASE" | "CANCEL_HOLD", amount: bigint) {
    await tx.escrowOperation.upsert({
      where: { idempotencyKey: `trade:${t.id}:${type.toLowerCase()}` },
      create: { tradeId: t.id, type, idempotencyKey: `trade:${t.id}:${type.toLowerCase()}`, provider: "custody", amountUsdt: amount },
      update: {},
    });
    await this.outbox.enqueue(tx, "escrow.process", { tradeId: t.id });
  }

  /** Reverses whatever the trade had taken: escrow (ledger + custody hold) and offer quantity. */
  private async unwind(tx: Tx, t: Trade, from: TradeStatus) {
    const offer = await this.lockOffer(tx, t.offerId);
    const offerOpen = OFFER_OPEN_STATUSES.includes(offer.status);
    const toReserve = t.offerSide === "SELL" && offerOpen ? t.amountUsdt : 0n;

    if (LEDGER_ESCROWED.includes(from)) {
      await this.ledger.post(tx, {
        type: "ESCROW_CANCEL",
        referenceType: "Trade",
        referenceId: t.id,
        idempotencyKey: `trade:${t.id}:escrow_cancel`,
        description: `Escrow returned for trade ${t.reference}`,
        lines: [
          { key: userKey(t.sellerId, "USER_ESCROW"), amount: -t.sellerLocksUsdt },
          { key: userKey(t.sellerId, "USER_OFFER_RESERVED"), amount: toReserve },
          { key: userKey(t.sellerId, "USER_AVAILABLE"), amount: t.sellerLocksUsdt - toReserve },
        ],
      });
      await this.instructCustody(tx, t, "CANCEL_HOLD", t.sellerLocksUsdt);
    } else if (t.offerSide === "SELL" && !offerOpen) {
      // Never escrowed and the offer is closed: the reservation for this trade goes back to available.
      await this.ledger.move(tx, {
        type: "OFFER_UNRESERVE",
        referenceType: "Trade",
        referenceId: t.id,
        idempotencyKey: `trade:${t.id}:unreserve`,
        description: `Reservation released for cancelled trade ${t.reference}`,
        from: userKey(t.sellerId, "USER_OFFER_RESERVED"),
        to: userKey(t.sellerId, "USER_AVAILABLE"),
        amount: t.amountUsdt,
      });
    }

    if (offerOpen) {
      const remaining = offer.remainingUsdt + t.amountUsdt;
      const effectiveMax = minBig(offer.maxOrderAgorot, fiatForUsdt(remaining, offer.priceE4));
      const reopen = offer.status === "EXHAUSTED" && effectiveMax >= offer.minOrderAgorot && offer.expiresAt > new Date();
      await tx.offer.update({
        where: { id: offer.id },
        data: { remainingUsdt: remaining, effectiveMaxAgorot: effectiveMax, status: reopen ? "ACTIVE" : offer.status, version: { increment: 1 } },
      });
      await this.outbox.enqueue(tx, "ws.offer", { offerId: offer.id });
    }
  }

  /** Escrow → buyer (net) + platform fee revenue; stats. Runs only after the custodian confirmed release. */
  private async settle(tx: Tx, t: Trade) {
    await this.ledger.post(tx, {
      type: "TRADE_SETTLE",
      referenceType: "Trade",
      referenceId: t.id,
      idempotencyKey: `trade:${t.id}:settle`,
      description: `Settlement of trade ${t.reference}`,
      lines: [
        { key: userKey(t.sellerId, "USER_ESCROW"), amount: -t.sellerLocksUsdt },
        { key: userKey(t.buyerId, "USER_AVAILABLE"), amount: t.buyerReceivesUsdt },
        { key: platformKey("PLATFORM_FEE_REVENUE"), amount: t.feeUsdt },
      ],
    });
    const releaseSec = t.markedPaidAt && t.confirmedAt ? BigInt(Math.max(0, Math.round((t.confirmedAt.getTime() - t.markedPaidAt.getTime()) / 1000))) : null;
    await tx.traderStats.upsert({
      where: { userId: t.buyerId },
      create: { userId: t.buyerId, completedTrades: 1, finishedTrades: 1, boughtUsdt: t.amountUsdt, feesPaidUsdt: t.buyerFeeUsdt },
      update: { completedTrades: { increment: 1 }, finishedTrades: { increment: 1 }, boughtUsdt: { increment: t.amountUsdt }, feesPaidUsdt: { increment: t.buyerFeeUsdt } },
    });
    await tx.traderStats.upsert({
      where: { userId: t.sellerId },
      create: {
        userId: t.sellerId,
        completedTrades: 1,
        finishedTrades: 1,
        soldUsdt: t.amountUsdt,
        feesPaidUsdt: t.sellerFeeUsdt,
        releaseSecondsTotal: releaseSec ?? 0n,
        releaseCount: releaseSec === null ? 0 : 1,
      },
      update: {
        completedTrades: { increment: 1 },
        finishedTrades: { increment: 1 },
        soldUsdt: { increment: t.amountUsdt },
        feesPaidUsdt: { increment: t.sellerFeeUsdt },
        ...(releaseSec !== null ? { releaseSecondsTotal: { increment: releaseSec }, releaseCount: { increment: 1 } } : {}),
      },
    });
    await tx.payment.updateMany({ where: { tradeId: t.id, status: { not: "RECONCILED" } }, data: { status: "CONFIRMED_BY_SELLER" } });
  }

  private async bumpFinished(tx: Tx, userId: string) {
    await tx.traderStats.upsert({ where: { userId }, create: { userId, finishedTrades: 1 }, update: { finishedTrades: { increment: 1 } } });
  }

  // ── records ────────────────────────────────────────────────────────────────
  private async record(tx: Tx, t: Trade, from: TradeStatus | null, to: TradeStatus, action: string, actor: TradeActorRef, opts: Pick<TransitionOptions, "note" | "metadata" | "ctx">) {
    await tx.tradeEvent.create({
      data: {
        tradeId: t.id,
        fromStatus: from,
        toStatus: to,
        action,
        actorType: actor.type,
        actorId: actor.id,
        actorRole: actor.role,
        note: opts.note ?? null,
        metadata: (opts.metadata as object) ?? undefined,
      },
    });
    await this.audit.record(tx, {
      actorType: actor.type,
      actorId: actor.id,
      action: `trade.${action}`,
      entityType: "Trade",
      entityId: t.id,
      data: { from, to, note: opts.note ?? null, ...(opts.metadata ?? {}) },
      ctx: opts.ctx,
    });
    await tx.message.create({ data: { tradeId: t.id, senderRole: "SYSTEM", body: `sys:${to}` } });

    const n = NOTIFY_ON[to];
    if (n) {
      const params = { reference: t.reference, amount: formatUsdt(t.amountUsdt), fiat: formatIls(t.fiatAgorot) };
      const link = `/trades/${t.id}`;
      if (n.buyer) await this.outbox.notify(tx, t.buyerId, n.buyer, params, link);
      if (n.seller) await this.outbox.notify(tx, t.sellerId, n.seller, params, link);
    }
    await this.outbox.enqueue(tx, "ws.trade", { tradeId: t.id });
  }

  /** Records the creation event (no previous state). */
  recordCreated(tx: Tx, t: Trade, actor: TradeActorRef, ctx?: RequestContext | null) {
    return this.record(tx, t, null, "OFFER_ACCEPTED", "accept_offer", actor, { ctx });
  }
}
