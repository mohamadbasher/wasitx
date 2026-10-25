import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service.js";
import type { OutboxEvent } from "../../generated/prisma/client.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { OffersService } from "../offers/offers.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";
import { EscrowService } from "../trades/escrow.service.js";
import { TradesService } from "../trades/trades.service.js";
import { ReconciliationService } from "./reconciliation.service.js";
import { AuditService } from "../audit/audit.service.js";

const OUTBOX_MAX_ATTEMPTS = 10;

/**
 * Background work without Redis (ADR 0007): DB-driven loops that are safe to run on several
 * instances — outbox rows are claimed with FOR UPDATE SKIP LOCKED, escrow ops with leases, and
 * expiries go through row-locked state transitions (a duplicate attempt is simply rejected).
 * With Redis available these can move to BullMQ repeatable jobs without changing the handlers.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger("Jobs");
  private timers: NodeJS.Timeout[] = [];
  private running = new Set<string>();
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
    private readonly escrow: EscrowService,
    private readonly trades: TradesService,
    private readonly offers: OffersService,
    private readonly recon: ReconciliationService,
    private readonly audit: AuditService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.JOBS_ENABLED === "false") return;
    this.every("outbox", 1_000, () => this.drainOutbox());
    this.every("escrow", 5_000, () => this.escrow.processDue());
    this.every("expire-trades", 15_000, () => this.trades.expireOverdue());
    this.every("expire-offers", 60_000, () => this.offers.expireDue());
    this.every("reconciliation", 10 * 60_000, () => this.recon.run());
    this.every("cleanup", 3600_000, () => this.cleanup());
    this.every("audit-seal", 30_000, () => this.audit.seal());
    this.outbox.signal.on("kick", () => void this.guard("outbox", () => this.drainOutbox()));
  }

  onApplicationShutdown() {
    this.stopped = true;
    this.timers.forEach(clearInterval);
  }

  private every(name: string, ms: number, fn: () => Promise<unknown>) {
    this.timers.push(setInterval(() => void this.guard(name, fn), ms).unref());
  }

  private async guard(name: string, fn: () => Promise<unknown>) {
    if (this.stopped || this.running.has(name)) return;
    this.running.add(name);
    try {
      await fn();
    } catch (e) {
      this.logger.error(`${name}: ${(e as Error).stack ?? e}`);
    } finally {
      this.running.delete(name);
    }
  }

  /** Claims and processes due outbox events until none remain. */
  async drainOutbox(): Promise<number> {
    let total = 0;
    for (;;) {
      const batch = await this.prisma.$queryRaw<OutboxEvent[]>`
        UPDATE "OutboxEvent" SET "availableAt" = now() + interval '60 seconds', attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM "OutboxEvent"
          WHERE status = 'PENDING' AND "availableAt" <= now()
          ORDER BY "createdAt" LIMIT 50
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *`;
      if (!batch.length) return total;
      for (const ev of batch) {
        try {
          await this.handle(ev);
          await this.prisma.outboxEvent.update({ where: { id: ev.id }, data: { status: "DONE", processedAt: new Date(), error: null } });
        } catch (e) {
          const failed = ev.attempts >= OUTBOX_MAX_ATTEMPTS;
          await this.prisma.outboxEvent.update({
            where: { id: ev.id },
            data: { status: failed ? "FAILED" : "PENDING", error: (e as Error).message, availableAt: new Date(Date.now() + Math.min(600_000, 1000 * 2 ** ev.attempts)) },
          });
        }
      }
      total += batch.length;
    }
  }

  private async handle(ev: OutboxEvent) {
    const p = ev.payload as Record<string, string>;
    switch (ev.topic) {
      case "notification.deliver":
        return this.notifications.deliver(p.notificationId!);
      case "ws.trade": {
        const t = await this.prisma.trade.findUnique({ where: { id: p.tradeId! }, select: { id: true, status: true, version: true, buyerId: true, sellerId: true } });
        if (!t) return;
        const payload = { tradeId: t.id, status: t.status, version: t.version };
        this.realtime.toTrade(t.id, "trade.updated", payload);
        this.realtime.toUser(t.buyerId, "trade.updated", payload);
        this.realtime.toUser(t.sellerId, "trade.updated", payload);
        return;
      }
      case "ws.offer":
        return this.realtime.toMarket("offer.updated", { offerId: p.offerId });
      case "ws.user":
        return this.realtime.toUser(p.userId!, p.event ?? "user.updated", p);
      case "escrow.process":
        return this.escrow.processTrade(p.tradeId!);
      case "trade.deadline_reminder":
        return this.prisma.tx((tx) => this.trades.sendDeadlineReminder(tx, p.tradeId!)).then(() => this.outbox.kick());
      default:
        this.logger.warn(`Unknown outbox topic ${ev.topic}`);
    }
  }

  private async cleanup() {
    await this.prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.verificationToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
    await this.prisma.outboxEvent.deleteMany({ where: { status: "DONE", processedAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } });
  }
}
