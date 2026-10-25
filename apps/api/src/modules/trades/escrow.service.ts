import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service.js";
import type { EscrowOperation } from "../../generated/prisma/client.js";
import { CUSTODY_PROVIDER, type CustodyProvider } from "../integrations/providers.js";
import { PLATFORM_FEE_CUSTODY_REF } from "../integrations/sandbox/sandbox-custody.provider.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { SYSTEM_ACTOR, TradeEngine } from "./trade-engine.service.js";

const LEASE_MS = 60_000;
const MAX_TRANSIENT_ATTEMPTS = 12;

export const custodyRef = (userId: string) => `user:${userId}`;

/** Business refusals from the custodian (not worth retrying) vs transient failures (retry with backoff). */
const isBusinessError = (e: unknown) => /^CUSTODY_/.test((e as Error)?.message ?? "");

/**
 * Executes custody instructions (EscrowOperation rows) against the custody provider.
 *
 * Safety properties:
 *  • An op is claimed by moving `nextAttemptAt` forward and incrementing `attempts` BEFORE the custody
 *    call — so after a crash we know a call may have happened and replay it (custody calls are idempotent
 *    on the op's key) instead of skipping it.
 *  • HOLD is only first-attempted while the trade is still ESCROW_PENDING; RELEASE only while
 *    RELEASE_PENDING. A frozen trade's custody work waits for unfreeze.
 *  • CANCEL_HOLD waits until the HOLD op is resolved, then cancels only a hold that really exists.
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger("Escrow");

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: TradeEngine,
    private readonly outbox: OutboxService,
    @Inject(CUSTODY_PROVIDER) private readonly custody: CustodyProvider,
  ) {}

  /** Process every due op for one trade (called right after a state change and by the worker). */
  async processTrade(tradeId: string): Promise<void> {
    const ops = await this.prisma.escrowOperation.findMany({
      where: { tradeId, status: "PENDING", nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
    });
    for (const op of ops) await this.process(op.id);
  }

  async processDue(limit = 50): Promise<number> {
    const ops = await this.prisma.escrowOperation.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    });
    for (const op of ops) await this.process(op.id);
    return ops.length;
  }

  private async claim(opId: string): Promise<EscrowOperation | null> {
    const now = new Date();
    const claimed = await this.prisma.escrowOperation.updateMany({
      where: { id: opId, status: "PENDING", nextAttemptAt: { lte: now } },
      data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (claimed.count === 0) return null;
    return this.prisma.escrowOperation.findUnique({ where: { id: opId } });
  }

  private async release(opId: string, delayMs: number) {
    await this.prisma.escrowOperation.update({ where: { id: opId }, data: { nextAttemptAt: new Date(Date.now() + delayMs), attempts: { decrement: 1 } } });
  }

  async process(opId: string): Promise<void> {
    const op = await this.claim(opId);
    if (!op) return;
    const trade = await this.prisma.trade.findUniqueOrThrow({ where: { id: op.tradeId } });
    const firstAttempt = op.attempts === 1;

    try {
      if (op.type === "HOLD") {
        const pending = trade.status === "ESCROW_PENDING";
        const frozenPending = trade.status === "FROZEN" && trade.frozenFrom === "ESCROW_PENDING";
        if (!pending && firstAttempt) {
          if (frozenPending) return this.release(op.id, 30_000); // wait for unfreeze; nothing was sent
          await this.prisma.escrowOperation.update({ where: { id: op.id }, data: { status: "FAILED", error: "TRADE_NO_LONGER_PENDING" } });
          return void this.outbox.kick();
        }
        await this.custody.ensureAccount(custodyRef(trade.sellerId));
        const { holdRef } = await this.custody.createHold({ accountRef: custodyRef(trade.sellerId), amountUsdt: op.amountUsdt, idempotencyKey: op.idempotencyKey });
        await this.prisma.tx(async (tx) => {
          await tx.escrowOperation.update({ where: { id: op.id }, data: { status: "CONFIRMED", providerRef: holdRef, confirmedAt: new Date(), error: null } });
          const t = await this.engine.lockTrade(tx, trade.id);
          if (t.status === "ESCROW_PENDING") {
            await this.engine.transition(t.id, "escrow_locked", SYSTEM_ACTOR, { tx, metadata: { holdRef } });
            await this.engine.transition(t.id, "issue_instructions", SYSTEM_ACTOR, { tx });
          }
        });
      } else if (op.type === "RELEASE") {
        if (trade.status !== "RELEASE_PENDING" && firstAttempt) return this.release(op.id, 30_000);
        const hold = await this.confirmedHold(trade.id);
        if (!hold?.providerRef) throw new Error("CUSTODY_HOLD_MISSING");
        await this.custody.ensureAccount(custodyRef(trade.buyerId));
        const { ref } = await this.custody.releaseHold({
          holdRef: hold.providerRef,
          toAccountRef: custodyRef(trade.buyerId),
          toAmountUsdt: trade.buyerReceivesUsdt,
          feeAccountRef: PLATFORM_FEE_CUSTODY_REF,
          feeAmountUsdt: trade.feeUsdt,
          idempotencyKey: op.idempotencyKey,
        });
        await this.prisma.tx(async (tx) => {
          await tx.escrowOperation.update({ where: { id: op.id }, data: { status: "CONFIRMED", providerRef: ref, confirmedAt: new Date(), error: null } });
          const t = await this.engine.lockTrade(tx, trade.id);
          if (t.status === "RELEASE_PENDING") await this.engine.transition(t.id, "release_confirmed", SYSTEM_ACTOR, { tx, metadata: { custodyRef: ref } });
        });
      } else {
        // CANCEL_HOLD
        const hold = await this.prisma.escrowOperation.findUnique({ where: { idempotencyKey: `trade:${trade.id}:hold` } });
        if (!hold || hold.status === "FAILED") {
          await this.prisma.escrowOperation.update({ where: { id: op.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), error: "NO_HOLD_TO_CANCEL" } });
          return;
        }
        if (hold.status === "PENDING") return this.release(op.id, 5_000);
        const { ref } = await this.custody.cancelHold({ holdRef: hold.providerRef!, idempotencyKey: op.idempotencyKey });
        await this.prisma.escrowOperation.update({ where: { id: op.id }, data: { status: "CONFIRMED", providerRef: ref, confirmedAt: new Date(), error: null } });
      }
    } catch (e) {
      const message = (e as Error).message;
      if (isBusinessError(e) || op.attempts >= MAX_TRANSIENT_ATTEMPTS) {
        this.logger.warn(`Escrow op ${op.id} (${op.type}) failed: ${message}`);
        await this.prisma.escrowOperation.update({ where: { id: op.id }, data: { status: "FAILED", error: message } });
        if (op.type === "HOLD") {
          const t = await this.prisma.trade.findUnique({ where: { id: trade.id } });
          if (t?.status === "ESCROW_PENDING") {
            await this.engine.transition(t.id, "escrow_failed", SYSTEM_ACTOR, { note: message });
          }
        } else {
          // A failed release/cancel needs humans: freeze so nothing else moves, and alert compliance.
          await this.prisma.riskFlag.create({ data: { tradeId: trade.id, type: `ESCROW_${op.type}_FAILED`, severity: "CRITICAL", details: { error: message } } });
          const t = await this.prisma.trade.findUnique({ where: { id: trade.id } });
          if (t && t.status !== "FROZEN" && !["COMPLETED", "CANCELLED", "EXPIRED"].includes(t.status)) {
            await this.engine.freeze(t.id, SYSTEM_ACTOR, `Custody ${op.type} failed: ${message}`);
          }
        }
      } else {
        const backoff = Math.min(5 * 60_000, 2_000 * 2 ** op.attempts);
        await this.prisma.escrowOperation.update({ where: { id: op.id }, data: { error: message, nextAttemptAt: new Date(Date.now() + backoff) } });
      }
    }
    this.outbox.kick();
  }

  private confirmedHold(tradeId: string) {
    return this.prisma.escrowOperation.findFirst({ where: { tradeId, type: "HOLD", status: "CONFIRMED" } });
  }
}
