import { Injectable, OnModuleInit } from "@nestjs/common";
import type { DisputeDto, DisputeOutcome, DisputeReason } from "@wasitx/shared";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService, type Tx } from "../../common/prisma.service.js";
import { ApprovalsService } from "../approvals/approvals.service.js";
import { AuditService } from "../audit/audit.service.js";
import { SystemConfigService } from "../config/system-config.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { EscrowService } from "../trades/escrow.service.js";
import { TradeEngine } from "../trades/trade-engine.service.js";

@Injectable()
export class DisputesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: TradeEngine,
    private readonly escrow: EscrowService,
    private readonly approvals: ApprovalsService,
    private readonly config: SystemConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  onModuleInit() {
    this.approvals.register("DISPUTE_RESOLUTION", async (p, c) =>
      this.execute(p.disputeId as string, p.outcome as DisputeOutcome, p.findings as string, c.requestedById, c.approvedById, c.requestCtx),
    );
  }

  private async attachEvidence(tx: Tx, userId: string, messageId: string, ids?: string[]) {
    if (!ids?.length) return;
    const n = await tx.fileObject.updateMany({
      where: { id: { in: ids }, ownerId: userId, purpose: "DISPUTE_EVIDENCE", disputeMessageId: null, scanStatus: "CLEAN" },
      data: { disputeMessageId: messageId },
    });
    if (n.count !== ids.length) throw new AppError("INVALID_ATTACHMENTS", 422);
  }

  async open(user: AuthUser, tradeId: string, input: { reason: DisputeReason; description: string; evidenceFileIds?: string[] }, ctx: RequestContext) {
    const settings = await this.config.tradingSettings();
    const t0 = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!t0 || (t0.buyerId !== user.id && t0.sellerId !== user.id)) throw Errors.notFound("TRADE");
    const role = t0.buyerId === user.id ? "buyer" : "seller";

    const disputeId = await this.prisma.tx(async (tx) => {
      await this.engine.transition(tradeId, "open_dispute", { type: "USER", id: user.id, role }, {
        tx,
        ctx,
        note: input.reason,
        guard: (t) => {
          const mins = t.markedPaidAt ? (Date.now() - t.markedPaidAt.getTime()) / 60_000 : 0;
          if (role === "buyer" && mins < settings.disputeAfterMinutes) {
            throw new AppError("DISPUTE_TOO_EARLY", 409, undefined, { availableInMinutes: Math.ceil(settings.disputeAfterMinutes - mins) });
          }
        },
      });
      const d = await tx.dispute.create({
        data: { tradeId, openedById: user.id, openedByRole: role.toUpperCase(), reason: input.reason, description: input.description },
      });
      const m = await tx.disputeMessage.create({ data: { disputeId: d.id, authorId: user.id, authorRole: role.toUpperCase(), body: input.description } });
      await this.attachEvidence(tx, user.id, m.id, input.evidenceFileIds);
      await this.audit.record(tx, { actorType: "USER", actorId: user.id, action: "dispute.opened", entityType: "Dispute", entityId: d.id, data: { reason: input.reason }, ctx });
      return d.id;
    });
    this.outbox.kick();
    return this.get(user, disputeId);
  }

  async get(user: AuthUser, id: string): Promise<DisputeDto> {
    const d = await this.prisma.dispute.findUnique({
      where: { id },
      include: { trade: { select: { reference: true, buyerId: true, sellerId: true } }, messages: { include: { files: true }, orderBy: { createdAt: "asc" } } },
    });
    const isParty = d && (d.trade.buyerId === user.id || d.trade.sellerId === user.id);
    const isStaff = user.permissions.has("disputes:read");
    if (!d || (!isParty && !isStaff)) throw Errors.notFound("DISPUTE");
    return {
      id: d.id,
      tradeId: d.tradeId,
      tradeReference: d.trade.reference,
      status: d.status,
      reason: d.reason,
      description: d.description,
      openedByRole: d.openedByRole.toLowerCase() as "buyer" | "seller",
      outcome: d.outcome,
      findings: d.status === "RESOLVED" || isStaff ? d.findings : null,
      createdAt: d.createdAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
      messages: d.messages
        .filter((m) => isStaff || !m.staffOnly)
        .map((m) => ({
          id: m.id,
          authorRole: m.staffOnly ? "STAFF_NOTE" : m.authorRole,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          evidence: m.files.map((f) => ({ id: f.id, fileName: f.fileName })),
        })),
    };
  }

  async addMessage(user: AuthUser, id: string, body: string, evidenceFileIds: string[] | undefined, staffOnly: boolean, ctx: RequestContext) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { trade: true } });
    if (!d) throw Errors.notFound("DISPUTE");
    const isStaff = user.permissions.has("disputes:manage");
    const role = d.trade.buyerId === user.id ? "BUYER" : d.trade.sellerId === user.id ? "SELLER" : isStaff ? "STAFF" : null;
    if (!role) throw Errors.notFound("DISPUTE");
    if (d.status === "RESOLVED") throw new AppError("DISPUTE_RESOLVED", 409);
    await this.prisma.tx(async (tx) => {
      const m = await tx.disputeMessage.create({ data: { disputeId: id, authorId: user.id, authorRole: role, body, staffOnly: role === "STAFF" && staffOnly } });
      await this.attachEvidence(tx, user.id, m.id, evidenceFileIds);
      if (role !== "STAFF" && d.status === "AWAITING_INFO") await tx.dispute.update({ where: { id }, data: { status: "UNDER_REVIEW" } });
      if (role === "STAFF" && !staffOnly) {
        for (const u of [d.trade.buyerId, d.trade.sellerId]) await this.outbox.notify(tx, u, "DISPUTE_UPDATE", { reference: d.trade.reference }, `/disputes/${id}`);
      }
      await this.audit.record(tx, { actorType: role === "STAFF" ? "STAFF" : "USER", actorId: user.id, action: "dispute.message", entityType: "Dispute", entityId: id, data: { staffOnly }, ctx });
    });
    this.outbox.kick();
    return this.get(user, id);
  }

  async list(status?: string, assignedToId?: string) {
    const rows = await this.prisma.dispute.findMany({
      where: { ...(status ? { status: status as never } : {}), ...(assignedToId ? { assignedToId } : {}) },
      include: { trade: { select: { reference: true, amountUsdt: true, fiatAgorot: true, status: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return rows.map((d) => ({
      id: d.id,
      tradeId: d.tradeId,
      tradeReference: d.trade.reference,
      tradeStatus: d.trade.status,
      amountUsdt: d.trade.amountUsdt.toString(),
      fiatAgorot: d.trade.fiatAgorot.toString(),
      reason: d.reason,
      status: d.status,
      openedByRole: d.openedByRole,
      assignedToId: d.assignedToId,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async assign(staff: AuthUser, id: string, ctx: RequestContext) {
    await this.prisma.dispute.update({ where: { id }, data: { assignedToId: staff.id, status: "UNDER_REVIEW" } });
    await this.audit.recordNow({ actorType: "STAFF", actorId: staff.id, action: "dispute.assigned", entityType: "Dispute", entityId: id, ctx });
    return { ok: true };
  }

  async requestInfo(staff: AuthUser, id: string, party: "BUYER" | "SELLER" | "BOTH", message: string, ctx: RequestContext) {
    const d = await this.prisma.dispute.findUniqueOrThrow({ where: { id }, include: { trade: true } });
    await this.prisma.tx(async (tx) => {
      await tx.dispute.update({ where: { id }, data: { status: "AWAITING_INFO" } });
      await tx.disputeMessage.create({ data: { disputeId: id, authorId: staff.id, authorRole: "STAFF", body: message } });
      const targets = party === "BOTH" ? [d.trade.buyerId, d.trade.sellerId] : [party === "BUYER" ? d.trade.buyerId : d.trade.sellerId];
      for (const u of targets) await this.outbox.notify(tx, u, "DISPUTE_UPDATE", { reference: d.trade.reference }, `/disputes/${id}`);
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "dispute.request_info", entityType: "Dispute", entityId: id, data: { party }, ctx });
    });
    this.outbox.kick();
    return { ok: true };
  }

  async escalate(staff: AuthUser, id: string, note: string, ctx: RequestContext) {
    const d = await this.prisma.dispute.findUniqueOrThrow({ where: { id } });
    await this.prisma.tx(async (tx) => {
      await tx.dispute.update({ where: { id }, data: { status: "ESCALATED" } });
      await tx.complianceCase.create({ data: { type: "SUSPICIOUS_ACTIVITY", tradeId: d.tradeId, priority: "HIGH", summary: `Escalated from dispute: ${note}` } });
      await tx.disputeMessage.create({ data: { disputeId: id, authorId: staff.id, authorRole: "STAFF", body: note, staffOnly: true } });
      await this.audit.record(tx, { actorType: "STAFF", actorId: staff.id, action: "dispute.escalated", entityType: "Dispute", entityId: id, ctx });
    });
    return { ok: true };
  }

  /** Resolution entry point: direct for small trades, four-eyes approval above the threshold. */
  async resolve(staff: AuthUser, id: string, outcome: DisputeOutcome, findings: string, ctx: RequestContext) {
    const d = await this.prisma.dispute.findUnique({ where: { id }, include: { trade: true } });
    if (!d) throw Errors.notFound("DISPUTE");
    if (d.status === "RESOLVED") throw new AppError("DISPUTE_RESOLVED", 409);
    if (d.trade.status !== "DISPUTED") throw new AppError("TRADE_NOT_IN_DISPUTE", 409, undefined, { status: d.trade.status });
    const rules = await this.config.parsedRiskRules();
    if (d.trade.amountUsdt >= rules.dualApprovalThresholdUsdt) {
      const r = await this.prisma.tx((tx) => this.approvals.request(tx, "DISPUTE_RESOLUTION", id, { disputeId: id, outcome, findings }, staff.id, findings));
      return { pendingApproval: true, approvalId: r.id };
    }
    await this.execute(id, outcome, findings, staff.id, null, ctx);
    return { pendingApproval: false };
  }

  private async execute(id: string, outcome: DisputeOutcome, findings: string, resolvedById: string, approvedById: string | null, ctx?: RequestContext) {
    const d = await this.prisma.dispute.findUniqueOrThrow({ where: { id }, include: { trade: true } });
    const actor = { type: "STAFF" as const, id: resolvedById, role: "dispute_manager" as const };
    await this.prisma.tx(async (tx) => {
      if (outcome === "RELEASE_TO_BUYER") {
        await this.engine.transition(d.tradeId, "resolve_release_to_buyer", actor, { tx, ctx, note: findings, data: { settlementBasis: "DISPUTE" }, metadata: { approvedById } });
        await tx.traderStats.upsert({ where: { userId: d.trade.sellerId }, create: { userId: d.trade.sellerId, finishedTrades: 1 }, update: { finishedTrades: { increment: 1 } } });
      } else {
        await this.engine.transition(d.tradeId, "resolve_refund_to_seller", actor, { tx, ctx, note: findings, data: { cancelReason: "Dispute resolved for seller" }, faultParty: "buyer", metadata: { approvedById } });
      }
      await tx.dispute.update({ where: { id }, data: { status: "RESOLVED", outcome, findings, resolvedById, resolvedAt: new Date() } });
      for (const u of [d.trade.buyerId, d.trade.sellerId]) await this.outbox.notify(tx, u, "DISPUTE_RESOLVED", { reference: d.trade.reference }, `/disputes/${id}`);
      await this.audit.record(tx, { actorType: "STAFF", actorId: resolvedById, action: "dispute.resolved", entityType: "Dispute", entityId: id, data: { outcome, approvedById }, ctx });
    });
    this.outbox.kick();
    await this.escrow.processTrade(d.tradeId);
    return { ok: true };
  }
}
