import {
  availableTradeActions,
  findBank,
  formatIls,
  formatPrice,
  formatUsdt,
  type OfferDto,
  type TradeActor,
  type TradeDto,
  type TraderSummary,
} from "@wasitx/shared";
import type { Prisma } from "../../generated/prisma/client.js";

export const traderInclude = {
  stats: true,
  kyc: { select: { status: true } },
} satisfies Prisma.UserInclude;

export type TraderRow = Prisma.UserGetPayload<{ include: typeof traderInclude }>;

const pct = (num: number, den: number) => (den > 0 ? ((num / den) * 100).toFixed(1) : null);

export function toTraderSummary(u: TraderRow): TraderSummary {
  const s = u.stats;
  return {
    id: u.id,
    displayName: u.displayName,
    verified: u.kyc?.status === "APPROVED",
    completedTrades: s?.completedTrades ?? 0,
    completionRate: s ? pct(s.completedTrades, s.finishedTrades) : null,
    positiveRate: s ? pct(s.positiveRatings, s.totalRatings) : null,
    avgReleaseMinutes: s && s.releaseCount > 0 ? Math.round(Number(s.releaseSecondsTotal) / s.releaseCount / 60) : null,
    memberSince: u.createdAt.toISOString(),
  };
}

export const offerInclude = { owner: { include: traderInclude } } satisfies Prisma.OfferInclude;
export type OfferRow = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

export function toOfferDto(o: OfferRow, viewerId?: string): OfferDto {
  return {
    id: o.id,
    side: o.side,
    status: o.status,
    owner: toTraderSummary(o.owner),
    amountUsdt: formatUsdt(o.amountUsdt),
    remainingUsdt: formatUsdt(o.remainingUsdt),
    priceIls: formatPrice(o.priceE4),
    minOrderIls: formatIls(o.minOrderAgorot),
    maxOrderIls: formatIls(o.effectiveMaxAgorot),
    paymentMethod: o.paymentMethod,
    expiresAt: o.expiresAt.toISOString(),
    terms: o.terms,
    version: o.version,
    isMine: viewerId === o.ownerId,
    createdAt: o.createdAt.toISOString(),
  };
}

export const tradeInclude = {
  buyer: { include: traderInclude },
  seller: { include: traderInclude },
  dispute: { select: { id: true } },
  ratings: { select: { raterId: true, positive: true } },
} satisfies Prisma.TradeInclude;
export type TradeRow = Prisma.TradeGetPayload<{ include: typeof tradeInclude }>;

export interface TradeViewContext {
  viewerId: string;
  isStaff: boolean;
  disputeAfterMinutes: number;
  unread: number;
  /** decrypted seller bank account, only passed when the viewer is entitled to see it */
  bank?: { bankCode: string; branchNumber: string; accountNumber: string; holderName: string } | null;
  events?: TradeDto["events"];
}

export function toTradeDto(t: TradeRow, v: TradeViewContext): TradeDto {
  const myRole: TradeDto["myRole"] = v.viewerId === t.buyerId ? "buyer" : v.viewerId === t.sellerId ? "seller" : "staff";
  const actor: TradeActor = myRole === "staff" ? "compliance" : myRole;
  const minsSincePaid = t.markedPaidAt ? (Date.now() - t.markedPaidAt.getTime()) / 60_000 : 0;
  const canOpenDispute =
    t.status === "BUYER_MARKED_PAID" && (myRole === "seller" || (myRole === "buyer" && minsSincePaid >= v.disputeAfterMinutes));
  const showInstructions = !!v.bank && ["AWAITING_FIAT_PAYMENT", "BUYER_MARKED_PAID", "DISPUTED"].includes(t.status);

  return {
    id: t.id,
    reference: t.reference,
    status: t.status,
    myRole,
    offerId: t.offerId,
    offerSide: t.offerSide,
    buyer: toTraderSummary(t.buyer),
    seller: toTraderSummary(t.seller),
    amountUsdt: formatUsdt(t.amountUsdt),
    priceIls: formatPrice(t.priceE4),
    fiatAmountIls: formatIls(t.fiatAgorot),
    fee: {
      rateBps: t.feeRateBps,
      payer: t.feePayer,
      feeUsdt: formatUsdt(t.feeUsdt),
      buyerFeeUsdt: formatUsdt(t.buyerFeeUsdt),
      sellerFeeUsdt: formatUsdt(t.sellerFeeUsdt),
    },
    buyerReceivesUsdt: formatUsdt(t.buyerReceivesUsdt),
    sellerLocksUsdt: formatUsdt(t.sellerLocksUsdt),
    paymentMethod: t.paymentMethod,
    paymentDeadline: t.paymentDeadline?.toISOString() ?? null,
    paymentInstructions:
      showInstructions && v.bank
        ? {
            bankCode: v.bank.bankCode,
            bankName: findBank(v.bank.bankCode)?.name.en ?? v.bank.bankCode,
            branchNumber: v.bank.branchNumber,
            accountNumber: v.bank.accountNumber,
            holderName: v.bank.holderName,
            reference: t.paymentReference,
            amountIls: formatIls(t.fiatAgorot),
            deadline: t.paymentDeadline?.toISOString() ?? "",
          }
        : null,
    markedPaidAt: t.markedPaidAt?.toISOString() ?? null,
    confirmedAt: t.confirmedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    frozenFrom: t.frozenFrom,
    disputeId: t.dispute?.id ?? null,
    availableActions: myRole === "staff" && !v.isStaff ? [] : availableTradeActions(t.status, actor),
    canOpenDispute,
    myRating: t.ratings.find((r) => r.raterId === v.viewerId)?.positive ?? null,
    unreadMessages: v.unread,
    sandbox: t.sandbox,
    createdAt: t.createdAt.toISOString(),
    events: v.events,
  };
}
