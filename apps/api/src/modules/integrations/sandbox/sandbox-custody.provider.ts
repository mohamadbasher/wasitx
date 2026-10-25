import { randomBytes } from "node:crypto";
import type { NetworkCode } from "@wasitx/shared";
import { PrismaService } from "../../../common/prisma.service.js";
import type { CustodyProvider } from "../providers.js";
import { assertSandboxAllowed } from "./sandbox-guard.js";

export const PLATFORM_FEE_CUSTODY_REF = "platform:fees";

/**
 * ⚠ SANDBOX CUSTODIAN. Simulates an external licensed custodian's books in `SandboxCustody*` tables.
 * Each call runs in its own DB transaction — deliberately NOT inside the caller's transaction —
 * because a real custodian is a separate system: the platform must cope with calls that succeed
 * after its own transaction rolled back, which is why every call carries an idempotency key and
 * the escrow worker reconciles EscrowOperation rows against the custodian.
 * No blockchain transaction ever happens; deposit/withdrawal hashes are prefixed "SIMULATED-".
 */
export class SandboxCustodyProvider implements CustodyProvider {
  readonly name = "sandbox-custody";
  readonly sandbox = true;

  constructor(private readonly prisma: PrismaService) {}

  /** Replays the stored response for an idempotency key, or runs `fn` once and stores its response. */
  private async once<T extends object>(key: string, type: string, request: object, fn: (tx: Parameters<Parameters<PrismaService["tx"]>[0]>[0]) => Promise<T>): Promise<T> {
    assertSandboxAllowed(this.name);
    return this.prisma.tx(async (tx) => {
      const prior = await tx.sandboxCustodyOperation.findUnique({ where: { idempotencyKey: key } });
      if (prior) return prior.response as T;
      const result = await fn(tx);
      await tx.sandboxCustodyOperation.create({
        data: { idempotencyKey: key, type, request: JSON.parse(JSON.stringify(request, (_k, v) => (typeof v === "bigint" ? v.toString() : v))), response: result },
      });
      return result;
    });
  }

  async ensureAccount(ownerRef: string) {
    assertSandboxAllowed(this.name);
    const acct = await this.prisma.sandboxCustodyAccount.upsert({
      where: { externalRef: ownerRef },
      create: { externalRef: ownerRef },
      update: {},
    });
    return { accountRef: acct.externalRef };
  }

  async getBalance(accountRef: string) {
    assertSandboxAllowed(this.name);
    const a = await this.prisma.sandboxCustodyAccount.findUnique({ where: { externalRef: accountRef } });
    return { totalUsdt: a?.totalUsdt ?? 0n, heldUsdt: a?.heldUsdt ?? 0n };
  }

  async totalAssets() {
    assertSandboxAllowed(this.name);
    const r = await this.prisma.sandboxCustodyAccount.aggregate({ _sum: { totalUsdt: true } });
    return r._sum.totalUsdt ?? 0n;
  }

  async createHold(p: { accountRef: string; amountUsdt: bigint; idempotencyKey: string }) {
    return this.once(p.idempotencyKey, "HOLD", p, async (tx) => {
      const acct = await tx.sandboxCustodyAccount.findUnique({ where: { externalRef: p.accountRef } });
      if (!acct) throw new Error("CUSTODY_ACCOUNT_NOT_FOUND");
      if (acct.totalUsdt - acct.heldUsdt < p.amountUsdt) throw new Error("CUSTODY_INSUFFICIENT_FUNDS");
      await tx.sandboxCustodyAccount.update({ where: { id: acct.id }, data: { heldUsdt: { increment: p.amountUsdt } } });
      const hold = await tx.sandboxCustodyHold.create({
        data: { accountId: acct.id, amountUsdt: p.amountUsdt, idempotencyKey: p.idempotencyKey },
      });
      return { holdRef: hold.id };
    });
  }

  async releaseHold(p: { holdRef: string; toAccountRef: string; toAmountUsdt: bigint; feeAccountRef: string; feeAmountUsdt: bigint; idempotencyKey: string }) {
    return this.once(p.idempotencyKey, "RELEASE", p, async (tx) => {
      const hold = await tx.sandboxCustodyHold.findUnique({ where: { id: p.holdRef } });
      if (!hold || hold.status !== "HELD") throw new Error("CUSTODY_HOLD_NOT_ACTIVE");
      if (p.toAmountUsdt + p.feeAmountUsdt !== hold.amountUsdt) throw new Error("CUSTODY_RELEASE_AMOUNT_MISMATCH");
      await tx.sandboxCustodyAccount.update({
        where: { id: hold.accountId },
        data: { heldUsdt: { decrement: hold.amountUsdt }, totalUsdt: { decrement: hold.amountUsdt } },
      });
      for (const [ref, amt] of [[p.toAccountRef, p.toAmountUsdt], [p.feeAccountRef, p.feeAmountUsdt]] as const) {
        if (amt === 0n) continue;
        await tx.sandboxCustodyAccount.upsert({
          where: { externalRef: ref },
          create: { externalRef: ref, totalUsdt: amt },
          update: { totalUsdt: { increment: amt } },
        });
      }
      await tx.sandboxCustodyHold.update({
        where: { id: hold.id },
        data: { status: "RELEASED", releasedTo: p.toAccountRef, feeAccountRef: p.feeAccountRef, closedAt: new Date() },
      });
      return { ref: `sbx_rel_${randomBytes(6).toString("hex")}` };
    });
  }

  async cancelHold(p: { holdRef: string; idempotencyKey: string }) {
    return this.once(p.idempotencyKey, "CANCEL_HOLD", p, async (tx) => {
      const hold = await tx.sandboxCustodyHold.findUnique({ where: { id: p.holdRef } });
      if (!hold || hold.status !== "HELD") throw new Error("CUSTODY_HOLD_NOT_ACTIVE");
      await tx.sandboxCustodyAccount.update({ where: { id: hold.accountId }, data: { heldUsdt: { decrement: hold.amountUsdt } } });
      await tx.sandboxCustodyHold.update({ where: { id: hold.id }, data: { status: "CANCELLED", closedAt: new Date() } });
      return { ref: `sbx_cxl_${randomBytes(6).toString("hex")}` };
    });
  }

  async withdraw(p: { accountRef: string; network: NetworkCode; address: string; amountUsdt: bigint; idempotencyKey: string }) {
    return this.once(p.idempotencyKey, "WITHDRAW", p, async (tx) => {
      const acct = await tx.sandboxCustodyAccount.findUnique({ where: { externalRef: p.accountRef } });
      if (!acct || acct.totalUsdt - acct.heldUsdt < p.amountUsdt) throw new Error("CUSTODY_INSUFFICIENT_FUNDS");
      await tx.sandboxCustodyAccount.update({ where: { id: acct.id }, data: { totalUsdt: { decrement: p.amountUsdt } } });
      return { txHash: `SIMULATED-${randomBytes(16).toString("hex")}`, simulated: true };
    });
  }

  async simulateDeposit(p: { accountRef: string; network: NetworkCode; amountUsdt: bigint; idempotencyKey: string }) {
    return this.once(p.idempotencyKey, "DEPOSIT", p, async (tx) => {
      await tx.sandboxCustodyAccount.upsert({
        where: { externalRef: p.accountRef },
        create: { externalRef: p.accountRef, totalUsdt: p.amountUsdt },
        update: { totalUsdt: { increment: p.amountUsdt } },
      });
      return { txHash: `SIMULATED-${randomBytes(16).toString("hex")}` };
    });
  }
}
