import { Inject, Injectable, Logger } from "@nestjs/common";
import { formatUsdt } from "@wasitx/shared";
import { PrismaService } from "../../common/prisma.service.js";
import { SystemConfigService } from "../config/system-config.service.js";
import { CUSTODY_PROVIDER, type CustodyProvider } from "../integrations/providers.js";
import { PLATFORM_FEE_CUSTODY_REF } from "../integrations/sandbox/sandbox-custody.provider.js";
import { LedgerService } from "../ledger/ledger.service.js";
import { custodyRef } from "../trades/escrow.service.js";

export interface ReconciliationReport {
  ranAt: string;
  ok: boolean;
  ledgerLiabilitiesUsdt: string;
  omnibusUsdt: string;
  custodianAssetsUsdt: string;
  exceptions: { kind: string; ref: string; ledger: string; custodian: string }[];
}

/**
 * Compares the platform ledger (what we believe clients own) with the custodian's books (what is
 * actually held). Any difference is an exception that compliance/finance must investigate —
 * dashboards show these, never "estimated" balances.
 */
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger("Reconciliation");

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly config: SystemConfigService,
    @Inject(CUSTODY_PROVIDER) private readonly custody: CustodyProvider,
  ) {}

  async run(): Promise<ReconciliationReport> {
    const exceptions: ReconciliationReport["exceptions"] = [];
    const liabilities = await this.ledger.platformLiabilities();
    const omnibus = await this.ledger.omnibusBalance();
    const assets = await this.custody.totalAssets();

    if (liabilities + omnibus !== 0n) exceptions.push({ kind: "LEDGER_NOT_BALANCED", ref: "platform", ledger: formatUsdt(liabilities), custodian: formatUsdt(-omnibus) });
    if (liabilities !== assets) exceptions.push({ kind: "TOTAL_MISMATCH", ref: "platform", ledger: formatUsdt(liabilities), custodian: formatUsdt(assets) });

    // Per-client totals.
    const users = await this.prisma.ledgerAccount.groupBy({ by: ["userId"], where: { userId: { not: null } }, _sum: { balance: true } });
    for (const u of users) {
      const ledgerTotal = u._sum.balance ?? 0n;
      const { totalUsdt } = await this.custody.getBalance(custodyRef(u.userId!));
      if (ledgerTotal !== totalUsdt) exceptions.push({ kind: "CLIENT_MISMATCH", ref: u.userId!, ledger: formatUsdt(ledgerTotal), custodian: formatUsdt(totalUsdt) });
    }
    const feeLedger = (await this.prisma.ledgerAccount.findUnique({ where: { key: "platform:PLATFORM_FEE_REVENUE:USDT" } }))?.balance ?? 0n;
    const feeCustody = (await this.custody.getBalance(PLATFORM_FEE_CUSTODY_REF)).totalUsdt;
    if (feeLedger !== feeCustody) exceptions.push({ kind: "FEE_ACCOUNT_MISMATCH", ref: "fees", ledger: formatUsdt(feeLedger), custodian: formatUsdt(feeCustody) });

    // Every escrowed trade must have a confirmed, still-active custody hold of the same size.
    const held = await this.prisma.trade.findMany({
      where: { status: { in: ["AWAITING_FIAT_PAYMENT", "BUYER_MARKED_PAID", "SELLER_CONFIRMED_RECEIPT", "DISPUTED"] } },
      select: { id: true, sellerLocksUsdt: true, escrowOps: { where: { type: "HOLD" } } },
    });
    for (const t of held) {
      const hold = t.escrowOps[0];
      if (!hold || hold.status !== "CONFIRMED" || hold.amountUsdt !== t.sellerLocksUsdt) {
        exceptions.push({ kind: "ESCROW_HOLD_MISSING", ref: t.id, ledger: formatUsdt(t.sellerLocksUsdt), custodian: hold ? `${hold.status}:${formatUsdt(hold.amountUsdt)}` : "none" });
      }
    }

    const report: ReconciliationReport = {
      ranAt: new Date().toISOString(),
      ok: exceptions.length === 0,
      ledgerLiabilitiesUsdt: formatUsdt(liabilities),
      omnibusUsdt: formatUsdt(omnibus),
      custodianAssetsUsdt: formatUsdt(assets),
      exceptions,
    };
    await this.prisma.tx((tx) => this.config.set(tx, "recon.last", report));
    if (!report.ok) {
      this.logger.error(`Reconciliation found ${exceptions.length} exception(s)`);
      const open = await this.prisma.riskFlag.findFirst({ where: { type: "RECONCILIATION_EXCEPTION", resolvedAt: null } });
      if (!open) await this.prisma.riskFlag.create({ data: { type: "RECONCILIATION_EXCEPTION", severity: "CRITICAL", details: { count: exceptions.length, sample: exceptions.slice(0, 10) } } });
    }
    return report;
  }
}
