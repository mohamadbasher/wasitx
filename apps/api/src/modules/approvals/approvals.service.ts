import { Injectable } from "@nestjs/common";
import type { Permission } from "@wasitx/shared";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService, type Tx } from "../../common/prisma.service.js";
import type { ApprovalType } from "../../generated/prisma/client.js";
import { AuditService } from "../audit/audit.service.js";

type Handler = (payload: Record<string, unknown>, ctx: { requestedById: string; approvedById: string; requestCtx?: RequestContext }) => Promise<unknown>;

const REQUIRED: Record<ApprovalType, Permission> = {
  DISPUTE_RESOLUTION: "disputes:resolve",
  FROZEN_TRADE_CANCEL: "trades:freeze",
  WITHDRAWAL: "withdrawals:approve",
  ROLE_GRANT_PRIVILEGED: "staff_roles:grant_super",
};

/**
 * Four-eyes control for high-risk manual operations: the requester can never approve their own
 * request, and the approver must hold the operation's permission. Execution happens only after
 * approval, through a handler registered by the owning module.
 */
@Injectable()
export class ApprovalsService {
  private readonly handlers = new Map<ApprovalType, Handler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  register(type: ApprovalType, handler: Handler) {
    this.handlers.set(type, handler);
  }

  async request(tx: Tx, type: ApprovalType, referenceId: string, payload: Record<string, unknown>, requestedById: string, note?: string) {
    const open = await tx.approvalRequest.findFirst({ where: { type, referenceId, status: "PENDING" } });
    if (open) throw new AppError("APPROVAL_ALREADY_PENDING", 409, undefined, { approvalId: open.id });
    const r = await tx.approvalRequest.create({ data: { type, referenceId, payload: payload as object, requestedById, requestNote: note ?? null } });
    await this.audit.record(tx, { actorType: "STAFF", actorId: requestedById, action: "approval.requested", entityType: "ApprovalRequest", entityId: r.id, data: { type, referenceId } });
    return r;
  }

  async list(status?: string) {
    const rows = await this.prisma.approvalRequest.findMany({
      where: status ? { status: status as never } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const staffIds = [...new Set(rows.flatMap((r) => [r.requestedById, r.decidedById].filter(Boolean) as string[]))];
    const staff = await this.prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } });
    const name = (id: string | null) => staff.find((s) => s.id === id)?.displayName ?? null;
    return rows.map((r) => ({ ...r, requestedBy: name(r.requestedById), decidedBy: name(r.decidedById) }));
  }

  async approve(staff: AuthUser, id: string, note: string | undefined, ctx: RequestContext) {
    const r = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!r) throw Errors.notFound("APPROVAL");
    if (r.status !== "PENDING") throw new AppError("APPROVAL_NOT_PENDING", 409);
    if (r.requestedById === staff.id) throw new AppError("DUAL_APPROVAL_SAME_PERSON", 403);
    if (!staff.permissions.has(REQUIRED[r.type])) throw Errors.forbidden("MISSING_PERMISSION");
    const handler = this.handlers.get(r.type);
    if (!handler) throw new AppError("APPROVAL_HANDLER_MISSING", 500);

    const claimed = await this.prisma.approvalRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", decidedById: staff.id, decisionNote: note ?? null, decidedAt: new Date() },
    });
    if (!claimed.count) throw new AppError("APPROVAL_NOT_PENDING", 409);
    await this.audit.recordNow({ actorType: "STAFF", actorId: staff.id, action: "approval.approved", entityType: "ApprovalRequest", entityId: id, data: { type: r.type }, ctx });
    try {
      const result = await handler(r.payload as Record<string, unknown>, { requestedById: r.requestedById, approvedById: staff.id, requestCtx: ctx });
      await this.prisma.approvalRequest.update({ where: { id }, data: { status: "EXECUTED", executedAt: new Date() } });
      return { status: "EXECUTED", result };
    } catch (e) {
      const message = (e as AppError).code ?? (e as Error).message;
      await this.prisma.approvalRequest.update({ where: { id }, data: { status: "FAILED", error: message } });
      throw e;
    }
  }

  async reject(staff: AuthUser, id: string, note: string | undefined, ctx: RequestContext) {
    const r = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!r) throw Errors.notFound("APPROVAL");
    if (!staff.permissions.has(REQUIRED[r.type])) throw Errors.forbidden("MISSING_PERMISSION");
    const done = await this.prisma.approvalRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", decidedById: staff.id, decisionNote: note ?? null, decidedAt: new Date() },
    });
    if (!done.count) throw new AppError("APPROVAL_NOT_PENDING", 409);
    await this.audit.recordNow({ actorType: "STAFF", actorId: staff.id, action: "approval.rejected", entityType: "ApprovalRequest", entityId: id, ctx });
    return { status: "REJECTED" };
  }
}
