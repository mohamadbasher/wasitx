import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

export type Tx = Prisma.TransactionClient;

/** Serialization failures and deadlocks — Prisma 7 nests the SQLSTATE under meta.driverAdapterError. */
export function isRetryable(e: unknown): boolean {
  const err = e as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string; kind?: string } } } };
  const codes = [err?.code, err?.meta?.code, err?.meta?.driverAdapterError?.cause?.originalCode];
  return codes.some((c) => c === "40001" || c === "40P01" || c === "P2034") || err?.meta?.driverAdapterError?.cause?.kind === "TransactionWriteConflict";
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 20 }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `fn` in a transaction, retrying on serialization failures / deadlocks (40001, 40P01),
   * which are expected under concurrent trading and are safe to retry because every write is
   * idempotent or guarded by row locks.
   */
  async tx<T>(fn: (tx: Tx) => Promise<T>, opts: { isolation?: Prisma.TransactionIsolationLevel; retries?: number } = {}): Promise<T> {
    const retries = opts.retries ?? 3;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.$transaction(fn, {
          isolationLevel: opts.isolation ?? Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 15_000,
          maxWait: 5_000,
        });
      } catch (e) {
        const retryable = isRetryable(e);
        if (!retryable || attempt >= retries) throw e;
        await new Promise((r) => setTimeout(r, 20 * 2 ** attempt + Math.random() * 20));
      }
    }
  }
}
