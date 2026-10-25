import { Global, Module, type Provider } from "@nestjs/common";
import { env } from "../../config/env.js";
import { PrismaService } from "../../common/prisma.service.js";
import {
  CUSTODY_PROVIDER,
  EMAIL_PROVIDER,
  KYC_PROVIDER,
  MALWARE_SCANNER,
  PUSH_PROVIDER,
  SCREENING_PROVIDER,
  SMS_PROVIDER,
  STORAGE_DRIVER,
  WALLET_SCREENING_PROVIDER,
} from "./providers.js";
import { SandboxCustodyProvider } from "./sandbox/sandbox-custody.provider.js";
import {
  SandboxEmailProvider,
  SandboxKycProvider,
  SandboxMalwareScanner,
  SandboxPushProvider,
  SandboxScreeningProvider,
  SandboxSmsProvider,
  SandboxWalletScreeningProvider,
} from "./sandbox/sandbox-providers.js";
import { ExpoPushProvider } from "./real/expo-push.provider.js";
import { LocalStorageDriver, S3StorageDriver } from "./real/storage.js";

/**
 * Wires provider implementations from env. "real" values intentionally throw: a real adapter may only
 * be added once the provider is contracted and its API verified (docs/INTEGRATIONS.md).
 */
function pick(kind: string, value: string, sandbox: () => unknown): unknown {
  if (value === "sandbox") return sandbox();
  throw new Error(`${kind}=${value}: no real adapter implemented yet — contract a provider and implement it against its verified API`);
}

const providers: Provider[] = [
  { provide: KYC_PROVIDER, useFactory: () => pick("KYC_PROVIDER", env.KYC_PROVIDER, () => new SandboxKycProvider()) },
  { provide: SCREENING_PROVIDER, useFactory: () => pick("SCREENING_PROVIDER", env.SCREENING_PROVIDER, () => new SandboxScreeningProvider()) },
  {
    provide: WALLET_SCREENING_PROVIDER,
    useFactory: () => pick("WALLET_SCREENING_PROVIDER", env.WALLET_SCREENING_PROVIDER, () => new SandboxWalletScreeningProvider()),
  },
  {
    provide: CUSTODY_PROVIDER,
    inject: [PrismaService],
    useFactory: (prisma: PrismaService) => pick("CUSTODY_PROVIDER", env.CUSTODY_PROVIDER, () => new SandboxCustodyProvider(prisma)),
  },
  { provide: SMS_PROVIDER, useFactory: () => pick("SMS_PROVIDER", env.SMS_PROVIDER, () => new SandboxSmsProvider()) },
  { provide: EMAIL_PROVIDER, useFactory: () => pick("EMAIL_PROVIDER", env.EMAIL_PROVIDER, () => new SandboxEmailProvider()) },
  { provide: PUSH_PROVIDER, useFactory: () => (env.PUSH_PROVIDER === "expo" ? new ExpoPushProvider() : new SandboxPushProvider()) },
  { provide: MALWARE_SCANNER, useFactory: () => pick("MALWARE_SCANNER", env.MALWARE_SCANNER, () => new SandboxMalwareScanner()) },
  {
    provide: STORAGE_DRIVER,
    useFactory: () =>
      env.STORAGE_DRIVER === "s3" ? new S3StorageDriver(process.env.S3_BUCKET ?? "") : new LocalStorageDriver(env.STORAGE_LOCAL_DIR),
  },
];

@Global()
@Module({ providers, exports: providers.map((p) => (p as { provide: symbol }).provide) })
export class IntegrationsModule {}
