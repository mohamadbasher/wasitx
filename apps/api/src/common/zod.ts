import { Body, PipeTransform, Query } from "@nestjs/common";
import type { ZodType } from "zod";

class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value ?? {}); // ZodError → 422 VALIDATION_FAILED (GlobalExceptionFilter)
  }
}

/** Validated request body using a schema shared with the clients. */
export const ZBody = <T>(schema: ZodType<T>) => Body(new ZodPipe(schema));
export const ZQuery = <T>(schema: ZodType<T>) => Query(new ZodPipe(schema));
