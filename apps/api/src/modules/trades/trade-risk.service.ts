import { Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors.js";
import type { Tx } from "../../common/prisma.service.js";
import type { Trade } from "../../generated/prisma/client.js";
import { SystemConfigService, type ParsedRiskRules } from "../config/system-config.service.js";

const LIVE_OR_DONE = { notIn: ["CANCELLED", "EXPIRED"] as ("CANCELLED" | "EXPIRED")[] };

export interface SettlementDecision {
  autoRelease: boolean;
  basis: "POLICY_AUTO" | "RECONCILIATION" | null;
  reasons: string[];
}

/**
 * Pre-trade limits, pre-escrow compliance routing, and the settlement policy that decides whether a
 * seller-confirmed trade may be released automatically or needs a compliance officer.
 */
@Injectable()
export class TradeRiskService {
  constructor(private readonly config: SystemConfigService) {}

  private async volume(tx: Tx, userId: string, since: Date): Promise<bigint> {
    const r = await tx.trade.aggregate({
      _sum: { fiatAgorot: true },
      where: { OR: [{ buyerId: userId }, { sellerId: userId }], status: LIVE_OR_DONE, createdAt: { gte: since } },
    });
    return r._sum.fiatAgorot ?? 0n;
  }

  /** Throws LIMIT_* for the acting user, or COUNTERPARTY_LIMIT without revealing the other side's details. */
  async checkLimits(tx: Tx, takerId: string, makerId: string, fiat: bigint, rules?: ParsedRiskRules): Promise<void> {
    const r = rules ?? (await this.config.parsedRiskRules(tx));
    for (const [userId, self] of [[takerId, true], [makerId, false]] as const) {
      const fail = (code: string, limit: bigint) => {
        throw self ? new AppError(code, 422, undefined, { limitAgorot: limit.toString() }) : new AppError("COUNTERPARTY_LIMIT", 422);
      };
      if (fiat > r.maxTradeAgorot) fail("LIMIT_MAX_TRADE", r.maxTradeAgorot);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } });
      const ageDays = (Date.now() - user.createdAt.getTime()) / 86_400_000;
      if (ageDays < r.newAccountDays && fiat > r.newAccountMaxTradeAgorot) fail("LIMIT_NEW_ACCOUNT", r.newAccountMaxTradeAgorot);
      const day = await this.volume(tx, userId, new Date(Date.now() - 86_400_000));
      if (day + fiat > r.dailyLimitAgorot) fail("LIMIT_DAILY", r.dailyLimitAgorot);
      const month = await this.volume(tx, userId, new Date(Date.now() - 30 * 86_400_000));
      if (month + fiat > r.monthlyLimitAgorot) fail("LIMIT_MONTHLY", r.monthlyLimitAgorot);
    }
  }

  /** Reasons a new trade must be reviewed by compliance before escrow (empty = auto-pass). */
  async preTradeReviewReasons(tx: Tx, t: Pick<Trade, "buyerId" | "sellerId" | "fiatAgorot">): Promise<string[]> {
    const r = await this.config.parsedRiskRules(tx);
    const reasons: string[] = [];
    if (t.fiatAgorot >= r.reviewThresholdAgorot) reasons.push("HIGH_VALUE");
    const kyc = await tx.kycProfile.findMany({ where: { userId: { in: [t.buyerId, t.sellerId] } }, select: { riskLevel: true } });
    if (kyc.some((k) => k.riskLevel === "HIGH")) reasons.push("HIGH_RISK_PARTY");
    const flags = await tx.riskFlag.count({
      where: { userId: { in: [t.buyerId, t.sellerId] }, resolvedAt: null, severity: { in: ["HIGH", "CRITICAL"] } },
    });
    if (flags) reasons.push("OPEN_RISK_FLAGS");
    return reasons;
  }

  /**
   * Settlement policy (after the seller confirmed funds received). The seller's confirmation is always
   * required; on top of that, release is automatic only if nothing suspicious is present.
   * A buyer's claim or uploaded evidence never satisfies this policy.
   */
  async settlementDecision(tx: Tx, t: Trade): Promise<SettlementDecision> {
    const r = await this.config.parsedRiskRules(tx);
    const reasons: string[] = [];
    if (!t.confirmedAt) reasons.push("SELLER_NOT_CONFIRMED");
    if (t.requiresReleaseReview) reasons.push("FLAGGED_FOR_REVIEW");
    if (t.fiatAgorot >= r.reviewThresholdAgorot) reasons.push("HIGH_VALUE");
    const flaggedChat = await tx.message.count({ where: { tradeId: t.id, flagged: true } });
    if (flaggedChat) reasons.push("CHAT_RISK_SIGNALS");
    const openFlags = await tx.riskFlag.count({
      where: { OR: [{ tradeId: t.id }, { userId: { in: [t.buyerId, t.sellerId] } }], resolvedAt: null, severity: { in: ["HIGH", "CRITICAL"] } },
    });
    if (openFlags) reasons.push("OPEN_RISK_FLAGS");

    const reconciled = await tx.payment.findFirst({ where: { tradeId: t.id, status: "RECONCILED" } });
    // A matching bank-statement line overrides the value threshold (but not fraud signals).
    const blocking = reasons.filter((x) => !(reconciled && x === "HIGH_VALUE"));
    if (blocking.length) return { autoRelease: false, basis: null, reasons: blocking };
    return { autoRelease: true, basis: reconciled ? "RECONCILIATION" : "POLICY_AUTO", reasons: [] };
  }
}
