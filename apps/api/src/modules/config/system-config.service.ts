import { Injectable } from "@nestjs/common";
import {
  DEMO_FEE_CONFIG,
  PRODUCTION_GATES,
  formatUsdt,
  parseIls,
  parseUsdt,
  type FeeConfig,
  type ProductionGate,
  type RiskRules,
} from "@wasitx/shared";
import { PrismaService, type Tx } from "../../common/prisma.service.js";

/** Illustrative launch defaults — business/compliance must confirm (REGULATORY-CHECKLIST §2.9). */
export const DEFAULT_RISK_RULES: RiskRules = {
  maxTradeIls: "20000",
  dailyLimitIls: "50000",
  monthlyLimitIls: "200000",
  reviewThresholdIls: "15000",
  dualApprovalThresholdUsdt: "2000",
  paymentWindowMinutes: 30,
  newAccountDays: 7,
  newAccountMaxTradeIls: "5000",
};

export interface TradingSettings {
  /** minutes after "marked paid" before the buyer may open a dispute (seller may open at once) */
  disputeAfterMinutes: number;
  /** withdrawals at or below this amount skip manual approval when screening is CLEAR */
  autoWithdrawalLimitUsdt: string;
  /** grace after the payment deadline during which "mark paid" is still accepted */
  markPaidGraceMinutes: number;
}

export const DEFAULT_TRADING_SETTINGS: TradingSettings = {
  disputeAfterMinutes: 15,
  autoWithdrawalLimitUsdt: "1000",
  markPaidGraceMinutes: 2,
};

export interface ParsedRiskRules {
  maxTradeAgorot: bigint;
  dailyLimitAgorot: bigint;
  monthlyLimitAgorot: bigint;
  reviewThresholdAgorot: bigint;
  dualApprovalThresholdUsdt: bigint;
  paymentWindowMinutes: number;
  newAccountDays: number;
  newAccountMaxTradeAgorot: bigint;
}

@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T>(key: string, fallback: T, db: Tx | PrismaService = this.prisma): Promise<T> {
    const row = await db.systemConfig.findUnique({ where: { key } });
    return row ? (row.value as T) : fallback;
  }

  async set(tx: Tx, key: string, value: unknown, updatedById?: string): Promise<void> {
    await tx.systemConfig.upsert({
      where: { key },
      create: { key, value: value as object, updatedById },
      update: { value: value as object, updatedById },
    });
  }

  async riskRules(db?: Tx): Promise<RiskRules> {
    return { ...DEFAULT_RISK_RULES, ...(await this.get<Partial<RiskRules>>("risk.rules", {}, db)) };
  }

  async parsedRiskRules(db?: Tx): Promise<ParsedRiskRules> {
    const r = await this.riskRules(db);
    return {
      maxTradeAgorot: parseIls(r.maxTradeIls),
      dailyLimitAgorot: parseIls(r.dailyLimitIls),
      monthlyLimitAgorot: parseIls(r.monthlyLimitIls),
      reviewThresholdAgorot: parseIls(r.reviewThresholdIls),
      dualApprovalThresholdUsdt: parseUsdt(r.dualApprovalThresholdUsdt),
      paymentWindowMinutes: r.paymentWindowMinutes,
      newAccountDays: r.newAccountDays,
      newAccountMaxTradeAgorot: parseIls(r.newAccountMaxTradeIls),
    };
  }

  async tradingSettings(db?: Tx): Promise<TradingSettings> {
    return { ...DEFAULT_TRADING_SETTINGS, ...(await this.get<Partial<TradingSettings>>("trading.settings", {}, db)) };
  }

  /** The commission in force now: latest row with effectiveFrom ≤ now, else the demo default. */
  async currentCommission(db: Tx | PrismaService = this.prisma): Promise<{ id: string | null; cfg: FeeConfig }> {
    const row = await db.commissionConfig.findFirst({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!row) return { id: null, cfg: DEMO_FEE_CONFIG };
    return { id: row.id, cfg: { rateBps: row.rateBps, minUsdtMicro: row.minUsdt, maxUsdtMicro: row.maxUsdt, payer: row.payer } };
  }

  async gates(): Promise<Record<ProductionGate, { value: boolean; evidence?: string; by?: string; at?: string }>> {
    const rows = await this.prisma.systemConfig.findMany({ where: { key: { in: [...PRODUCTION_GATES] } } });
    const out = {} as Record<ProductionGate, { value: boolean; evidence?: string; by?: string; at?: string }>;
    for (const g of PRODUCTION_GATES) {
      const r = rows.find((x) => x.key === g);
      out[g] = r ? (r.value as { value: boolean; evidence?: string }) : { value: false };
    }
    return out;
  }

  async allGatesSatisfied(): Promise<boolean> {
    const g = await this.gates();
    return Object.values(g).every((x) => x.value === true);
  }

  async isPaymentMethodEnabled(code: string, db: Tx | PrismaService = this.prisma): Promise<boolean> {
    const m = await db.paymentMethodConfig.findUnique({ where: { code: code as never } });
    return !!m?.enabled;
  }

  async publicFee() {
    const { cfg } = await this.currentCommission();
    return { rateBps: cfg.rateBps, minUsdt: formatUsdt(cfg.minUsdtMicro), maxUsdt: formatUsdt(cfg.maxUsdtMicro), payer: cfg.payer };
  }
}
