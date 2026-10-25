import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Permission } from "@wasitx/shared";
import type { AuthedRequest, AuthUser, RequestContext } from "./auth.types.js";

export const IS_PUBLIC = "wx:public";
export const PERMISSIONS_KEY = "wx:permissions";
export const STAFF_KEY = "wx:staff";
export const TRADER_KEY = "wx:trader";
export const RATE_LIMIT_KEY = "wx:ratelimit";
export const IDEMPOTENT_KEY = "wx:idempotent";

/** Route is reachable without a session (the user is still resolved if a valid session exists). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Every listed permission is required. */
export const RequirePermissions = (...p: Permission[]) => SetMetadata(PERMISSIONS_KEY, p);

/** Staff route: needs `admin:access` and an MFA-verified session. */
export const Staff = () => SetMetadata(STAFF_KEY, true);

/** Requires the "verified trader" tier (KYC approved, Israeli residency, adult, not restricted). */
export const VerifiedTrader = () => SetMetadata(TRADER_KEY, true);

export interface RateLimitOptions {
  /** bucket name; defaults to the route path */
  key?: string;
  limit: number;
  windowSec: number;
  by?: "ip" | "user" | "ip+body.email";
}
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, opts);

/** Requires an Idempotency-Key header; replays return the original response. */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.user!;
});

export const OptionalUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().user;
});

export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestContext => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().ctx;
});
