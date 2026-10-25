import { Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/auth/decorators.js";
import { AppError } from "../../common/errors.js";
import { PrismaService } from "../../common/prisma.service.js";
import { env, isSandbox } from "../../config/env.js";
import { DevOutbox } from "../integrations/sandbox/sandbox-guard.js";

@ApiTags("system")
@Controller()
export class SystemController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get("health")
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, mode: env.TRADING_MODE, time: new Date().toISOString() };
  }

  /**
   * Sandbox inbox: messages the sandbox SMS/email/push adapters would have sent (OTP codes, links).
   * Exists only in SANDBOX mode outside production builds.
   */
  @Public()
  @Get("dev/outbox")
  outbox(@Query("to") to?: string) {
    if (!isSandbox() || env.NODE_ENV === "production") throw new AppError("NOT_FOUND", 404);
    return DevOutbox.list(to);
  }

  @Public()
  @Post("dev/outbox/clear")
  @HttpCode(200)
  clear() {
    if (!isSandbox() || env.NODE_ENV === "production") throw new AppError("NOT_FOUND", 404);
    DevOutbox.clear();
    return { ok: true };
  }
}
