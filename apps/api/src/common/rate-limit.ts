import { CanActivate, ExecutionContext, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { env } from "../config/env.js";
import type { AuthedRequest } from "./auth/auth.types.js";
import { RATE_LIMIT_KEY, type RateLimitOptions } from "./auth/decorators.js";
import { Errors } from "./errors.js";

export interface RateLimitStore {
  /** Increments the counter for `key` in the current window and returns the new count + TTL. */
  hit(key: string, windowSec: number): Promise<{ count: number; ttlSec: number }>;
}

/** Fixed-window counter in process memory. Correct for a single instance; use Redis when scaled out. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
  }, 60_000).unref();

  async hit(key: string, windowSec: number) {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      return { count: 1, ttlSec: windowSec };
    }
    b.count++;
    return { count: b.count, ttlSec: Math.ceil((b.resetAt - now) / 1000) };
  }

  close() {
    clearInterval(this.timer);
  }
}

/** Redis INCR/EXPIRE store, shared across API instances. Loaded only when REDIS_URL is set. */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: { incr(k: string): Promise<number>; expire(k: string, s: number): Promise<number>; ttl(k: string): Promise<number> }) {}
  async hit(key: string, windowSec: number) {
    const k = `rl:${key}`;
    const count = await this.redis.incr(k);
    if (count === 1) await this.redis.expire(k, windowSec);
    const ttl = await this.redis.ttl(k);
    return { count, ttlSec: ttl > 0 ? ttl : windowSec };
  }
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger("RateLimit");
  private store: RateLimitStore = new MemoryRateLimitStore();

  async init() {
    if (!env.REDIS_URL) return;
    try {
      const { Redis } = await import("ioredis");
      const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
      this.store = new RedisRateLimitStore(client);
      this.logger.log("Using Redis rate-limit store");
    } catch (e) {
      this.logger.warn(`Redis unavailable, using memory store: ${(e as Error).message}`);
    }
  }

  async consume(key: string, limit: number, windowSec: number) {
    if (env.NODE_ENV === "test" && !process.env.RATE_LIMIT_IN_TESTS) return;
    const { count, ttlSec } = await this.store.hit(key, windowSec);
    if (count > limit) throw Errors.tooMany("RATE_LIMITED", ttlSec);
  }

  onModuleDestroy() {
    if (this.store instanceof MemoryRateLimitStore) this.store.close();
  }
}

/** Global guard applying @RateLimit options, plus a baseline per-IP limit for every route. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const ip = req.ctx?.ip ?? "unknown";
    await this.limiter.consume(`global:${ip}`, 600, 60);

    const opts = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!opts) return true;
    const bucket = opts.key ?? `${req.method}:${req.route?.path ?? req.path}`;
    let who = ip;
    if (opts.by === "user") who = req.user?.id ?? ip;
    if (opts.by === "ip+body.email") who = `${ip}:${String((req.body as { email?: string })?.email ?? "").toLowerCase()}`;
    await this.limiter.consume(`${bucket}:${who}`, opts.limit, opts.windowSec);
    return true;
  }
}
