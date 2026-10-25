import { Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaCodeSchema,
  phoneStartSchema,
  phoneVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type LoginInput,
  type RegisterInput,
} from "@wasitx/shared";
import { z } from "zod";
import { COOKIE_ACCESS, COOKIE_CSRF, COOKIE_REFRESH, type AuthUser, type RequestContext } from "../../common/auth/auth.types.js";
import { Ctx, CurrentUser, Public, RateLimit } from "../../common/auth/decorators.js";
import { Errors } from "../../common/errors.js";
import { ZBody } from "../../common/zod.js";
import { env } from "../../config/env.js";
import { AuthService, type IssuedTokens } from "./auth.service.js";

const isMobile = (req: Request) => req.headers["x-client"] === "mobile";

/**
 * Browser clients get httpOnly cookies (tokens never reach JavaScript) plus a readable CSRF cookie for
 * the double-submit check. Mobile clients (X-Client: mobile) receive tokens in the body and keep them
 * in the OS secure store.
 */
function deliver(req: Request, res: Response, t: IssuedTokens) {
  if (isMobile(req)) {
    return { accessToken: t.accessToken, accessExpiresAt: t.accessExpiresAt, refreshToken: t.refreshToken, refreshExpiresAt: t.refreshExpiresAt };
  }
  const base = { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, domain: env.COOKIE_DOMAIN };
  res.cookie(COOKIE_ACCESS, t.accessToken, { ...base, path: "/", expires: t.accessExpiresAt });
  res.cookie(COOKIE_REFRESH, t.refreshToken, { ...base, path: "/api/v1/auth", expires: t.refreshExpiresAt });
  res.cookie(COOKIE_CSRF, randomBytes(24).toString("base64url"), { ...base, httpOnly: false, path: "/", expires: t.refreshExpiresAt });
  return { ok: true, accessExpiresAt: t.accessExpiresAt };
}

function clear(res: Response) {
  const base = { domain: env.COOKIE_DOMAIN };
  res.clearCookie(COOKIE_ACCESS, { ...base, path: "/" });
  res.clearCookie(COOKIE_REFRESH, { ...base, path: "/api/v1/auth" });
  res.clearCookie(COOKIE_CSRF, { ...base, path: "/" });
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @RateLimit({ limit: 5, windowSec: 3600, by: "ip" })
  async register(@ZBody(registerSchema) body: RegisterInput, @Ctx() ctx: RequestContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return deliver(req, res, await this.auth.register(body, ctx));
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 900, by: "ip+body.email" })
  async login(@ZBody(loginSchema) body: LoginInput, @Ctx() ctx: RequestContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return deliver(req, res, await this.auth.login(body, ctx));
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  @RateLimit({ limit: 60, windowSec: 300, by: "ip" })
  async refresh(@ZBody(refreshSchema) body: { refreshToken?: string }, @Ctx() ctx: RequestContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = body.refreshToken ?? (req.cookies as Record<string, string>)[COOKIE_REFRESH];
    if (!token) throw Errors.unauthorized("SESSION_INVALID");
    try {
      return deliver(req, res, await this.auth.refresh(token, ctx));
    } catch (e) {
      if (!isMobile(req)) clear(res);
      throw e;
    }
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    clear(res);
    return { ok: true };
  }

  @Post("logout-all")
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: AuthUser, @Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id, ctx);
    clear(res);
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Public()
  @Post("verify-email")
  @HttpCode(200)
  @RateLimit({ limit: 20, windowSec: 3600, by: "ip" })
  verifyEmail(@ZBody(verifyEmailSchema) body: { token: string }, @Ctx() ctx: RequestContext) {
    return this.auth.verifyEmail(body.token, ctx);
  }

  @Post("resend-email")
  @HttpCode(200)
  @RateLimit({ limit: 3, windowSec: 3600, by: "user" })
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendEmailVerification(user.id);
  }

  @Post("phone/start")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowSec: 3600, by: "user" })
  phoneStart(@CurrentUser() user: AuthUser, @ZBody(phoneStartSchema) body: { phone: string }) {
    return this.auth.startPhoneVerification(user.id, body.phone);
  }

  @Post("phone/verify")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 900, by: "user" })
  phoneVerify(@CurrentUser() user: AuthUser, @ZBody(phoneVerifySchema) body: { phone: string; code: string }, @Ctx() ctx: RequestContext) {
    return this.auth.verifyPhone(user.id, body.phone, body.code, ctx);
  }

  @Public()
  @Post("password/forgot")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowSec: 3600, by: "ip+body.email" })
  forgot(@ZBody(forgotPasswordSchema) body: { email: string }) {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @Post("password/reset")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 3600, by: "ip" })
  reset(@ZBody(resetPasswordSchema) body: { token: string; password: string }, @Ctx() ctx: RequestContext) {
    return this.auth.resetPassword(body.token, body.password, ctx);
  }

  @Post("password/change")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowSec: 900, by: "user" })
  change(@CurrentUser() user: AuthUser, @ZBody(changePasswordSchema) body: { currentPassword: string; newPassword: string }, @Ctx() ctx: RequestContext) {
    return this.auth.changePassword(user.id, user.sessionId, body.currentPassword, body.newPassword, ctx);
  }

  @Post("mfa/setup")
  @HttpCode(200)
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.mfaSetup(user.id);
  }

  @Post("mfa/enable")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 900, by: "user" })
  mfaEnable(@CurrentUser() user: AuthUser, @ZBody(mfaCodeSchema) body: { code: string }, @Ctx() ctx: RequestContext) {
    return this.auth.mfaEnable(user.id, user.sessionId, body.code, ctx);
  }

  @Post("mfa/verify")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 900, by: "user" })
  mfaVerify(@CurrentUser() user: AuthUser, @ZBody(mfaCodeSchema) body: { code: string }) {
    return this.auth.mfaVerifySession(user.id, user.sessionId, body.code);
  }

  @Post("mfa/disable")
  @HttpCode(200)
  @RateLimit({ limit: 5, windowSec: 900, by: "user" })
  mfaDisable(@CurrentUser() user: AuthUser, @ZBody(mfaCodeSchema) body: { code: string }, @Ctx() ctx: RequestContext) {
    return this.auth.mfaDisable(user.id, body.code, user.roles, ctx);
  }

  @Get("sessions")
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Delete("sessions/:id")
  revoke(@CurrentUser() user: AuthUser, @Param("id") id: string, @Ctx() ctx: RequestContext) {
    return this.auth.revokeSession(user.id, z.string().max(40).parse(id), ctx);
  }

  @Get("login-history")
  history(@CurrentUser() user: AuthUser) {
    return this.auth.loginHistory(user.id);
  }
}
