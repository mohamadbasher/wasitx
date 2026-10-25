import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { corsOrigins, env } from "./config/env.js";
import { RateLimitService } from "./common/rate-limit.js";
import { SystemConfigService } from "./modules/config/system-config.service.js";

// Safety net: an accidental BigInt in a response serialises as a string instead of crashing.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: env.NODE_ENV === "test" ? ["error"] : undefined });
  app.set("trust proxy", 1); // behind exactly one load balancer in production (sets req.ip correctly)
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cookieParser());
  app.useBodyParser("json", { limit: "200kb" });
  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
    allowedHeaders: ["content-type", "authorization", "x-csrf-token", "idempotency-key", "x-device-id", "x-client", "accept-language"],
    exposedHeaders: ["idempotent-replayed"],
  });
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();

  if (env.NODE_ENV !== "production") {
    const doc = new DocumentBuilder()
      .setTitle(`${env.BRAND_NAME} API`)
      .setDescription("Israel-only USDT/ILS P2P marketplace. Amounts are decimal strings. Mutations need Idempotency-Key where marked.")
      .setVersion("1.0")
      .addBearerAuth()
      .addCookieAuth("wx_at")
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: "api/docs/openapi.json" });
  }

  await app.get(RateLimitService).init();

  if (env.TRADING_MODE === "PRODUCTION" && !(await app.get(SystemConfigService).allGatesSatisfied())) {
    throw new Error("TRADING_MODE=PRODUCTION refused: production gates are not all recorded (see docs/REGULATORY-CHECKLIST.md §9)");
  }
  return app;
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(env.PORT);
  new Logger("Bootstrap").log(`${env.BRAND_NAME} API on :${env.PORT} — mode ${env.TRADING_MODE}`);
}

if (process.env.NODE_ENV !== "test") {
  bootstrap().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
