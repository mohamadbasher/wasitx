import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "node:crypto";
import {
  detectAddressNetwork,
  formatUsdt,
  isValidAddressForNetwork,
  parseUsdt,
  toChecksumAddress,
  type BalanceDto,
  type NetworkCode,
} from "@wasitx/shared";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { AppError, Errors } from "../../common/errors.js";
import { PrismaService } from "../../common/prisma.service.js";
import { isSandbox } from "../../config/env.js";
import { ApprovalsService } from "../approvals/approvals.service.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthService } from "../auth/auth.service.js";
import { SystemConfigService } from "../config/system-config.service.js";
import { CUSTODY_PROVIDER, WALLET_SCREENING_PROVIDER, type CustodyProvider, type WalletScreeningProvider } from "../integrations/providers.js";
import { LedgerService, platformKey, userKey } from "../ledger/ledger.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { custodyRef } from "../trades/escrow.service.js";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58check(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const bytes = new Uint8Array([...payload, ...checksum]);
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let s = "";
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s;
}

/** Sandbox deposit addresses: syntactically valid, randomly generated, owned by nobody. Never send real funds. */
function sandboxAddress(network: NetworkCode): string {
  if (network === "TRON_TRC20") return base58check(new Uint8Array([0x41, ...randomBytes(20)]));
  return toChecksumAddress(`0x${randomBytes(20).toString("hex")}`);
}

@Injectable()
export class WalletService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly config: SystemConfigService,
    private readonly approvals: ApprovalsService,
    private readonly auth: AuthService,
    @Inject(CUSTODY_PROVIDER) private readonly custody: CustodyProvider,
    @Inject(WALLET_SCREENING_PROVIDER) private readonly screening: WalletScreeningProvider,
  ) {}

  onModuleInit() {
    this.approvals.register("WITHDRAWAL", async (p, c) => this.executeWithdrawal(p.withdrawalId as string, c.approvedById));
  }

  /**
   * Balances come from the platform ledger and are shown next to the custodian's figure for the same
   * account. `reconciled` is only true when the two agree; the UI labels the source explicitly.
   */
  async balances(userId: string): Promise<BalanceDto> {
    const b = await this.ledger.userBalances(userId);
    const c = await this.custody.getBalance(custodyRef(userId));
    return {
      source: this.custody.sandbox ? "SANDBOX_CUSTODY" : "CUSTODIAN",
      sourceLabel: this.custody.sandbox ? "Sandbox custodian (simulated — no real assets)" : this.custody.name,
      available: formatUsdt(b.available),
      reservedInOffers: formatUsdt(b.reserved),
      inEscrow: formatUsdt(b.escrow),
      pendingWithdrawal: formatUsdt(b.pendingWithdrawal),
      custodianBalance: formatUsdt(c.totalUsdt),
      reconciled: b.total === c.totalUsdt,
      asOf: new Date().toISOString(),
    };
  }

  private async network(code: NetworkCode) {
    const n = await this.prisma.networkConfig.findUnique({ where: { code } });
    if (!n?.enabled) throw new AppError("NETWORK_DISABLED", 422);
    return n;
  }

  async depositAddress(userId: string, network: NetworkCode) {
    const n = await this.network(network);
    const existing = await this.prisma.depositAddress.findUnique({ where: { userId_network: { userId, network } } });
    const addr =
      existing ??
      (await this.prisma.depositAddress.create({ data: { userId, network, address: sandboxAddress(network), provider: this.custody.name } }));
    return { network, address: addr.address, label: n.label, tokenContract: n.tokenContract, minConfirmations: n.minConfirmations, sandbox: this.custody.sandbox };
  }

  /** ⚠ Sandbox only: credits simulated USDT so demo users can create SELL offers. */
  async sandboxDeposit(user: AuthUser, network: NetworkCode, amountUsdt: string, ctx: RequestContext) {
    if (!isSandbox() || !this.custody.simulateDeposit) throw new AppError("NOT_AVAILABLE", 404);
    const amount = parseUsdt(amountUsdt);
    if (amount > parseUsdt("100000")) throw new AppError("SANDBOX_DEPOSIT_TOO_LARGE", 422);
    await this.network(network);
    const { address } = await this.depositAddress(user.id, network);
    await this.custody.ensureAccount(custodyRef(user.id));
    const key = `deposit:${user.id}:${randomBytes(8).toString("hex")}`;
    const { txHash } = await this.custody.simulateDeposit({ accountRef: custodyRef(user.id), network, amountUsdt: amount, idempotencyKey: key });
    await this.prisma.tx(async (tx) => {
      const d = await tx.deposit.create({
        data: { userId: user.id, network, address, amountUsdt: amount, txHash, confirmations: 999, status: "CREDITED", simulated: true, creditedAt: new Date() },
      });
      await this.ledger.move(tx, {
        type: "DEPOSIT",
        referenceType: "Deposit",
        referenceId: d.id,
        idempotencyKey: `deposit:${d.id}`,
        description: `Simulated ${network} deposit`,
        from: platformKey("PLATFORM_CUSTODY_OMNIBUS"),
        to: userKey(user.id, "USER_AVAILABLE"),
        amount,
      });
      await this.audit.record(tx, { actorType: "USER", actorId: user.id, action: "wallet.sandbox_deposit", entityType: "Deposit", entityId: d.id, data: { amount: amountUsdt, network }, ctx });
    });
    return this.balances(user.id);
  }

  async requestWithdrawal(user: AuthUser, input: { network: NetworkCode; address: string; amountUsdt: string; mfaCode: string }, idemKey: string, ctx: RequestContext) {
    await this.auth.assertTotp(user.id, input.mfaCode);
    const n = await this.network(input.network);
    if (!isValidAddressForNetwork(input.network, input.address)) {
      const other = detectAddressNetwork(input.address);
      throw new AppError(other ? "WRONG_NETWORK_ADDRESS" : "INVALID_ADDRESS", 422, undefined, { detected: other });
    }
    const amount = parseUsdt(input.amountUsdt);
    if (amount < n.minWithdrawalUsdt) throw new AppError("BELOW_MIN_WITHDRAWAL", 422, undefined, { min: formatUsdt(n.minWithdrawalUsdt) });
    const total = amount + n.withdrawalFeeUsdt;

    const scr = await this.screening.screenAddress(input.network, input.address);
    const screening = await this.prisma.walletScreening.create({
      data: { network: input.network, address: input.address, provider: this.screening.name, result: scr.result, riskScore: scr.riskScore, riskCategory: scr.category, raw: scr.raw as object },
    });
    if (scr.result === "BLOCK") {
      await this.prisma.riskFlag.create({ data: { userId: user.id, type: "WITHDRAWAL_TO_BLOCKED_ADDRESS", severity: "CRITICAL", details: { address: input.address, screeningId: screening.id } } });
      await this.prisma.complianceCase.create({ data: { type: "WALLET_RISK", userId: user.id, priority: "CRITICAL", summary: `Withdrawal attempted to blocked address (${scr.category})` } });
      throw new AppError("ADDRESS_BLOCKED_BY_SCREENING", 422);
    }
    const settings = await this.config.tradingSettings();
    const auto = scr.result === "CLEAR" && amount <= parseUsdt(settings.autoWithdrawalLimitUsdt);

    const w = await this.prisma.tx(async (tx) => {
      const prior = await tx.withdrawal.findUnique({ where: { idempotencyKey: `${user.id}:${idemKey}` } });
      if (prior) return prior;
      const created = await tx.withdrawal.create({
        data: {
          userId: user.id,
          network: input.network,
          address: input.address,
          amountUsdt: amount,
          networkFeeUsdt: n.withdrawalFeeUsdt,
          status: auto ? "APPROVED" : "PENDING_APPROVAL",
          screeningId: screening.id,
          simulated: this.custody.sandbox,
          idempotencyKey: `${user.id}:${idemKey}`,
        },
      });
      await this.ledger.move(tx, {
        type: "WITHDRAWAL_REQUEST",
        referenceType: "Withdrawal",
        referenceId: created.id,
        idempotencyKey: `withdrawal:${created.id}:request`,
        description: `Withdrawal to ${input.network}`,
        from: userKey(user.id, "USER_AVAILABLE"),
        to: userKey(user.id, "USER_WITHDRAWAL_PENDING"),
        amount: total,
        createdById: user.id,
      });
      if (!auto) {
        const a = await this.approvals.request(tx, "WITHDRAWAL", created.id, { withdrawalId: created.id }, user.id, `Screening ${scr.result}, amount ${input.amountUsdt}`);
        await tx.withdrawal.update({ where: { id: created.id }, data: { approvalRequestId: a.id } });
      }
      await this.audit.record(tx, { actorType: "USER", actorId: user.id, action: "wallet.withdrawal_requested", entityType: "Withdrawal", entityId: created.id, data: { amount: input.amountUsdt, network: input.network, screening: scr.result }, ctx });
      return created;
    });
    if (w.status === "APPROVED") await this.executeWithdrawal(w.id, null);
    return this.withdrawalDto(w.id);
  }

  private async executeWithdrawal(id: string, approvedById: string | null) {
    const w = await this.prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    if (!["APPROVED", "PENDING_APPROVAL"].includes(w.status)) throw new AppError("WITHDRAWAL_NOT_EXECUTABLE", 409);
    const total = w.amountUsdt + w.networkFeeUsdt;
    try {
      const r = await this.custody.withdraw({ accountRef: custodyRef(w.userId), network: w.network, address: w.address, amountUsdt: total, idempotencyKey: `withdrawal:${w.id}` });
      await this.prisma.tx(async (tx) => {
        await tx.withdrawal.update({ where: { id }, data: { status: "CONFIRMED", txHash: r.txHash, simulated: r.simulated } });
        await this.ledger.move(tx, {
          type: "WITHDRAWAL_COMPLETE",
          referenceType: "Withdrawal",
          referenceId: id,
          idempotencyKey: `withdrawal:${id}:complete`,
          description: "Withdrawal sent by custodian",
          from: userKey(w.userId, "USER_WITHDRAWAL_PENDING"),
          to: platformKey("PLATFORM_CUSTODY_OMNIBUS"),
          amount: total,
          createdById: approvedById,
        });
        await this.outbox.notify(tx, w.userId, "WITHDRAWAL_UPDATE", { status: "CONFIRMED" }, "/wallet");
      });
    } catch (e) {
      await this.cancelWithdrawal(id, (e as Error).message);
      throw new AppError("WITHDRAWAL_FAILED", 422, (e as Error).message);
    }
    this.outbox.kick();
    return { ok: true };
  }

  async cancelWithdrawal(id: string, reason: string) {
    const w = await this.prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    if (["CONFIRMED", "REJECTED", "FAILED"].includes(w.status)) return;
    await this.prisma.tx(async (tx) => {
      await tx.withdrawal.update({ where: { id }, data: { status: "REJECTED", failureReason: reason } });
      await this.ledger.move(tx, {
        type: "WITHDRAWAL_CANCEL",
        referenceType: "Withdrawal",
        referenceId: id,
        idempotencyKey: `withdrawal:${id}:cancel`,
        description: "Withdrawal cancelled — funds returned",
        from: userKey(w.userId, "USER_WITHDRAWAL_PENDING"),
        to: userKey(w.userId, "USER_AVAILABLE"),
        amount: w.amountUsdt + w.networkFeeUsdt,
      });
      await this.outbox.notify(tx, w.userId, "WITHDRAWAL_UPDATE", { status: "REJECTED" }, "/wallet");
    });
    this.outbox.kick();
  }

  async withdrawalDto(id: string) {
    const w = await this.prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    return {
      id: w.id,
      network: w.network,
      address: w.address,
      amountUsdt: formatUsdt(w.amountUsdt),
      networkFeeUsdt: formatUsdt(w.networkFeeUsdt),
      status: w.status,
      txHash: w.txHash,
      simulated: w.simulated,
      createdAt: w.createdAt.toISOString(),
    };
  }

  async history(userId: string) {
    const [deposits, withdrawals] = await Promise.all([
      this.prisma.deposit.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    return {
      deposits: deposits.map((d) => ({ id: d.id, network: d.network, amountUsdt: formatUsdt(d.amountUsdt), txHash: d.txHash, status: d.status, simulated: d.simulated, createdAt: d.createdAt.toISOString() })),
      withdrawals: await Promise.all(withdrawals.map((w) => this.withdrawalDto(w.id))),
    };
  }

  async ledgerLines(userId: string, cursor?: string) {
    const rows = await this.prisma.ledgerLine.findMany({
      where: { account: { userId } },
      include: { entry: true, account: { select: { kind: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, 50);
    return {
      items: page.map((l) => ({
        id: l.id,
        account: l.account.kind,
        amountUsdt: formatUsdt(l.amount),
        type: l.entry.type,
        description: l.entry.description,
        referenceType: l.entry.referenceType,
        referenceId: l.entry.referenceId,
        createdAt: l.createdAt.toISOString(),
      })),
      nextCursor: rows.length > 50 ? page[page.length - 1]!.id : null,
    };
  }

  async adminRejectWithdrawal(staff: AuthUser, id: string, reason: string) {
    const w = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw Errors.notFound("WITHDRAWAL");
    if (w.approvalRequestId) await this.approvals.reject(staff, w.approvalRequestId, reason, { ip: null, userAgent: null, deviceId: null });
    await this.cancelWithdrawal(id, reason);
    return { ok: true };
  }
}
