import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { RequestContext } from "../../common/auth/auth.types.js";
import { PrismaService, type Tx } from "../../common/prisma.service.js";

export interface AuditInput {
  actorType: "USER" | "STAFF" | "SYSTEM";
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  data?: Record<string, unknown>;
  ctx?: RequestContext | null;
}

const GENESIS = "0".repeat(64);
/** Only rows older than this are sealed, so every transaction that could still commit a lower id has finished. */
const SEAL_SETTLE_MS = 60_000;
const SEAL_BATCH = 5_000;

const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => {
    if (typeof val === "bigint") return val.toString();
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return val;
  });

interface DigestInput {
  action: string;
  actorType: string;
  actorId: string | null;
  entityType: string;
  entityId: string | null;
  data: unknown;
  createdAt: Date;
}

const digest = (r: DigestInput) =>
  createHash("sha256")
    .update(canonical({ a: r.action, at: r.actorType, ai: r.actorId, et: r.entityType, ei: r.entityId, d: r.data ?? null, t: r.createdAt.toISOString() }))
    .digest("hex");

/**
 * Tamper-evident audit log.
 *  • Each row carries a digest of its own content (edits are detectable).
 *  • A background sealer chains contiguous, settled id ranges onto the previous seal (deletions and
 *    insertions inside sealed ranges are detectable).
 *  • Rows and seals are append-only (DB triggers).
 * Writes take no global lock, so auditing never serialises or deadlocks financial transactions.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Tx, e: AuditInput): Promise<void> {
    const createdAt = new Date();
    const data = e.data ? JSON.parse(canonical(e.data)) : undefined;
    const row = { action: e.action, actorType: e.actorType, actorId: e.actorId ?? null, entityType: e.entityType, entityId: e.entityId ?? null, data: data ?? null, createdAt };
    await tx.auditEvent.create({
      data: { ...row, data, ip: e.ctx?.ip ?? null, userAgent: e.ctx?.userAgent ?? null, hash: digest(row) },
    });
  }

  async recordNow(e: AuditInput): Promise<void> {
    await this.prisma.tx((tx) => this.record(tx, e));
  }

  /** Seals settled, unsealed rows. Safe to run on several instances (unique toId; loser retries next tick). */
  async seal(): Promise<number> {
    const last = await this.prisma.auditSeal.findFirst({ orderBy: { toId: "desc" } });
    const rows = await this.prisma.auditEvent.findMany({
      where: { id: { gt: last?.toId ?? 0n }, createdAt: { lt: new Date(Date.now() - SEAL_SETTLE_MS) } },
      orderBy: { id: "asc" },
      take: SEAL_BATCH,
      select: { id: true, hash: true },
    });
    if (!rows.length) return 0;
    const prevSealHash = last?.hash ?? GENESIS;
    const h = createHash("sha256").update(prevSealHash);
    for (const r of rows) h.update(`${r.id}:${r.hash}`);
    try {
      await this.prisma.auditSeal.create({
        data: { fromId: rows[0]!.id, toId: rows[rows.length - 1]!.id, count: rows.length, prevSealHash, hash: h.digest("hex") },
      });
    } catch {
      return 0; // another instance sealed concurrently
    }
    return rows.length;
  }

  /** Verifies every row digest and every seal; returns the first problem found. */
  async verifyChain(fromId = 0n): Promise<{ ok: boolean; checkedRows: number; checkedSeals: number; problem: string | null }> {
    let checkedRows = 0;
    let cursor = fromId > 0n ? fromId - 1n : 0n;
    for (;;) {
      const rows = await this.prisma.auditEvent.findMany({ where: { id: { gt: cursor } }, orderBy: { id: "asc" }, take: 5_000 });
      if (!rows.length) break;
      for (const r of rows) {
        if (digest({ ...r, data: r.data ?? null }) !== r.hash) return { ok: false, checkedRows, checkedSeals: 0, problem: `row ${r.id} content altered` };
        checkedRows++;
      }
      cursor = rows[rows.length - 1]!.id;
    }
    const seals = await this.prisma.auditSeal.findMany({ where: { fromId: { gte: fromId } }, orderBy: { toId: "asc" } });
    let prev = seals[0]?.prevSealHash ?? GENESIS;
    let expectedFrom: bigint | null = null;
    for (const s of seals) {
      if (s.prevSealHash !== prev) return { ok: false, checkedRows, checkedSeals: 0, problem: `seal ${s.id} chain broken` };
      const rows = await this.prisma.auditEvent.findMany({ where: { id: { gte: s.fromId, lte: s.toId } }, orderBy: { id: "asc" }, select: { id: true, hash: true } });
      if (rows.length !== s.count) return { ok: false, checkedRows, checkedSeals: 0, problem: `seal ${s.id}: ${s.count - rows.length} row(s) missing` };
      if (expectedFrom !== null && rows[0] && rows[0].id < expectedFrom) return { ok: false, checkedRows, checkedSeals: 0, problem: `seal ${s.id} overlaps` };
      const h = createHash("sha256").update(prev);
      for (const r of rows) h.update(`${r.id}:${r.hash}`);
      if (h.digest("hex") !== s.hash) return { ok: false, checkedRows, checkedSeals: 0, problem: `seal ${s.id} hash mismatch` };
      prev = s.hash;
      expectedFrom = s.toId + 1n;
    }
    return { ok: true, checkedRows, checkedSeals: seals.length, problem: null };
  }
}
