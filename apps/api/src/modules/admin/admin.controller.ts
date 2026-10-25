import { Body, Controller, Get, Header, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  adminListQuery,
  announcementSchema,
  approvalDecisionSchema,
  commissionConfigSchema,
  complianceApproveSchema,
  disputeMessageSchema,
  freezeTradeSchema,
  gateSchema,
  kycDecisionSchema,
  requestInfoSchema,
  resolveDisputeSchema,
  riskRulesSchema,
  ticketMessageSchema,
  toggleSchema,
  userRolesSchema,
  userStatusSchema,
  type RiskRules,
} from "@wasitx/shared";
import { z } from "zod";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { Ctx, CurrentUser, RequirePermissions, Staff } from "../../common/auth/decorators.js";
import { ZBody, ZQuery } from "../../common/zod.js";
import { ApprovalsService } from "../approvals/approvals.service.js";
import { SystemConfigService } from "../config/system-config.service.js";
import { DisputesService } from "../disputes/disputes.service.js";
import { KycService } from "../kyc/kyc.service.js";
import { OffersService } from "../offers/offers.service.js";
import { SupportService } from "../support/support.service.js";
import { TradeEngine } from "../trades/trade-engine.service.js";
import { TradesService } from "../trades/trades.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { AdminService } from "./admin.service.js";

type ListQ = z.infer<typeof adminListQuery>;
const reason = z.object({ reason: z.string().trim().min(3).max(500) });

@ApiTags("admin")
@Staff()
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly kyc: KycService,
    private readonly trades: TradesService,
    private readonly engine: TradeEngine,
    private readonly disputes: DisputesService,
    private readonly approvals: ApprovalsService,
    private readonly offers: OffersService,
    private readonly support: SupportService,
    private readonly wallet: WalletService,
    private readonly config: SystemConfigService,
  ) {}

  @Get("overview")
  overview() {
    return this.admin.overview();
  }

  // users
  @RequirePermissions("users:read")
  @Get("users")
  users(@ZQuery(adminListQuery) q: ListQ) {
    return this.admin.users(q);
  }

  @RequirePermissions("users:read")
  @Get("users/:id")
  user(@Param("id") id: string) {
    return this.admin.user(id);
  }

  @RequirePermissions("users:manage_status")
  @Post("users/:id/status")
  @HttpCode(200)
  setStatus(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(userStatusSchema) b: z.infer<typeof userStatusSchema>, @Ctx() ctx: RequestContext) {
    return this.admin.setUserStatus(s, id, b.status, b.reason, ctx);
  }

  @RequirePermissions("roles:manage")
  @Post("users/:id/roles")
  @HttpCode(200)
  setRoles(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(userRolesSchema) b: z.infer<typeof userRolesSchema>, @Ctx() ctx: RequestContext) {
    return this.admin.setUserRoles(s, id, b.roles, ctx);
  }

  @RequirePermissions("users:read")
  @Get("employees")
  employees() {
    return this.admin.employees();
  }

  // kyc
  @RequirePermissions("kyc:review")
  @Get("kyc/queue")
  kycQueue(@Query("status") status?: string) {
    return this.admin.kycQueue(status);
  }

  @RequirePermissions("kyc:review")
  @Post("kyc/:id/decision")
  @HttpCode(200)
  kycDecision(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(kycDecisionSchema) b: z.infer<typeof kycDecisionSchema>, @Ctx() ctx: RequestContext) {
    return this.kyc.decide(s.id, id, b.decision, b.note, ctx);
  }

  // offers
  @RequirePermissions("offers:moderate")
  @Post("offers/:id/suspend")
  @HttpCode(200)
  suspendOffer(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(reason) b: { reason: string }, @Ctx() ctx: RequestContext) {
    return this.offers.act(s, id, "suspend", "staff", ctx, b.reason);
  }

  @RequirePermissions("offers:moderate")
  @Post("offers/:id/unsuspend")
  @HttpCode(200)
  unsuspendOffer(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(reason) b: { reason: string }, @Ctx() ctx: RequestContext) {
    return this.offers.act(s, id, "unsuspend", "staff", ctx, b.reason);
  }

  // trades
  @RequirePermissions("trades:read_all")
  @Get("trades")
  tradesList(@ZQuery(adminListQuery) q: ListQ) {
    return this.admin.tradesList(q);
  }

  @RequirePermissions("trades:read_all")
  @Get("trades/:id")
  trade(@CurrentUser() s: AuthUser, @Param("id") id: string) {
    return this.admin.tradeDetail(s, id);
  }

  @RequirePermissions("trades:freeze")
  @Post("trades/:id/freeze")
  @HttpCode(200)
  freeze(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(freezeTradeSchema) b: { reason: string }, @Ctx() ctx: RequestContext) {
    return this.engine.freeze(id, { type: "STAFF", id: s.id, role: "compliance" }, b.reason, ctx);
  }

  @RequirePermissions("trades:freeze")
  @Post("trades/:id/unfreeze")
  @HttpCode(200)
  unfreeze(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(freezeTradeSchema) b: { reason: string }, @Ctx() ctx: RequestContext) {
    return this.engine.unfreeze(id, { type: "STAFF", id: s.id, role: "compliance" }, b.reason, ctx);
  }

  @RequirePermissions("trades:freeze")
  @Post("trades/:id/cancel-frozen")
  @HttpCode(200)
  cancelFrozen(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(reason) b: { reason: string }) {
    return this.admin.requestCancelFrozen(s, id, b.reason);
  }

  @RequirePermissions("trades:compliance_approve")
  @Post("trades/:id/compliance-approve")
  @HttpCode(200)
  complianceApprove(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(complianceApproveSchema) b: { note: string }, @Ctx() ctx: RequestContext) {
    return this.trades.complianceApprove(s, id, b.note, ctx);
  }

  @RequirePermissions("trades:compliance_approve")
  @Post("trades/:id/compliance-reject")
  @HttpCode(200)
  complianceReject(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(complianceApproveSchema) b: { note: string }, @Ctx() ctx: RequestContext) {
    return this.trades.complianceReject(s, id, b.note, ctx);
  }

  // disputes
  @RequirePermissions("disputes:read")
  @Get("disputes")
  disputesList(@Query("status") status?: string, @Query("mine") mine?: string, @CurrentUser() s?: AuthUser) {
    return this.disputes.list(status, mine === "1" ? s?.id : undefined);
  }

  @RequirePermissions("disputes:manage")
  @Post("disputes/:id/assign")
  @HttpCode(200)
  assign(@CurrentUser() s: AuthUser, @Param("id") id: string, @Ctx() ctx: RequestContext) {
    return this.disputes.assign(s, id, ctx);
  }

  @RequirePermissions("disputes:manage")
  @Post("disputes/:id/messages")
  @HttpCode(200)
  disputeNote(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(disputeMessageSchema.extend({ staffOnly: z.boolean().default(false) })) b: { body: string; staffOnly: boolean; evidenceFileIds?: string[] }, @Ctx() ctx: RequestContext) {
    return this.disputes.addMessage(s, id, b.body, b.evidenceFileIds, b.staffOnly, ctx);
  }

  @RequirePermissions("disputes:manage")
  @Post("disputes/:id/request-info")
  @HttpCode(200)
  requestInfo(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(requestInfoSchema) b: z.infer<typeof requestInfoSchema>, @Ctx() ctx: RequestContext) {
    return this.disputes.requestInfo(s, id, b.party, b.message, ctx);
  }

  @RequirePermissions("disputes:manage")
  @Post("disputes/:id/escalate")
  @HttpCode(200)
  escalate(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(reason) b: { reason: string }, @Ctx() ctx: RequestContext) {
    return this.disputes.escalate(s, id, b.reason, ctx);
  }

  @RequirePermissions("disputes:resolve")
  @Post("disputes/:id/resolve")
  @HttpCode(200)
  resolve(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(resolveDisputeSchema) b: z.infer<typeof resolveDisputeSchema>, @Ctx() ctx: RequestContext) {
    return this.disputes.resolve(s, id, b.outcome, b.findings, ctx);
  }

  // approvals
  @RequirePermissions("approvals:decide")
  @Get("approvals")
  approvalsList(@Query("status") status?: string) {
    return this.approvals.list(status);
  }

  @RequirePermissions("approvals:decide")
  @Post("approvals/:id/approve")
  @HttpCode(200)
  approve(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(approvalDecisionSchema) b: { note?: string }, @Ctx() ctx: RequestContext) {
    return this.approvals.approve(s, id, b.note, ctx);
  }

  @RequirePermissions("approvals:decide")
  @Post("approvals/:id/reject")
  @HttpCode(200)
  reject(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(approvalDecisionSchema) b: { note?: string }, @Ctx() ctx: RequestContext) {
    return this.approvals.reject(s, id, b.note, ctx);
  }

  @RequirePermissions("withdrawals:approve")
  @Post("withdrawals/:id/reject")
  @HttpCode(200)
  rejectWithdrawal(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(reason) b: { reason: string }) {
    return this.wallet.adminRejectWithdrawal(s, id, b.reason);
  }

  // compliance
  @RequirePermissions("compliance:read")
  @Get("compliance/alerts")
  alerts(@Query("all") all?: string) {
    return this.admin.riskFlags(all !== "1");
  }

  @RequirePermissions("compliance:manage")
  @Post("compliance/alerts/:id/resolve")
  @HttpCode(200)
  resolveAlert(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(z.object({ resolution: z.string().trim().min(3).max(1000) })) b: { resolution: string }, @Ctx() ctx: RequestContext) {
    return this.admin.resolveFlag(s, id, b.resolution, ctx);
  }

  @RequirePermissions("compliance:read")
  @Get("compliance/cases")
  cases(@Query("status") status?: string) {
    return this.admin.cases(status);
  }

  @RequirePermissions("compliance:manage")
  @Post("compliance/cases/:id")
  @HttpCode(200)
  updateCase(
    @CurrentUser() s: AuthUser,
    @Param("id") id: string,
    @ZBody(z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "ESCALATED", "CLOSED_NO_ACTION", "CLOSED_REPORTED"]).optional(), note: z.string().trim().max(2000).optional() })) b: { status?: "OPEN" | "IN_PROGRESS" | "ESCALATED" | "CLOSED_NO_ACTION" | "CLOSED_REPORTED"; note?: string },
    @Ctx() ctx: RequestContext,
  ) {
    return this.admin.updateCase(s, id, b, ctx);
  }

  // risk & config
  @RequirePermissions("risk:manage")
  @Get("risk/rules")
  async riskRules() {
    return { rules: await this.config.riskRules(), settings: await this.config.tradingSettings() };
  }

  @RequirePermissions("risk:manage")
  @Put("risk/rules")
  setRiskRules(@CurrentUser() s: AuthUser, @ZBody(riskRulesSchema) b: RiskRules, @Ctx() ctx: RequestContext) {
    return this.admin.setRiskRules(s, b, ctx);
  }

  @RequirePermissions("risk:manage")
  @Put("risk/settings")
  setSettings(
    @CurrentUser() s: AuthUser,
    @ZBody(z.object({ disputeAfterMinutes: z.number().int().optional(), autoWithdrawalLimitUsdt: z.string().optional(), markPaidGraceMinutes: z.number().int().min(0).max(30).optional() })) b: object,
    @Ctx() ctx: RequestContext,
  ) {
    return this.admin.setTradingSettings(s, b, ctx);
  }

  @RequirePermissions("revenue:read")
  @Get("revenue")
  revenue(@Query("days") days?: string) {
    return this.admin.revenue(z.coerce.number().int().min(1).max(365).default(30).parse(days));
  }

  @RequirePermissions("revenue:read")
  @Get("commission")
  commission() {
    return this.admin.commissionHistory();
  }

  @RequirePermissions("commission:manage")
  @Post("commission")
  setCommission(@CurrentUser() s: AuthUser, @ZBody(commissionConfigSchema) b: z.infer<typeof commissionConfigSchema>, @Ctx() ctx: RequestContext) {
    return this.admin.setCommission(s, b, ctx);
  }

  @Get("payment-methods")
  paymentMethods() {
    return this.admin.paymentMethods();
  }

  @RequirePermissions("payment_methods:manage")
  @Post("payment-methods/:code")
  @HttpCode(200)
  togglePm(@CurrentUser() s: AuthUser, @Param("code") code: string, @ZBody(toggleSchema) b: z.infer<typeof toggleSchema>, @Ctx() ctx: RequestContext) {
    return this.admin.togglePaymentMethod(s, code, b.enabled, b.note, ctx);
  }

  @Get("networks")
  networks() {
    return this.admin.networks();
  }

  @RequirePermissions("networks:manage")
  @Post("networks/:code")
  @HttpCode(200)
  toggleNetwork(@CurrentUser() s: AuthUser, @Param("code") code: string, @ZBody(toggleSchema) b: z.infer<typeof toggleSchema>, @Ctx() ctx: RequestContext) {
    return this.admin.toggleNetwork(s, code, b.enabled, b.note, ctx);
  }

  @RequirePermissions("config:manage")
  @Get("settings/gates")
  gates() {
    return this.admin.gates();
  }

  @RequirePermissions("gates:manage")
  @Post("settings/gates")
  @HttpCode(200)
  setGate(@CurrentUser() s: AuthUser, @ZBody(gateSchema) b: z.infer<typeof gateSchema>, @Ctx() ctx: RequestContext) {
    return this.admin.setGate(s, b.gate, b.value, b.evidence, ctx);
  }

  // announcements
  @Get("announcements")
  announcements() {
    return this.admin.announcements();
  }

  @RequirePermissions("announcements:manage")
  @Post("announcements")
  createAnnouncement(@CurrentUser() s: AuthUser, @ZBody(announcementSchema) b: z.infer<typeof announcementSchema>, @Ctx() ctx: RequestContext) {
    return this.admin.createAnnouncement(s, b, ctx);
  }

  @RequirePermissions("announcements:manage")
  @Post("announcements/:id/archive")
  @HttpCode(200)
  archive(@Param("id") id: string) {
    return this.admin.archiveAnnouncement(id);
  }

  // support
  @RequirePermissions("support:manage")
  @Get("support/inbox")
  inbox(@Query("status") status?: string) {
    return this.support.inbox(status);
  }

  @RequirePermissions("support:manage")
  @Get("support/tickets/:id")
  ticket(@CurrentUser() s: AuthUser, @Param("id") id: string) {
    return this.support.get(s, id);
  }

  @RequirePermissions("support:manage")
  @Post("support/tickets/:id/messages")
  @HttpCode(200)
  supportReply(@CurrentUser() s: AuthUser, @Param("id") id: string, @ZBody(ticketMessageSchema.extend({ internal: z.boolean().default(false) })) b: { body: string; internal: boolean }) {
    return this.support.reply(s, id, b.body, b.internal);
  }

  @RequirePermissions("support:manage")
  @Post("support/tickets/:id/status")
  @HttpCode(200)
  ticketStatus(@Param("id") id: string, @ZBody(z.object({ status: z.enum(["OPEN", "AWAITING_SUPPORT", "AWAITING_USER", "RESOLVED", "CLOSED"]) })) b: { status: "OPEN" | "AWAITING_SUPPORT" | "AWAITING_USER" | "RESOLVED" | "CLOSED" }) {
    return this.support.setStatus(id, b.status);
  }

  // audit, reconciliation, reports
  @RequirePermissions("audit:read")
  @Get("audit")
  audit(@ZQuery(adminListQuery) q: ListQ) {
    return this.admin.auditLog(q);
  }

  @RequirePermissions("audit:read")
  @Get("audit/verify")
  verifyAudit() {
    return this.admin.verifyAudit();
  }

  @RequirePermissions("reconciliation:read")
  @Post("reconciliation/run")
  @HttpCode(200)
  reconcile() {
    return this.admin.reconciliation();
  }

  @RequirePermissions("reconciliation:read")
  @Get("reconciliation/last")
  lastRecon() {
    return this.config.get("recon.last", null);
  }

  @RequirePermissions("reconciliation:read")
  @Post("reconciliation/statement")
  @HttpCode(200)
  importStatement(@CurrentUser() s: AuthUser, @Body() body: { csv?: string }, @Ctx() ctx: RequestContext) {
    return this.admin.importStatement(s, z.string().max(500_000).parse(body?.csv ?? ""), ctx);
  }

  @RequirePermissions("reports:export")
  @Get("reports/:kind.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  export(@Param("kind") kind: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.admin.exportCsv(z.enum(["trades", "fees", "ledger"]).parse(kind), from, to);
  }
}
