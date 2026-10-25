import { Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  createOfferSchema,
  formatUsdt,
  listOffersSchema,
  updateOfferSchema,
  usdtAmount,
  type CreateOfferInput,
  type ListOffersQuery,
  type PublicConfigDto,
  type UpdateOfferInput,
} from "@wasitx/shared";
import { z } from "zod";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { Ctx, CurrentUser, OptionalUser, Public, RateLimit, VerifiedTrader } from "../../common/auth/decorators.js";
import { PrismaService } from "../../common/prisma.service.js";
import { ZBody, ZQuery } from "../../common/zod.js";
import { env } from "../../config/env.js";
import { SystemConfigService } from "../config/system-config.service.js";
import { OffersService } from "../offers/offers.service.js";
import { TradesService } from "../trades/trades.service.js";

@ApiTags("market")
@Controller()
export class MarketController {
  constructor(
    private readonly offers: OffersService,
    private readonly trades: TradesService,
    private readonly config: SystemConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get("config/public")
  async publicConfig(): Promise<PublicConfigDto> {
    const [fee, rules, methods, networks, announcements] = await Promise.all([
      this.config.publicFee(),
      this.config.riskRules(),
      this.prisma.paymentMethodConfig.findMany({ orderBy: { displayOrder: "asc" } }),
      this.prisma.networkConfig.findMany(),
      this.prisma.announcement.findMany({ where: { publishedAt: { not: null }, archivedAt: null }, orderBy: { publishedAt: "desc" }, take: 3 }),
    ]);
    return {
      brandName: env.BRAND_NAME,
      tradingMode: env.TRADING_MODE,
      fee,
      paymentMethods: methods.map((m) => ({ code: m.code, enabled: m.enabled })),
      networks: networks.map((n) => ({ code: n.code, enabled: n.enabled, label: n.label, tokenContract: n.tokenContract, minConfirmations: n.minConfirmations })),
      limits: { maxTradeIls: rules.maxTradeIls, dailyLimitIls: rules.dailyLimitIls, monthlyLimitIls: rules.monthlyLimitIls, paymentWindowMinutes: rules.paymentWindowMinutes },
      announcements: announcements.map((a) => ({ id: a.id, severity: a.severity, title: a.title as Record<"ar" | "he" | "en", string>, body: a.body as Record<"ar" | "he" | "en", string> })),
    };
  }

  @Public()
  @Get("market/stats")
  stats() {
    return this.offers.stats();
  }

  @Public()
  @Get("market/quote")
  quote(@Query("offerId") offerId: string, @Query("amountUsdt") amountUsdt: string) {
    return this.trades.quote(z.string().max(40).parse(offerId), usdtAmount.parse(amountUsdt));
  }

  @Public()
  @Get("offers")
  list(@ZQuery(listOffersSchema) q: ListOffersQuery, @OptionalUser() user?: AuthUser) {
    return this.offers.list(q, user?.id);
  }

  @Get("offers/mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.offers.mine(user.id);
  }

  @Public()
  @Get("offers/:id")
  get(@Param("id") id: string, @OptionalUser() user?: AuthUser) {
    return this.offers.get(id, user?.id);
  }

  @VerifiedTrader()
  @Post("offers")
  @RateLimit({ limit: 20, windowSec: 3600, by: "user" })
  create(@CurrentUser() user: AuthUser, @ZBody(createOfferSchema) body: CreateOfferInput, @Ctx() ctx: RequestContext) {
    return this.offers.create(user, body, ctx);
  }

  @VerifiedTrader()
  @Patch("offers/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(updateOfferSchema) body: UpdateOfferInput, @Ctx() ctx: RequestContext) {
    return this.offers.update(user, id, body, ctx);
  }

  @Post("offers/:id/pause")
  @HttpCode(200)
  pause(@CurrentUser() user: AuthUser, @Param("id") id: string, @Ctx() ctx: RequestContext) {
    return this.offers.act(user, id, "pause", "owner", ctx);
  }

  @VerifiedTrader()
  @Post("offers/:id/resume")
  @HttpCode(200)
  resume(@CurrentUser() user: AuthUser, @Param("id") id: string, @Ctx() ctx: RequestContext) {
    return this.offers.act(user, id, "resume", "owner", ctx);
  }

  @Post("offers/:id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string, @Ctx() ctx: RequestContext) {
    return this.offers.act(user, id, "cancel", "owner", ctx);
  }

  /** Public, privacy-preserving market depth for charts (aggregated price levels only). */
  @Public()
  @Get("market/depth")
  async depth(@Query("side") side?: string) {
    const s = side === "BUY" ? "BUY" : "SELL";
    const rows = await this.prisma.offer.groupBy({
      by: ["priceE4"],
      where: { side: s, status: "ACTIVE", expiresAt: { gt: new Date() } },
      _sum: { remainingUsdt: true },
      _count: true,
      orderBy: { priceE4: s === "SELL" ? "asc" : "desc" },
      take: 20,
    });
    return rows.map((r) => ({ priceIls: (Number(r.priceE4) / 10_000).toFixed(4), amountUsdt: formatUsdt(r._sum.remainingUsdt ?? 0n), offers: r._count }));
  }
}
