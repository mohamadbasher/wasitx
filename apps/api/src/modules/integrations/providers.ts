/**
 * Provider contracts for every external dependency. Real implementations must be written against the
 * provider's actual, contracted API (see docs/INTEGRATIONS.md) — none are invented here.
 * Every implementation declares `sandbox`; sandbox implementations refuse to run in PRODUCTION mode.
 */
import type { NetworkCode } from "@wasitx/shared";

export interface ProviderMeta {
  readonly name: string;
  readonly sandbox: boolean;
}

// ── KYC (document + liveness) ────────────────────────────────────────────────
export interface KycApplicantInput {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationalId: string;
}

export interface KycVerificationResult {
  applicantId: string;
  documentVerified: boolean;
  livenessVerified: boolean;
  /** ISO-3166 alpha-2 country of verified residency (from ID / proof of address), null if unknown */
  residencyCountry: string | null;
  verifiedDateOfBirth: string | null;
  answer: "GREEN" | "RED" | "RETRY" | "MANUAL";
  labels: string[];
}

export interface KycProvider extends ProviderMeta {
  createApplicant(input: KycApplicantInput): Promise<{ applicantId: string; sdkToken: string | null }>;
  /** Verifies and parses a provider webhook; returns null if the signature is invalid. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<KycVerificationResult | null>;
}

// ── Sanctions / PEP screening ────────────────────────────────────────────────
export interface ScreeningResultData {
  sanctionsHit: boolean;
  pepHit: boolean;
  matches: { list: string; name: string; score: number }[];
}

export interface ScreeningProvider extends ProviderMeta {
  screenPerson(input: { firstName: string; lastName: string; dateOfBirth: string; nationalId: string }): Promise<ScreeningResultData>;
}

// ── Blockchain wallet risk ───────────────────────────────────────────────────
export interface WalletScreeningProvider extends ProviderMeta {
  screenAddress(network: NetworkCode, address: string): Promise<{ result: "CLEAR" | "REVIEW" | "BLOCK"; riskScore: number; category: string | null; raw: unknown }>;
}

// ── Custody / escrow at a licensed custodian ─────────────────────────────────
export interface CustodyProvider extends ProviderMeta {
  ensureAccount(ownerRef: string): Promise<{ accountRef: string }>;
  getBalance(accountRef: string): Promise<{ totalUsdt: bigint; heldUsdt: bigint }>;
  /** Sum of client assets the custodian holds for the platform (for reconciliation). */
  totalAssets(): Promise<bigint>;
  createHold(p: { accountRef: string; amountUsdt: bigint; idempotencyKey: string }): Promise<{ holdRef: string }>;
  releaseHold(p: {
    holdRef: string;
    toAccountRef: string;
    toAmountUsdt: bigint;
    feeAccountRef: string;
    feeAmountUsdt: bigint;
    idempotencyKey: string;
  }): Promise<{ ref: string }>;
  cancelHold(p: { holdRef: string; idempotencyKey: string }): Promise<{ ref: string }>;
  withdraw(p: { accountRef: string; network: NetworkCode; address: string; amountUsdt: bigint; idempotencyKey: string }): Promise<{ txHash: string; simulated: boolean }>;
  /** Sandbox only: simulates an on-chain deposit being credited by the custodian. */
  simulateDeposit?(p: { accountRef: string; network: NetworkCode; amountUsdt: bigint; idempotencyKey: string }): Promise<{ txHash: string }>;
}

// ── Messaging channels ───────────────────────────────────────────────────────
export interface SmsProvider extends ProviderMeta {
  send(toE164: string, text: string): Promise<{ id: string }>;
}

export interface EmailProvider extends ProviderMeta {
  send(msg: { to: string; subject: string; text: string; html?: string }): Promise<{ id: string }>;
}

export interface PushProvider extends ProviderMeta {
  send(tokens: string[], msg: { title: string; body: string; data?: Record<string, string> }): Promise<{ sent: number; invalidTokens: string[] }>;
}

// ── Files ────────────────────────────────────────────────────────────────────
export interface MalwareScanner extends ProviderMeta {
  scan(data: Buffer, fileName: string): Promise<{ clean: boolean; signature: string | null }>;
}

export interface StorageDriver extends ProviderMeta {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const KYC_PROVIDER = Symbol("KYC_PROVIDER");
export const SCREENING_PROVIDER = Symbol("SCREENING_PROVIDER");
export const WALLET_SCREENING_PROVIDER = Symbol("WALLET_SCREENING_PROVIDER");
export const CUSTODY_PROVIDER = Symbol("CUSTODY_PROVIDER");
export const SMS_PROVIDER = Symbol("SMS_PROVIDER");
export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");
export const PUSH_PROVIDER = Symbol("PUSH_PROVIDER");
export const MALWARE_SCANNER = Symbol("MALWARE_SCANNER");
export const STORAGE_DRIVER = Symbol("STORAGE_DRIVER");
