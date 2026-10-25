import { Logger } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { NetworkCode } from "@wasitx/shared";
import type {
  EmailProvider,
  KycApplicantInput,
  KycProvider,
  KycVerificationResult,
  MalwareScanner,
  PushProvider,
  ScreeningProvider,
  ScreeningResultData,
  SmsProvider,
  WalletScreeningProvider,
} from "../providers.js";
import { assertSandboxAllowed, DevOutbox } from "./sandbox-guard.js";

const log = new Logger("Sandbox");

/**
 * ⚠ SANDBOX KYC. No document or liveness check happens. Applicants are created locally and their
 * verdict is chosen by the user through POST /kyc/sandbox/complete to exercise every branch.
 */
export class SandboxKycProvider implements KycProvider {
  readonly name = "sandbox-kyc";
  readonly sandbox = true;

  async createApplicant(input: KycApplicantInput) {
    assertSandboxAllowed(this.name);
    return { applicantId: `sbx_app_${input.userId}_${randomBytes(4).toString("hex")}`, sdkToken: null };
  }

  async parseWebhook(): Promise<KycVerificationResult | null> {
    assertSandboxAllowed(this.name);
    return null; // sandbox results arrive via simulate(), not webhooks
  }

  simulate(applicantId: string, outcome: "APPROVE" | "REJECT" | "RESUBMIT" | "MANUAL_REVIEW", dob: string): KycVerificationResult {
    assertSandboxAllowed(this.name);
    const green = outcome === "APPROVE" || outcome === "MANUAL_REVIEW";
    return {
      applicantId,
      documentVerified: green,
      livenessVerified: green,
      residencyCountry: green ? "IL" : null,
      verifiedDateOfBirth: dob,
      answer: outcome === "APPROVE" ? "GREEN" : outcome === "REJECT" ? "RED" : outcome === "RESUBMIT" ? "RETRY" : "MANUAL",
      labels: outcome === "REJECT" ? ["DOCUMENT_FORGERY_SUSPECTED"] : outcome === "RESUBMIT" ? ["BLURRY_DOCUMENT"] : [],
    };
  }
}

/** ⚠ SANDBOX screening: names containing "sanction"/"סנקציה"/"عقوبة" hit sanctions; "pep" hits PEP. */
export class SandboxScreeningProvider implements ScreeningProvider {
  readonly name = "sandbox-screening";
  readonly sandbox = true;

  async screenPerson(input: { firstName: string; lastName: string }): Promise<ScreeningResultData> {
    assertSandboxAllowed(this.name);
    const full = `${input.firstName} ${input.lastName}`.toLowerCase();
    const sanctionsHit = /sanction|סנקציה|عقوبة/.test(full);
    const pepHit = /\bpep\b/.test(full);
    return {
      sanctionsHit,
      pepHit,
      matches: [
        ...(sanctionsHit ? [{ list: "SANDBOX-SANCTIONS", name: full, score: 0.97 }] : []),
        ...(pepHit ? [{ list: "SANDBOX-PEP", name: full, score: 0.9 }] : []),
      ],
    };
  }
}

/** ⚠ SANDBOX wallet screening: deterministic pseudo-risk from the address hash (~5% REVIEW), plus a block list. */
export class SandboxWalletScreeningProvider implements WalletScreeningProvider {
  readonly name = "sandbox-wallet-screening";
  readonly sandbox = true;
  static readonly BLOCKED = new Set(["TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy", "0x000000000000000000000000000000000000dEaD"]);

  async screenAddress(network: NetworkCode, address: string) {
    assertSandboxAllowed(this.name);
    if (SandboxWalletScreeningProvider.BLOCKED.has(address)) {
      return { result: "BLOCK" as const, riskScore: 100, category: "SANDBOX_SANCTIONED_ENTITY", raw: { network } };
    }
    const b = createHash("sha256").update(address).digest()[0]!;
    if (b < 13) return { result: "REVIEW" as const, riskScore: 60, category: "SANDBOX_MIXER_EXPOSURE", raw: { network } };
    return { result: "CLEAR" as const, riskScore: b % 20, category: null, raw: { network } };
  }
}

export class SandboxSmsProvider implements SmsProvider {
  readonly name = "sandbox-sms";
  readonly sandbox = true;
  async send(to: string, text: string) {
    assertSandboxAllowed(this.name);
    DevOutbox.push({ channel: "sms", to, body: text });
    log.log(`[SMS → ${to}] ${text}`);
    return { id: `sbx_sms_${randomBytes(4).toString("hex")}` };
  }
}

export class SandboxEmailProvider implements EmailProvider {
  readonly name = "sandbox-email";
  readonly sandbox = true;
  async send(msg: { to: string; subject: string; text: string }) {
    assertSandboxAllowed(this.name);
    DevOutbox.push({ channel: "email", to: msg.to, subject: msg.subject, body: msg.text });
    log.log(`[EMAIL → ${msg.to}] ${msg.subject}`);
    return { id: `sbx_mail_${randomBytes(4).toString("hex")}` };
  }
}

export class SandboxPushProvider implements PushProvider {
  readonly name = "sandbox-push";
  readonly sandbox = true;
  async send(tokens: string[], msg: { title: string; body: string }) {
    assertSandboxAllowed(this.name);
    for (const t of tokens) DevOutbox.push({ channel: "push", to: t, subject: msg.title, body: msg.body });
    return { sent: tokens.length, invalidTokens: [] };
  }
}

/** ⚠ SANDBOX malware scan: detects only the standard EICAR test signature. Production: ClamAV or a vendor API. */
export class SandboxMalwareScanner implements MalwareScanner {
  readonly name = "sandbox-malware";
  readonly sandbox = true;
  async scan(data: Buffer) {
    assertSandboxAllowed(this.name);
    const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    const infected = data.includes(Buffer.from(eicar));
    return { clean: !infected, signature: infected ? "EICAR-Test-File" : null };
  }
}
