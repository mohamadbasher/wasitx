import { Injectable } from "@nestjs/common";
import { detectChatRisks, isTerminalTrade, maskSensitive, type MessageDto } from "@wasitx/shared";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService } from "../../common/prisma.service.js";
import type { Message, MessageSenderRole, Trade } from "../../generated/prisma/client.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";

/** Signals that should never appear in a P2P trade chat: payment details must come from the platform's instructions. */
const FLAGGING = new Set(["THIRD_PARTY_PAYMENT", "OFF_PLATFORM", "IBAN", "ACCOUNT_NUMBER"]);
const MASKING = new Set(["IBAN", "ACCOUNT_NUMBER", "PHONE_NUMBER"]);
const CHAT_GRACE_AFTER_CLOSE_MS = 24 * 3600_000;

type MessageRow = Message & { files: { id: string; fileName: string; mimeType: string; size: number }[]; sender?: { displayName: string } | null };

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async access(user: AuthUser, tradeId: string, write = false): Promise<{ trade: Trade; role: MessageSenderRole }> {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) throw Errors.notFound("TRADE");
    if (trade.buyerId === user.id) return { trade, role: "BUYER" };
    if (trade.sellerId === user.id) return { trade, role: "SELLER" };
    const perm = write ? "trades:chat_intervene" : "trades:read_all";
    if (user.permissions.has(perm)) return { trade, role: "STAFF" };
    throw Errors.notFound("TRADE");
  }

  private toDto(m: MessageRow, viewerRole: MessageSenderRole, names: Record<string, string>, counterpartyReadAt: Date | null): MessageDto {
    const showRaw = viewerRole === "STAFF" || m.senderRole === viewerRole;
    const mask = !showRaw && m.riskSignals.some((s) => MASKING.has(s));
    return {
      id: m.id,
      tradeId: m.tradeId,
      senderId: m.senderId,
      senderRole: m.senderRole.toLowerCase() as MessageDto["senderRole"],
      senderName: m.senderRole === "SYSTEM" ? "" : m.senderRole === "STAFF" ? "Support" : (names[m.senderId ?? ""] ?? ""),
      body: mask ? maskSensitive(m.body) : m.body,
      riskSignals: m.riskSignals,
      attachments: m.files.map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, size: f.size })),
      readByCounterparty: !!counterpartyReadAt && m.createdAt <= counterpartyReadAt,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async list(user: AuthUser, tradeId: string, before?: string, limit = 50): Promise<MessageDto[]> {
    const { trade, role } = await this.access(user, tradeId);
    const rows = await this.prisma.message.findMany({
      where: { tradeId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      include: { files: { select: { id: true, fileName: true, mimeType: true, size: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });
    const names = await this.names(trade);
    const counterpartyId = role === "BUYER" ? trade.sellerId : trade.buyerId;
    const read = await this.prisma.messageRead.findUnique({ where: { tradeId_userId: { tradeId, userId: counterpartyId } } });
    return rows.reverse().map((m) => this.toDto(m, role, names, read?.lastReadAt ?? null));
  }

  private async names(trade: Trade): Promise<Record<string, string>> {
    const users = await this.prisma.user.findMany({ where: { id: { in: [trade.buyerId, trade.sellerId] } }, select: { id: true, displayName: true } });
    return Object.fromEntries(users.map((u) => [u.id, u.displayName]));
  }

  async send(user: AuthUser, tradeId: string, body: string, attachmentIds: string[] | undefined, ctx: RequestContext): Promise<MessageDto> {
    const { trade, role } = await this.access(user, tradeId, true);
    if (role !== "STAFF" && isTerminalTrade(trade.status) && Date.now() - trade.updatedAt.getTime() > CHAT_GRACE_AFTER_CLOSE_MS) {
      throw new AppError("CHAT_CLOSED", 409);
    }
    const signals = role === "STAFF" ? [] : detectChatRisks(body);
    const flagged = signals.some((s) => FLAGGING.has(s));

    const msg = await this.prisma.tx(async (tx) => {
      const m = await tx.message.create({ data: { tradeId, senderId: user.id, senderRole: role, body, riskSignals: signals, flagged } });
      if (attachmentIds?.length) {
        const n = await tx.fileObject.updateMany({
          where: { id: { in: attachmentIds }, ownerId: user.id, tradeId, purpose: "CHAT_ATTACHMENT", messageId: null, scanStatus: "CLEAN" },
          data: { messageId: m.id },
        });
        if (n.count !== attachmentIds.length) throw new AppError("INVALID_ATTACHMENTS", 422);
      }
      if (flagged) {
        await tx.riskFlag.create({ data: { tradeId, userId: user.id, type: "CHAT_PAYMENT_REDIRECTION", severity: "MEDIUM", details: { messageId: m.id, signals } } });
        await tx.trade.update({ where: { id: tradeId }, data: { requiresReleaseReview: true } });
      }
      if (role === "STAFF") {
        await this.audit.record(tx, { actorType: "STAFF", actorId: user.id, action: "trade.chat_intervention", entityType: "Trade", entityId: tradeId, ctx });
      }
      const recipients = role === "BUYER" ? [trade.sellerId] : role === "SELLER" ? [trade.buyerId] : [trade.buyerId, trade.sellerId];
      for (const r of recipients) {
        const pending = await tx.notification.findFirst({ where: { userId: r, type: "NEW_MESSAGE", readAt: null, link: `/trades/${tradeId}` } });
        if (!pending) await this.outbox.notify(tx, r, "NEW_MESSAGE", { reference: trade.reference }, `/trades/${tradeId}`);
      }
      return tx.message.findUniqueOrThrow({ where: { id: m.id }, include: { files: { select: { id: true, fileName: true, mimeType: true, size: true } } } });
    });
    this.outbox.kick();
    const names = await this.names(trade);
    // Broadcast the counterparty's (masked) view; senders/staff refetch for the raw text if needed.
    const counterpartyRole: MessageSenderRole = role === "BUYER" ? "SELLER" : "BUYER";
    this.realtime.toTrade(tradeId, "message.created", this.toDto(msg, counterpartyRole, names, null));
    return this.toDto(msg, role, names, null);
  }

  async markRead(user: AuthUser, tradeId: string) {
    const { role } = await this.access(user, tradeId);
    if (role === "STAFF") return { ok: true };
    const now = new Date();
    await this.prisma.messageRead.upsert({
      where: { tradeId_userId: { tradeId, userId: user.id } },
      create: { tradeId, userId: user.id, lastReadAt: now },
      update: { lastReadAt: now },
    });
    await this.prisma.notification.updateMany({ where: { userId: user.id, type: "NEW_MESSAGE", link: `/trades/${tradeId}`, readAt: null }, data: { readAt: now } });
    this.realtime.toTrade(tradeId, "message.read", { tradeId, userId: user.id, at: now.toISOString() });
    return { ok: true };
  }

  async report(user: AuthUser, messageId: string, reason: string, ctx: RequestContext) {
    const m = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!m) throw Errors.notFound("MESSAGE");
    const { role } = await this.access(user, m.tradeId);
    if (role === "STAFF" || m.senderId === user.id) throw new AppError("CANNOT_REPORT", 422);
    await this.prisma.tx(async (tx) => {
      try {
        await tx.messageReport.create({ data: { messageId, reporterId: user.id, reason } });
      } catch {
        throw new AppError("ALREADY_REPORTED", 409);
      }
      await tx.message.update({ where: { id: messageId }, data: { flagged: true } });
      await tx.complianceCase.create({ data: { type: "CHAT_FLAG", tradeId: m.tradeId, userId: m.senderId, priority: "MEDIUM", summary: `Message reported: ${reason}` } });
      await this.audit.record(tx, { actorType: "USER", actorId: user.id, action: "message.reported", entityType: "Message", entityId: messageId, ctx });
    });
    return { ok: true };
  }
}
