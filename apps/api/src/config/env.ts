import "dotenv/config";
import { z } from "zod";
import { TRADING_MODES } from "@wasitx/shared";

const sandboxable = z.enum(["sandbox", "real"]).default("sandbox");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  BRAND_NAME: z.string().min(1).default("WASIT X"),
  TRADING_MODE: z.enum(TRADING_MODES).default("SANDBOX"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().optional().transform((v) => (v ? v : undefined)),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001"),
  COOKIE_DOMAIN: z.string().optional().transform((v) => (v ? v : undefined)),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_URL: z.string().url().default("http://localhost:3001"),
  TOKEN_SIGNING_KEY: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().refine((k) => Buffer.from(k, "base64").length === 32, "must be 32 bytes base64"),
  LOOKUP_HMAC_KEY: z.string().min(32),
  KYC_PROVIDER: sandboxable,
  SCREENING_PROVIDER: sandboxable,
  CUSTODY_PROVIDER: sandboxable,
  WALLET_SCREENING_PROVIDER: sandboxable,
  SMS_PROVIDER: sandboxable,
  EMAIL_PROVIDER: sandboxable,
  PUSH_PROVIDER: z.enum(["sandbox", "expo"]).default("sandbox"),
  MALWARE_SCANNER: sandboxable,
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".storage"),
});

export type Env = z.infer<typeof EnvSchema>;

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  // Hard stop: production mode can never run on sandbox adapters or dev secrets.
  if (env.TRADING_MODE === "PRODUCTION") {
    const sandboxed = (
      ["KYC_PROVIDER", "SCREENING_PROVIDER", "CUSTODY_PROVIDER", "WALLET_SCREENING_PROVIDER", "SMS_PROVIDER", "EMAIL_PROVIDER", "MALWARE_SCANNER"] as const
    ).filter((k) => env[k] === "sandbox");
    if (sandboxed.length) {
      throw new Error(`TRADING_MODE=PRODUCTION refused: sandbox adapters configured for ${sandboxed.join(", ")}`);
    }
    if (/dev-only|change-me/.test(env.TOKEN_SIGNING_KEY + env.LOOKUP_HMAC_KEY)) {
      throw new Error("TRADING_MODE=PRODUCTION refused: development secrets in use");
    }
  }
  return env;
}

export const env = load();
export const isSandbox = () => env.TRADING_MODE === "SANDBOX";
export const corsOrigins = () => env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
