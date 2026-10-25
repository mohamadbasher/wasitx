import { Controller, Delete, Get, Headers, HttpCode, Param, Post, Put, Patch, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  NETWORK_CODES,
  formatUsdt,
  bankAccountSchema,
  createTicketSchema,
  kycSandboxCompleteSchema,
  kycStartSchema,
  notificationPrefsSchema,
  pushTokenSchema,
  sandboxDepositSchema,
  ticketMessageSchema,
  updateProfileSchema,
  withdrawalSchema,
  type KycStartInput,
} from "@wasitx/shared";
import { z } from "zod";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { Ctx, CurrentUser, Idempotent, Public, RateLimit, VerifiedTrader } from "../../common/auth/decorators.js";
import { ZBody } from "../../common/zod.js";
import { KycService } from "../kyc/kyc.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { SupportService } from "../support/support.service.js";
import { WalletService } from "../wallet/wallet.service.js";
import { UsersService } from "./users.service.js";
import { PrismaService } from "../../common/prisma.service.js";

@ApiTags("account")
@Controller()
export class AccountController {
  constructor(
    private readonly users: UsersService,
    private readonly kyc: KycService,
    private readonly notifications: NotificationsService,
    private readonly support: SupportService,
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  // ── profile ────────────────────────────────────────────────────────────────
  @Patch("me/profile")
  profile(@CurrentUser() user: AuthUser, @ZBody(updateProfileSchema) body: z.infer<typeof updateProfileSchema>) {
    return this.users.updateProfile(user.id, body);
  }

  @Post("me/delete-request")
  @HttpCode(200)
  deleteRequest(@CurrentUser() user: AuthUser, @Ctx() ctx: RequestContext) {
    return this.users.requestDeletion(user.id, ctx);
  }

  /** Dashboard aggregates for the signed-in user. */
  @Get("me/dashboard")
  async dashboard(@CurrentUser() user: AuthUser) {
    const [stats, active, offers, disputes, balances] = await Promise.all([
      this.prisma.traderStats.findUnique({ where: { userId: user.id } }),
      this.prisma.trade.count({ where: { OR: [{ buyerId: user.id }, { sellerId: user.id }], status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] } } }),
      this.prisma.offer.count({ where: { ownerId: user.id, status: { in: ["ACTIVE", "PAUSED", "EXHAUSTED"] } } }),
      this.prisma.dispute.count({ where: { trade: { OR: [{ buyerId: user.id }, { sellerId: user.id }] }, status: { not: "RESOLVED" } } }),
      this.wallet.balances(user.id),
    ]);
    const cancelled = await this.prisma.trade.count({ where: { OR: [{ buyerId: user.id }, { sellerId: user.id }], status: { in: ["CANCELLED", "EXPIRED"] } } });
    return {
      activeTrades: active,
      activeOffers: offers,
      openDisputes: disputes,
      completedTrades: stats?.completedTrades ?? 0,
      cancelledTrades: cancelled,
      totalBoughtUsdt: formatUsdt(stats?.boughtUsdt ?? 0n),
      totalSoldUsdt: formatUsdt(stats?.soldUsdt ?? 0n),
      feesPaidUsdt: formatUsdt(stats?.feesPaidUsdt ?? 0n),
      balances,
    };
  }

  @Public()
  @Get("traders/:id")
  trader(@Param("id") id: string) {
    return this.users.trader(id);
  }

  @Get("favorites")
  favorites(@CurrentUser() user: AuthUser) {
    return this.users.favorites(user.id);
  }

  @Post("favorites/:traderId")
  @HttpCode(200)
  addFavorite(@CurrentUser() user: AuthUser, @Param("traderId") id: string) {
    return this.users.addFavorite(user.id, id);
  }

  @Delete("favorites/:traderId")
  removeFavorite(@CurrentUser() user: AuthUser, @Param("traderId") id: string) {
    return this.users.removeFavorite(user.id, id);
  }

  // ── bank accounts ──────────────────────────────────────────────────────────
  @Get("bank-accounts")
  banks(@CurrentUser() user: AuthUser) {
    return this.users.bankAccounts(user.id);
  }

  @Post("bank-accounts")
  @RateLimit({ limit: 10, windowSec: 3600, by: "user" })
  addBank(@CurrentUser() user: AuthUser, @ZBody(bankAccountSchema) body: z.infer<typeof bankAccountSchema>, @Ctx() ctx: RequestContext) {
    return this.users.addBankAccount(user.id, body, ctx);
  }

  @Delete("bank-accounts/:id")
  removeBank(@CurrentUser() user: AuthUser, @Param("id") id: string, @Ctx() ctx: RequestContext) {
    return this.users.removeBankAccount(user.id, id, ctx);
  }

  // ── kyc ────────────────────────────────────────────────────────────────────
  @Get("kyc/status")
  kycStatus(@CurrentUser() user: AuthUser) {
    return this.kyc.status(user.id);
  }

  @Post("kyc/start")
  @RateLimit({ limit: 5, windowSec: 3600, by: "user" })
  kycStart(@CurrentUser() user: AuthUser, @ZBody(kycStartSchema) body: KycStartInput, @Ctx() ctx: RequestContext) {
    return this.kyc.start(user.id, body, ctx);
  }

  @Post("kyc/sandbox/complete")
  @HttpCode(200)
  kycSandbox(@CurrentUser() user: AuthUser, @ZBody(kycSandboxCompleteSchema) body: z.infer<typeof kycSandboxCompleteSchema>) {
    return this.kyc.sandboxComplete(user.id, body.outcome);
  }

  /** Provider webhook. Signature verification is the adapter's job; unsigned calls are rejected. */
  @Public()
  @Post("kyc/webhooks/:provider")
  @HttpCode(200)
  kycWebhook(@Req() req: Request & { rawBody?: Buffer }) {
    return this.kyc.handleWebhook(req.headers, req.rawBody ?? Buffer.alloc(0));
  }

  // ── notifications ──────────────────────────────────────────────────────────
  @Get("notifications")
  async notificationsList(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { locale: true } });
    return this.notifications.list(user.id, u.locale, cursor);
  }

  @Post("notifications/read")
  @HttpCode(200)
  readNotifications(@CurrentUser() user: AuthUser, @ZBody(z.object({ ids: z.array(z.string().max(40)).max(100).optional() })) body: { ids?: string[] }) {
    return this.notifications.markRead(user.id, body.ids);
  }

  @Get("notifications/preferences")
  prefs(@CurrentUser() user: AuthUser) {
    return this.notifications.preferences(user.id);
  }

  @Put("notifications/preferences")
  setPrefs(@CurrentUser() user: AuthUser, @ZBody(notificationPrefsSchema) body: z.infer<typeof notificationPrefsSchema>) {
    return this.notifications.setPreferences(user.id, body);
  }

  @Post("notifications/push-tokens")
  @HttpCode(200)
  pushToken(@CurrentUser() user: AuthUser, @ZBody(pushTokenSchema) body: z.infer<typeof pushTokenSchema>) {
    return this.notifications.registerPushToken(user.id, body.token, body.platform);
  }

  // ── support ────────────────────────────────────────────────────────────────
  @Get("support/tickets")
  tickets(@CurrentUser() user: AuthUser) {
    return this.support.mine(user.id);
  }

  @Post("support/tickets")
  @RateLimit({ limit: 10, windowSec: 3600, by: "user" })
  createTicket(@CurrentUser() user: AuthUser, @ZBody(createTicketSchema) body: z.infer<typeof createTicketSchema>) {
    return this.support.create(user, body);
  }

  @Get("support/tickets/:id")
  ticket(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.support.get(user, id);
  }

  @Post("support/tickets/:id/messages")
  @RateLimit({ limit: 30, windowSec: 3600, by: "user" })
  reply(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(ticketMessageSchema) body: { body: string }) {
    return this.support.reply(user, id, body.body);
  }

  // ── wallet ─────────────────────────────────────────────────────────────────
  @Get("wallet/balances")
  balances(@CurrentUser() user: AuthUser) {
    return this.wallet.balances(user.id);
  }

  @Get("wallet/deposit-address")
  depositAddress(@CurrentUser() user: AuthUser, @Query("network") network: string) {
    return this.wallet.depositAddress(user.id, z.enum(NETWORK_CODES).parse(network));
  }

  @Idempotent()
  @Post("wallet/sandbox/deposit")
  @HttpCode(200)
  @RateLimit({ limit: 20, windowSec: 3600, by: "user" })
  sandboxDeposit(@CurrentUser() user: AuthUser, @ZBody(sandboxDepositSchema) body: z.infer<typeof sandboxDepositSchema>, @Ctx() ctx: RequestContext) {
    return this.wallet.sandboxDeposit(user, body.network, body.amountUsdt, ctx);
  }

  @VerifiedTrader()
  @Idempotent()
  @Post("wallet/withdrawals")
  @RateLimit({ limit: 10, windowSec: 3600, by: "user" })
  withdraw(@CurrentUser() user: AuthUser, @ZBody(withdrawalSchema) body: z.infer<typeof withdrawalSchema>, @Headers("idempotency-key") key: string, @Ctx() ctx: RequestContext) {
    return this.wallet.requestWithdrawal(user, body, key, ctx);
  }

  @Get("wallet/history")
  walletHistory(@CurrentUser() user: AuthUser) {
    return this.wallet.history(user.id);
  }

  @Get("wallet/ledger")
  ledger(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string) {
    return this.wallet.ledgerLines(user.id, cursor);
  }
}
