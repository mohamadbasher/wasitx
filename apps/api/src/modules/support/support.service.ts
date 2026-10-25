import { Injectable } from "@nestjs/common";
import type { AuthUser } from "../../common/auth/auth.types.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService } from "../../common/prisma.service.js";
import type { TicketCategory, TicketStatus } from "../../generated/prisma/client.js";
import { OutboxService } from "../outbox/outbox.service.js";

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  async create(user: AuthUser, p: { subject: string; body: string; category: TicketCategory; tradeId?: string }) {
    if (p.tradeId) {
      const t = await this.prisma.trade.findUnique({ where: { id: p.tradeId }, select: { buyerId: true, sellerId: true } });
      if (!t || (t.buyerId !== user.id && t.sellerId !== user.id)) throw Errors.notFound("TRADE");
    }
    const open = await this.prisma.supportTicket.count({ where: { userId: user.id, status: { in: ["OPEN", "AWAITING_SUPPORT", "AWAITING_USER"] } } });
    if (open >= 10) throw new AppError("TOO_MANY_OPEN_TICKETS", 422);
    const t = await this.prisma.supportTicket.create({
      data: { userId: user.id, subject: p.subject, category: p.category, tradeId: p.tradeId ?? null, messages: { create: { authorId: user.id, isStaff: false, body: p.body } } },
    });
    return this.get(user, t.id);
  }

  async mine(userId: string) {
    const rows = await this.prisma.supportTicket.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 50 });
    return rows.map((t) => ({ id: t.id, subject: t.subject, category: t.category, status: t.status, tradeId: t.tradeId, updatedAt: t.updatedAt.toISOString(), createdAt: t.createdAt.toISOString() }));
  }

  async get(user: AuthUser, id: string) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } }, user: { select: { displayName: true, email: true } } } });
    const staff = user.permissions.has("support:manage");
    if (!t || (t.userId !== user.id && !staff)) throw Errors.notFound("TICKET");
    return {
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      tradeId: t.tradeId,
      user: staff ? t.user : undefined,
      createdAt: t.createdAt.toISOString(),
      messages: t.messages
        .filter((m) => staff || !m.internal)
        .map((m) => ({ id: m.id, isStaff: m.isStaff, internal: m.internal, body: m.body, createdAt: m.createdAt.toISOString() })),
    };
  }

  async reply(user: AuthUser, id: string, body: string, internal = false) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    const staff = user.permissions.has("support:manage") && t?.userId !== user.id;
    if (!t || (t.userId !== user.id && !staff)) throw Errors.notFound("TICKET");
    if (t.status === "CLOSED") throw new AppError("TICKET_CLOSED", 409);
    await this.prisma.tx(async (tx) => {
      await tx.ticketMessage.create({ data: { ticketId: id, authorId: user.id, isStaff: staff, internal: staff && internal, body } });
      const status: TicketStatus = staff ? (internal ? t.status : "AWAITING_USER") : "AWAITING_SUPPORT";
      await tx.supportTicket.update({ where: { id }, data: { status, ...(staff && !t.assignedToId ? { assignedToId: user.id } : {}) } });
      if (staff && !internal) await this.outbox.notify(tx, t.userId, "SUPPORT_REPLY", { subject: t.subject }, `/support?ticket=${id}`);
    });
    this.outbox.kick();
    return this.get(user, id);
  }

  async inbox(status?: string) {
    const rows = await this.prisma.supportTicket.findMany({
      where: status ? { status: status as TicketStatus } : { status: { in: ["OPEN", "AWAITING_SUPPORT"] } },
      include: { user: { select: { displayName: true, email: true } } },
      orderBy: { updatedAt: "asc" },
      take: 200,
    });
    return rows.map((t) => ({ id: t.id, subject: t.subject, category: t.category, status: t.status, user: t.user, assignedToId: t.assignedToId, updatedAt: t.updatedAt.toISOString() }));
  }

  async setStatus(id: string, status: TicketStatus) {
    await this.prisma.supportTicket.update({ where: { id }, data: { status } });
    return { ok: true };
  }
}
