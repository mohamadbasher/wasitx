import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import { from, lastValueFrom, Observable } from "rxjs";
import type { Response } from "express";
import type { AuthedRequest } from "./auth/auth.types.js";
import { IDEMPOTENT_KEY } from "./auth/decorators.js";
import { AppError } from "./errors.js";
import { PrismaService } from "./prisma.service.js";

const TTL_MS = 24 * 3600_000;
const IN_PROGRESS = -1;

/**
 * Idempotency for state-changing endpoints (RFC draft "Idempotency-Key"):
 *  1. claim the key by inserting a placeholder row (unique PK = user + route + key);
 *  2. a concurrent duplicate sees the placeholder → 409 IDEMPOTENCY_IN_PROGRESS;
 *  3. on success the response is stored and replayed for later duplicates;
 *  4. on failure the claim is released so the client can retry with the same key.
 * Reusing a key with a different body is rejected (422).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [context.getHandler(), context.getClass()]);
    if (!enabled) return next.handle();
    return from(this.run(context, next));
  }

  private async run(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const header = req.headers["idempotency-key"];
    if (typeof header !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(header)) {
      throw new AppError("IDEMPOTENCY_KEY_REQUIRED", 400);
    }
    const key = `${req.user?.id ?? "anon"}:${req.method}:${req.route?.path ?? req.path}:${req.params?.id ?? ""}:${header}`;
    const requestHash = createHash("sha256").update(JSON.stringify(req.body ?? {})).digest("hex");

    const existing = await this.prisma.idempotencyRecord.findUnique({ where: { key } });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.requestHash !== requestHash) throw new AppError("IDEMPOTENCY_KEY_REUSED", 422);
      if (existing.responseStatus === IN_PROGRESS) throw new AppError("IDEMPOTENCY_IN_PROGRESS", 409);
      res.status(existing.responseStatus);
      res.setHeader("Idempotent-Replayed", "true");
      return existing.responseBody;
    }
    if (existing) await this.prisma.idempotencyRecord.delete({ where: { key } }).catch(() => undefined);

    try {
      await this.prisma.idempotencyRecord.create({
        data: { key, requestHash, responseStatus: IN_PROGRESS, responseBody: {}, expiresAt: new Date(Date.now() + TTL_MS) },
      });
    } catch {
      throw new AppError("IDEMPOTENCY_IN_PROGRESS", 409);
    }

    try {
      const result = await lastValueFrom(next.handle(), { defaultValue: null });
      await this.prisma.idempotencyRecord.update({
        where: { key },
        data: { responseStatus: res.statusCode || 200, responseBody: JSON.parse(JSON.stringify(result ?? null)) },
      });
      return result;
    } catch (e) {
      await this.prisma.idempotencyRecord.delete({ where: { key } }).catch(() => undefined);
      throw e;
    }
  }
}
