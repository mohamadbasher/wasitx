import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import type { ApiErrorBody } from "@wasitx/shared";

/**
 * Domain error with a stable machine-readable `code`. Clients translate codes (errors.<CODE>) —
 * messages here are English fallbacks for logs and API consumers.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: string,
    status: number = HttpStatus.BAD_REQUEST,
    message?: string,
    public readonly details?: unknown,
  ) {
    super({ code, message: message ?? code }, status);
  }
}

export const Errors = {
  unauthorized: (code = "UNAUTHORIZED") => new AppError(code, 401),
  forbidden: (code = "FORBIDDEN") => new AppError(code, 403),
  notFound: (what = "RESOURCE") => new AppError(`${what}_NOT_FOUND`, 404),
  conflict: (code: string, details?: unknown) => new AppError(code, 409, undefined, details),
  invalid: (code: string, details?: unknown) => new AppError(code, 422, undefined, details),
  tooMany: (code = "RATE_LIMITED", retryAfterSec?: number) => new AppError(code, 429, undefined, { retryAfterSec }),
};

/** Maps Postgres constraint/trigger failures raised as last line of defence to domain codes. */
function mapDbError(e: unknown): AppError | null {
  const msg = String((e as Error)?.message ?? "");
  if (msg.includes("ledger_account_non_negative")) return new AppError("INSUFFICIENT_BALANCE", 422);
  if (msg.includes("LEDGER_UNBALANCED")) return new AppError("LEDGER_INVARIANT_VIOLATION", 500);
  if (msg.includes("APPEND_ONLY")) return new AppError("IMMUTABLE_RECORD", 500);
  if (msg.includes("offer_amounts_valid")) return new AppError("OFFER_INSUFFICIENT_REMAINING", 409);
  if (msg.includes("sandbox_custody_valid")) return new AppError("CUSTODY_INSUFFICIENT_FUNDS", 422);
  if ((e as { code?: string })?.code === "P2002") return new AppError("DUPLICATE", 409);
  return null;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let body: ApiErrorBody;

    if (exception instanceof AppError) {
      body = { statusCode: exception.getStatus(), code: exception.code, message: exception.message, details: exception.details };
    } else if (exception instanceof ZodError) {
      body = {
        statusCode: 422,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        details: exception.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      };
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const r = exception.getResponse() as { message?: string | string[] } | string;
      const message = typeof r === "string" ? r : Array.isArray(r.message) ? r.message.join("; ") : (r.message ?? "Error");
      body = { statusCode: status, code: status === 404 ? "NOT_FOUND" : status === 413 ? "FILE_TOO_LARGE" : "HTTP_ERROR", message };
    } else {
      const mapped = mapDbError(exception);
      if (mapped) {
        body = { statusCode: mapped.getStatus(), code: mapped.code, message: mapped.message };
        if (mapped.getStatus() >= 500) this.logger.error(exception);
      } else {
        const e = exception as { code?: string; message?: string; meta?: unknown; stack?: string };
        this.logger.error(`${e?.code ?? ""} ${e?.message ?? String(exception)} ${e?.meta ? JSON.stringify(e.meta) : ""}`.trim());
        body = { statusCode: 500, code: "INTERNAL_ERROR", message: "Unexpected error" };
      }
    }
    if (!res.headersSent) res.status(body.statusCode).json(body);
  }
}

export { mapDbError };
