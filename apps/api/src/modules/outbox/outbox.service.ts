import { Injectable } from "@nestjs/common";
import { EventEmitter } from "node:events";
import type { NotificationType } from "@wasitx/shared";
import type { Tx } from "../../common/prisma.service.js";

export type OutboxTopic =
  | "notification.deliver"
  | "ws.trade"
  | "ws.offer"
  | "ws.user"
  | "escrow.process"
  | "trade.deadline_reminder";

/**
 * Transactional outbox: side effects are recorded in the same DB transaction as the state change
 * and executed afterwards by OutboxDispatcher, so a crash can never lose a notification or leave a
 * custody instruction unsent. `kick` wakes the dispatcher immediately after commit.
 */
@Injectable()
export class OutboxService {
  readonly signal = new EventEmitter();

  async enqueue(tx: Tx, topic: OutboxTopic, payload: Record<string, unknown>, availableAt?: Date): Promise<void> {
    await tx.outboxEvent.create({ data: { topic, payload: payload as object, availableAt: availableAt ?? new Date() } });
  }

  /** In-app notification row + async delivery to email/SMS/push per user preferences. */
  async notify(tx: Tx, userId: string, type: NotificationType, params: Record<string, string | number>, link?: string): Promise<void> {
    const n = await tx.notification.create({ data: { userId, type, params, link: link ?? null } });
    await this.enqueue(tx, "notification.deliver", { notificationId: n.id });
  }

  kick() {
    this.signal.emit("kick");
  }
}
