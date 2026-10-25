import { Injectable } from "@nestjs/common";
import {
  OFFER_EDITABLE_STATUSES,
  fiatForUsdt,
  formatIls,
  formatPrice,
  formatUsdt,
  minBig,
  offerTransition,
  parseIls,
  parsePrice,
  parseUsdt,
  type CreateOfferInput,
  type ListOffersQuery,
  type MarketStatsDto,
  type OfferAction,
  type OfferDto,
  type Paginated,
  type UpdateOfferInput,
} from "@wasitx/shared";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService, type Tx } from "../../common/prisma.service.js";
import type { Offer, Prisma } from "../../generated/prisma/client.js";
import { AuditService } from "../audit/audit.service.js";
import { SystemConfigService } from "../config/system-config.service.js";
import { LedgerService, userKey } from "../ledger/ledger.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { offerInclude, toOfferDto } from "../trades/mappers.js";

const MAX_OPEN_OFFERS = 10;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly config: SystemConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  private async lock(tx: Tx, id: string): Promise<Offer> {
    await tx.$executeRaw`SELECT 1 FROM "Offer" WHERE id = ${id} FOR NO KEY UPDATE`;
    const o = await tx.offer.findUnique({ where: { id } });
    if (!o) throw Errors.notFound("OFFER");
    return o;
  }

  private effectiveMax(maxOrder: bigint, remaining: bigint, price: bigint) {
    return minBig(maxOrder, fiatForUsdt(remaining, price));
  }

  private async validateTerms(tx: Tx, userId: string, side: "BUY" | "SELL", p: { amount: bigint; price: bigint; min: bigint; max: bigint; paymentMethod: string; bankAccountId?: string | null }) {
    const rules = await this.config.parsedRiskRules(tx);
    if (!(await this.config.isPaymentMethodEnabled(p.paymentMethod, tx))) throw new AppError("PAYMENT_METHOD_DISABLED", 422);
    if (p.max > rules.maxTradeAgorot) throw new AppError("MAX_ORDER_ABOVE_LIMIT", 422, undefined, { limitIls: formatIls(rules.maxTradeAgorot) });
    if (p.min > p.max) throw new AppError("MIN_EXCEEDS_MAX", 422);
    if (fiatForUsdt(p.amount, p.price) < p.min) throw new AppError("AMOUNT_BELOW_MIN_ORDER", 422);
    // Sanity band against fat-finger prices (₪1.00 – ₪10.00 per USDT).
    if (p.price < 10_000n || p.price > 100_000n) throw new AppError("PRICE_OUT_OF_RANGE", 422);
    if (side === "SELL") {
      const bank = p.bankAccountId
        ? await tx.bankAccount.findFirst({ where: { id: p.bankAccountId, userId, deletedAt: null, status: "VERIFIED" } })
        : null;
      if (!bank) throw new AppError("BANK_ACCOUNT_NOT_VERIFIED", 422);
    }
  }

  async create(user: AuthUser, input: CreateOfferInput, ctx: RequestContext): Promise<OfferDto> {
    const amount = parseUsdt(input.amountUsdt);
    const price = parsePrice(input.priceIls);
    const min = parseIls(input.minOrderIls);
    const max = parseIls(input.maxOrderIls);

    const id = await this.prisma.tx(async (tx) => {
      const open = await tx.offer.count({ where: { ownerId: user.id, status: { in: ["ACTIVE", "PAUSED", "EXHAUSTED"] } } });
      if (open >= MAX_OPEN_OFFERS) throw new AppError("TOO_MANY_OPEN_OFFERS", 422);
      await this.validateTerms(tx, user.id, input.side, { amount, price, min, max, paymentMethod: input.paymentMethod, bankAccountId: input.bankAccountId });

      const offer = await tx.offer.create({
        data: {
          ownerId: user.id,
          side: input.side,
          amountUsdt: amount,
          remainingUsdt: amount,
          priceE4: price,
          minOrderAgorot: min,
          maxOrderAgorot: max,
          effectiveMaxAgorot: this.effectiveMax(max, amount, price),
          paymentMethod: input.paymentMethod,
          bankAccountId: input.side === "SELL" ? input.bankAccountId! : null,
          terms: input.terms ?? null,
          expiresAt: new Date(Date.now() + input.expiresInHours * 3600_000),
        },
      });
      if (input.side === "SELL") {
        // Reserve the USDT so the same balance can't back several offers (DB CHECK rejects overdraft).
        await this.ledger.move(tx, {
          type: "OFFER_RESERVE",
          referenceType: "Offer",
          referenceId: offer.id,
          idempotencyKey: `offer:${offer.id}:reserve:0`,
          description: "USDT reserved for sell offer",
          from: userKey(user.id, "USER_AVAILABLE"),
          to: userKey(user.id, "USER_OFFER_RESERVED"),
          amount,
          createdById: user.id,
        });
      }
      await this.audit.record(tx, { actorType: "USER", actorId: user.id, action: "offer.create", entityType: "Offer", entityId: offer.id, data: { side: input.side, amount: input.amountUsdt, price: input.priceIls }, ctx });
      await this.outbox.enqueue(tx, "ws.offer", { offerId: offer.id });
      return offer.id;
    });
    this.outbox.kick();
    return this.get(id, user.id);
  }

  async update(user: AuthUser, id: string, input: UpdateOfferInput, ctx: RequestContext): Promise<OfferDto> {
    await this.prisma.tx(async (tx) => {
      const o = await this.lock(tx, id);
      if (o.ownerId !== user.id) throw Errors.notFound("OFFER");
      if (o.version !== input.version) throw new AppError("OFFER_VERSION_CONFLICT", 409, undefined, { version: o.version });
      if (!OFFER_EDITABLE_STATUSES.includes(o.status)) throw new AppError("OFFER_NOT_EDITABLE", 409);

      const amount = input.amountUsdt ? parseUsdt(input.amountUsdt) : o.amountUsdt;
      const delta = amount - o.amountUsdt;
      const remaining = o.remainingUsdt + delta;
      if (remaining < 0n) throw new AppError("AMOUNT_BELOW_IN_FLIGHT", 422, "Amount is lower than what active trades already use");
      const price = input.priceIls ? parsePrice(input.priceIls) : o.priceE4;
      const min = input.minOrderIls ? parseIls(input.minOrderIls) : o.minOrderAgorot;
      const max = input.maxOrderIls ? parseIls(input.maxOrderIls) : o.maxOrderAgorot;
      const bankAccountId = input.bankAccountId ?? o.bankAccountId;
      await this.validateTerms(tx, user.id, o.side, { amount, price, min, max, paymentMethod: o.paymentMethod, bankAccountId });

      if (o.side === "SELL" && delta !== 0n) {
        await this.ledger.move(tx, {
          type: delta > 0n ? "OFFER_RESERVE" : "OFFER_UNRESERVE",
          referenceType: "Offer",
          referenceId: o.id,
          idempotencyKey: `offer:${o.id}:reserve:${o.version + 1}`,
          description: delta > 0n ? "Sell offer increased" : "Sell offer reduced",
          from: userKey(user.id, delta > 0n ? "USER_AVAILABLE" : "USER_OFFER_RESERVED"),
          to: userKey(user.id, delta > 0n ? "USER_OFFER_RESERVED" : "USER_AVAILABLE"),
          amount: delta > 0n ? delta : -delta,
          createdById: user.id,
        });
      }
      const effectiveMax = this.effectiveMax(max, remaining, price);
      let status = o.status;
      if (status === "ACTIVE" && effectiveMax < min) status = "EXHAUSTED";
      if (status === "EXHAUSTED" && effectiveMax >= min) status = "ACTIVE";
      await tx.offer.update({
        where: { id },
        data: {
          amountUsdt: amount,
          remainingUsdt: remaining,
          priceE4: price,
          minOrderAgorot: min,
          maxOrderAgorot: max,
          effectiveMaxAgorot: effectiveMax,
          bankAccountId,
          status,
          terms: input.terms ?? o.terms,
          expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3600_000) : o.expiresAt,
          version: { increment: 1 },
        },
      });
      await this.audit.record(tx, { actorType: "USER", actorId: user.id, action: "offer.update", entityType: "Offer", entityId: id, data: { ...input }, ctx });
      await this.outbox.enqueue(tx, "ws.offer", { offerId: id });
    });
    this.outbox.kick();
    return this.get(id, user.id);
  }

  async act(user: AuthUser | null, id: string, action: OfferAction, actor: "owner" | "staff" | "system", ctx?: RequestContext, note?: string): Promise<OfferDto> {
    await this.prisma.tx(async (tx) => {
      const o = await this.lock(tx, id);
      if (actor === "owner" && o.ownerId !== user?.id) throw Errors.notFound("OFFER");
      const to = offerTransition(o.status, action, actor);
      if (!to) throw new AppError("INVALID_OFFER_TRANSITION", 409, undefined, { status: o.status, action });
      if (action === "resume" && o.expiresAt <= new Date()) throw new AppError("OFFER_EXPIRED", 409);

      const closing = to === "CANCELLED" || to === "EXPIRED";
      if (closing && o.side === "SELL" && o.remainingUsdt > 0n) {
        await this.ledger.move(tx, {
          type: "OFFER_UNRESERVE",
          referenceType: "Offer",
          referenceId: o.id,
          idempotencyKey: `offer:${o.id}:close`,
          description: `Sell offer ${to.toLowerCase()} — reservation released`,
          from: userKey(o.ownerId, "USER_OFFER_RESERVED"),
          to: userKey(o.ownerId, "USER_AVAILABLE"),
          amount: o.remainingUsdt,
        });
      }
      await tx.offer.update({
        where: { id },
        data: {
          status: to,
          version: { increment: 1 },
          ...(closing ? { remainingUsdt: 0n, effectiveMaxAgorot: 0n, cancelledAt: new Date() } : {}),
        },
      });
      await this.audit.record(tx, {
        actorType: actor === "owner" ? "USER" : actor === "staff" ? "STAFF" : "SYSTEM",
        actorId: user?.id ?? null,
        action: `offer.${action}`,
        entityType: "Offer",
        entityId: id,
        data: { from: o.status, to, note: note ?? null },
        ctx,
      });
      await this.outbox.enqueue(tx, "ws.offer", { offerId: id });
    });
    this.outbox.kick();
    return this.get(id, user?.id);
  }

  async get(id: string, viewerId?: string): Promise<OfferDto> {
    const o = await this.prisma.offer.findUnique({ where: { id }, include: offerInclude });
    if (!o) throw Errors.notFound("OFFER");
    return toOfferDto(o, viewerId);
  }

  async list(q: ListOffersQuery, viewerId?: string): Promise<Paginated<OfferDto>> {
    const where: Prisma.OfferWhereInput = {
      side: q.side,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
      owner: { status: "ACTIVE" },
      ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
      ...(q.verifiedOnly ? { owner: { status: "ACTIVE", kyc: { status: "APPROVED" } } } : {}),
    };
    if (q.amountIls) {
      const a = parseIls(q.amountIls);
      where.minOrderAgorot = { lte: a };
      where.effectiveMaxAgorot = { gte: a };
    }
    if (q.favoritesOnly && viewerId) where.owner = { ...(where.owner as object), favoritedBy: { some: { userId: viewerId } } };

    // Best price first: buyers (SELL offers) want the lowest, sellers (BUY offers) the highest.
    const priceDir: Prisma.SortOrder = q.side === "SELL" ? "asc" : "desc";
    const orderBy: Prisma.OfferOrderByWithRelationInput[] =
      q.sort === "price"
        ? [{ priceE4: priceDir }, { id: "asc" }]
        : q.sort === "amount"
          ? [{ remainingUsdt: "desc" }, { id: "asc" }]
          : q.sort === "completion"
            ? [{ owner: { stats: { completedTrades: "desc" } } }, { priceE4: priceDir }, { id: "asc" }]
            : [{ createdAt: "desc" }, { id: "asc" }];

    const rows = await this.prisma.offer.findMany({
      where,
      include: offerInclude,
      orderBy,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    return { items: page.map((o) => toOfferDto(o, viewerId)), nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null };
  }

  async mine(userId: string): Promise<OfferDto[]> {
    const rows = await this.prisma.offer.findMany({ where: { ownerId: userId }, include: offerInclude, orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((o) => toOfferDto(o, userId));
  }

  async stats(): Promise<MarketStatsDto> {
    const now = new Date();
    const since = new Date(now.getTime() - 86_400_000);
    const active = { status: "ACTIVE" as const, expiresAt: { gt: now } };
    const [bestSell, bestBuy, activeOffers, vol, durations] = await Promise.all([
      this.prisma.offer.findFirst({ where: { ...active, side: "SELL" }, orderBy: { priceE4: "asc" }, select: { priceE4: true } }),
      this.prisma.offer.findFirst({ where: { ...active, side: "BUY" }, orderBy: { priceE4: "desc" }, select: { priceE4: true } }),
      this.prisma.offer.count({ where: active }),
      this.prisma.trade.aggregate({ _sum: { amountUsdt: true }, _count: true, where: { status: "COMPLETED", completedAt: { gte: since } } }),
      this.prisma.trade.findMany({ where: { status: "COMPLETED", completedAt: { gte: since } }, select: { createdAt: true, completedAt: true }, take: 2000 }),
    ]);
    const mins = durations.map((d) => (d.completedAt!.getTime() - d.createdAt.getTime()) / 60_000).sort((a, b) => a - b);
    return {
      bestSellPriceIls: bestSell ? formatPrice(bestSell.priceE4) : null,
      bestBuyPriceIls: bestBuy ? formatPrice(bestBuy.priceE4) : null,
      activeOffers,
      volume24hUsdt: formatUsdt(vol._sum.amountUsdt ?? 0n),
      trades24h: vol._count,
      medianCompletionMinutes: mins.length ? Math.round(mins[Math.floor(mins.length / 2)]!) : null,
    };
  }

  /** Background: expire offers past their expiry. */
  async expireDue(): Promise<number> {
    const due = await this.prisma.offer.findMany({ where: { status: { in: ["ACTIVE", "PAUSED", "EXHAUSTED"] }, expiresAt: { lte: new Date() } }, select: { id: true }, take: 200 });
    for (const { id } of due) await this.act(null, id, "expire", "system").catch(() => undefined);
    return due.length;
  }
}
