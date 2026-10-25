import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@wasitx/shared";
import { AppError, Errors } from "../errors.js";
import { COOKIE_ACCESS, COOKIE_CSRF, type AuthedRequest } from "./auth.types.js";
import { IS_PUBLIC, PERMISSIONS_KEY, STAFF_KEY, TRADER_KEY } from "./decorators.js";
import { SessionResolver } from "./session-resolver.service.js";
import { EligibilityService } from "./eligibility.service.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global guard: authentication → CSRF (cookie sessions) → staff/MFA → permissions → trader tier.
 * Authorization lives here and in services; UI hiding is never relied upon.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionResolver,
    private readonly eligibility: EligibilityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);

    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[COOKIE_ACCESS];
    const token = bearer ?? cookieToken;
    if (token) {
      const user = await this.sessions.resolve(token, bearer ? "bearer" : "cookie");
      if (user) req.user = user;
    }

    const isPublic = meta<boolean>(IS_PUBLIC);
    if (!req.user) {
      if (isPublic) return true;
      throw Errors.unauthorized();
    }

    // Double-submit CSRF check for browser sessions on state-changing requests.
    if (req.user.via === "cookie" && !SAFE_METHODS.has(req.method)) {
      const cookie = (req.cookies as Record<string, string>)[COOKIE_CSRF];
      const sent = req.headers["x-csrf-token"];
      if (!cookie || typeof sent !== "string" || cookie !== sent) throw Errors.forbidden("CSRF_TOKEN_INVALID");
    }

    if (meta<boolean>(STAFF_KEY)) {
      if (!req.user.permissions.has("admin:access")) throw Errors.forbidden();
      if (!req.user.mfaVerified) throw Errors.forbidden("STAFF_MFA_REQUIRED");
    }

    const required = meta<Permission[]>(PERMISSIONS_KEY);
    if (required?.some((p) => !req.user!.permissions.has(p))) throw Errors.forbidden("MISSING_PERMISSION");

    if (meta<boolean>(TRADER_KEY)) {
      const reasons = await this.eligibility.reasons(req.user.id);
      if (reasons.length) throw new AppError("NOT_ELIGIBLE_TO_TRADE", 403, undefined, reasons);
    }
    return true;
  }
}
