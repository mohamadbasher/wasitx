import type { Permission, Role } from "@wasitx/shared";
import type { Request } from "express";

export interface AuthUser {
  id: string;
  sessionId: string;
  roles: Role[];
  permissions: Set<Permission>;
  mfaVerified: boolean;
  /** cookie = browser session (CSRF enforced); bearer = mobile/API client */
  via: "cookie" | "bearer";
}

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
}

export type AuthedRequest = Request & { user?: AuthUser; ctx: RequestContext };

export const COOKIE_ACCESS = "wx_at";
export const COOKIE_REFRESH = "wx_rt";
export const COOKIE_CSRF = "wx_csrf";
