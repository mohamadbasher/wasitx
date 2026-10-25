import { Injectable } from "@nestjs/common";
import { PrismaService, type Tx } from "../../common/prisma.service.js";
import { AppError } from "../../common/errors.js";
import type { JournalType, LedgerAccountKind } from "../../generated/prisma/client.js";

export type UserLedgerKind = "USER_AVAILABLE" | "USER_OFFER_RESERVED" | "USER_ESCROW" | "USER_WITHDRAWAL_PENDING";
export type PlatformLedgerKind = "PLATFORM_FEE_REVENUE" | "PLATFORM_CUSTODY_OMNIBUS";

export const userKey = (userId: string, kind: UserLedgerKind) => `user:${userId}:${kind}:USDT`;
export const platformKey = (kind: PlatformLedgerKind) => `platform:${kind}:USDT`;

export interface PostingLine {
  key: string;
  amount: bigint;
}

export interface Posting {
  type: JournalType;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  description: string;
  createdById?: string | null;
  lines: PostingLine[];
}

/**
 * Double-entry ledger of platform-accounted USDT.
 *
 * Sign convention: a line's amount is the delta applied to its account. Client accounts hold positive
 * balances; PLATFORM_CUSTODY_OMNIBUS mirrors what the custodian holds for clients and therefore carries
 * the negative of all client + fee balances. Invariants (enforced in Postgres, see migration 0002):
 *   • every entry's lines sum to zero (deferred constraint trigger),
 *   • balances change only through lines (trigger), client balances never go negative (CHECK),
 *   • entries/lines are append-only. Corrections are new ADJUSTMENT entries, never edits.
 * The ledger is NOT the custodian's balance: ReconciliationService compares the two.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  private kindFromKey(key: string): { kind: LedgerAccountKind; userId: string | null } {
    const parts = key.split(":");
    if (parts[0] === "user") return { kind: parts[2] as LedgerAccountKind, userId: parts[1]! };
    return { kind: parts[1] as LedgerAccountKind, userId: null };
  }

  private async accountIds(tx: Tx, keys: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(keys)];
    const existing = await tx.ledgerAccount.findMany({ where: { key: { in: unique } }, select: { id: true, key: true } });
    const map = new Map(existing.map((a) => [a.key, a.id]));
    for (const key of unique) {
      if (map.has(key)) continue;
      const { kind, userId } = this.kindFromKey(key);
      const acct = await tx.ledgerAccount.upsert({
        where: { key },
        create: { key, kind, userId, allowNegative: kind === "PLATFORM_CUSTODY_OMNIBUS" },
        update: {},
        select: { id: true },
      });
      map.set(key, acct.id);
    }
    return map;
  }

  /** Posts a balanced journal entry. Idempotent on `idempotencyKey`: a replay returns the original entry id. */
  async post(tx: Tx, p: Posting): Promise<string> {
    const lines = p.lines.filter((l) => l.amount !== 0n);
    if (lines.length < 2) throw new AppError("LEDGER_ENTRY_TOO_SHORT", 500);
    const sum = lines.reduce((s, l) => s + l.amount, 0n);
    if (sum !== 0n) throw new AppError("LEDGER_UNBALANCED", 500, `entry ${p.idempotencyKey} sums to ${sum}`);

    const prior = await tx.journalEntry.findUnique({ where: { idempotencyKey: p.idempotencyKey }, select: { id: true } });
    if (prior) return prior.id;

    const ids = await this.accountIds(tx, lines.map((l) => l.key));
    const entry = await tx.journalEntry.create({
      data: {
        type: p.type,
        referenceType: p.referenceType,
        referenceId: p.referenceId,
        idempotencyKey: p.idempotencyKey,
        description: p.description,
        createdById: p.createdById ?? null,
      },
    });
    // Insert in a stable account order so concurrent postings lock balance rows in the same order (no deadlocks).
    const rows = lines
      .map((l) => ({ entryId: entry.id, accountId: ids.get(l.key)!, amount: l.amount }))
      .sort((a, b) => a.accountId.localeCompare(b.accountId));
    await tx.ledgerLine.createMany({ data: rows });
    return entry.id;
  }

  /** Two-line transfer helper. */
  move(tx: Tx, p: Omit<Posting, "lines"> & { from: string; to: string; amount: bigint }): Promise<string> {
    return this.post(tx, { ...p, lines: [{ key: p.from, amount: -p.amount }, { key: p.to, amount: p.amount }] });
  }

  async userBalances(userId: string, db: Tx | PrismaService = this.prisma) {
    const rows = await db.ledgerAccount.findMany({ where: { userId }, select: { kind: true, balance: true } });
    const get = (k: UserLedgerKind) => rows.find((r) => r.kind === k)?.balance ?? 0n;
    const available = get("USER_AVAILABLE");
    const reserved = get("USER_OFFER_RESERVED");
    const escrow = get("USER_ESCROW");
    const pendingWithdrawal = get("USER_WITHDRAWAL_PENDING");
    return { available, reserved, escrow, pendingWithdrawal, total: available + reserved + escrow + pendingWithdrawal };
  }

  async available(tx: Tx, userId: string): Promise<bigint> {
    const a = await tx.ledgerAccount.findUnique({ where: { key: userKey(userId, "USER_AVAILABLE") }, select: { balance: true } });
    return a?.balance ?? 0n;
  }

  /** Sum of every client + fee balance (what the custodian should hold). */
  async platformLiabilities(): Promise<bigint> {
    const r = await this.prisma.ledgerAccount.aggregate({ _sum: { balance: true }, where: { kind: { not: "PLATFORM_CUSTODY_OMNIBUS" } } });
    return r._sum.balance ?? 0n;
  }

  async omnibusBalance(): Promise<bigint> {
    const a = await this.prisma.ledgerAccount.findUnique({ where: { key: platformKey("PLATFORM_CUSTODY_OMNIBUS") } });
    return a?.balance ?? 0n;
  }
}
