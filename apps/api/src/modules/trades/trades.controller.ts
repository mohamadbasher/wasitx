import { Controller, Get, Headers, HttpCode, Param, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  cancelTradeSchema,
  confirmReceiptSchema,
  disputeMessageSchema,
  markPaidSchema,
  openDisputeSchema,
  rateTradeSchema,
  reportMessageSchema,
  sendMessageSchema,
  takeOfferSchema,
  type TakeOfferInput,
} from "@wasitx/shared";
import { z } from "zod";
import type { AuthUser, RequestContext } from "../../common/auth/auth.types.js";
import { Ctx, CurrentUser, Idempotent, RateLimit, VerifiedTrader } from "../../common/auth/decorators.js";
import { ZBody } from "../../common/zod.js";
import { DisputesService } from "../disputes/disputes.service.js";
import { FilesService, MAX_UPLOAD_BYTES } from "../messaging/files.service.js";
import { MessagesService } from "../messaging/messages.service.js";
import { TradesService } from "./trades.service.js";

const scopeSchema = z.enum(["active", "completed", "cancelled", "disputed", "all"]).default("active");
const purposeSchema = z.enum(["CHAT_ATTACHMENT", "PAYMENT_EVIDENCE", "DISPUTE_EVIDENCE"]);

@ApiTags("trades")
@Controller()
export class TradesController {
  constructor(
    private readonly trades: TradesService,
    private readonly messages: MessagesService,
    private readonly files: FilesService,
    private readonly disputes: DisputesService,
  ) {}

  @VerifiedTrader()
  @Idempotent()
  @Post("trades")
  @RateLimit({ limit: 30, windowSec: 3600, by: "user" })
  take(@CurrentUser() user: AuthUser, @ZBody(takeOfferSchema) body: TakeOfferInput, @Headers("idempotency-key") key: string, @Ctx() ctx: RequestContext) {
    return this.trades.take(user, body, key, ctx);
  }

  @Get("trades")
  list(@CurrentUser() user: AuthUser, @Query("scope") scope?: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    return this.trades.list(user, { scope: scopeSchema.parse(scope), cursor, limit: z.coerce.number().int().min(1).max(50).default(20).parse(limit) });
  }

  @Get("trades/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.trades.get(user, id);
  }

  @Idempotent()
  @Post("trades/:id/mark-paid")
  @HttpCode(200)
  markPaid(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(markPaidSchema) body: z.infer<typeof markPaidSchema>, @Ctx() ctx: RequestContext) {
    return this.trades.markPaid(user, id, body, ctx);
  }

  @Idempotent()
  @Post("trades/:id/confirm-receipt")
  @HttpCode(200)
  confirm(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(confirmReceiptSchema) body: z.infer<typeof confirmReceiptSchema>, @Ctx() ctx: RequestContext) {
    return this.trades.confirmReceipt(user, id, body, ctx);
  }

  @Idempotent()
  @Post("trades/:id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(cancelTradeSchema) body: { reason: string }, @Ctx() ctx: RequestContext) {
    return this.trades.cancel(user, id, body.reason, ctx);
  }

  @Post("trades/:id/rate")
  @HttpCode(200)
  rate(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(rateTradeSchema) body: z.infer<typeof rateTradeSchema>) {
    return this.trades.rate(user, id, body);
  }

  @Get("trades/:id/receipt")
  receipt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.trades.receipt(user, id);
  }

  // ── chat ───────────────────────────────────────────────────────────────────
  @Get("trades/:id/messages")
  messagesList(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("before") before?: string) {
    return this.messages.list(user, id, before);
  }

  @Post("trades/:id/messages")
  @RateLimit({ limit: 20, windowSec: 60, by: "user" })
  send(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(sendMessageSchema) body: z.infer<typeof sendMessageSchema>, @Ctx() ctx: RequestContext) {
    return this.messages.send(user, id, body.body, body.attachmentIds, ctx);
  }

  @Post("trades/:id/read")
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.messages.markRead(user, id);
  }

  @Post("messages/:id/report")
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 3600, by: "user" })
  report(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(reportMessageSchema) body: { reason: string }, @Ctx() ctx: RequestContext) {
    return this.messages.report(user, id, body.reason, ctx);
  }

  // ── files ──────────────────────────────────────────────────────────────────
  @Post("files")
  @RateLimit({ limit: 30, windowSec: 3600, by: "user" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined, @Query("purpose") purpose: string, @Query("tradeId") tradeId?: string) {
    return this.files.upload(user, file, purposeSchema.parse(purpose), tradeId);
  }

  @Get("files/:id")
  async download(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    const f = await this.files.download(user, id);
    res.setHeader("Content-Type", f.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.send(f.data);
  }

  // ── disputes ───────────────────────────────────────────────────────────────
  @Post("trades/:id/dispute")
  @RateLimit({ limit: 5, windowSec: 3600, by: "user" })
  openDispute(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(openDisputeSchema) body: z.infer<typeof openDisputeSchema>, @Ctx() ctx: RequestContext) {
    return this.disputes.open(user, id, body, ctx);
  }

  @Get("disputes/:id")
  dispute(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.disputes.get(user, id);
  }

  @Post("disputes/:id/messages")
  @RateLimit({ limit: 30, windowSec: 3600, by: "user" })
  disputeMessage(@CurrentUser() user: AuthUser, @Param("id") id: string, @ZBody(disputeMessageSchema) body: z.infer<typeof disputeMessageSchema>, @Ctx() ctx: RequestContext) {
    return this.disputes.addMessage(user, id, body.body, body.evidenceFileIds, false, ctx);
  }
}
