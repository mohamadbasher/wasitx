import { Inject, Injectable } from "@nestjs/common";
import { ageOn, canKycTransition, type KycStartInput, type KycStatus } from "@wasitx/shared";
import type { RequestContext } from "../../common/auth/auth.types.js";
import { CryptoService } from "../../common/crypto.service.js";
import { AppError } from "../../common/errors.js";
import { PrismaService, type Tx } from "../../common/prisma.service.js";
import { isSandbox } from "../../config/env.js";
import { AuditService } from "../audit/audit.service.js";
import { KYC_PROVIDER, SCREENING_PROVIDER, type KycProvider, type KycVerificationResult, type ScreeningProvider } from "../integrations/providers.js";
import { SandboxKycProvider } from "../integrations/sandbox/sandbox-providers.js";
import { OutboxService } from "../outbox/outbox.service.js";

const KYC_VALIDITY_MS = 2 * 365 * 86_400_000; // periodic re-verification (confirm with compliance)

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
    @Inject(SCREENING_PROVIDER) private readonly screening: ScreeningProvider,
  ) {}

  async status(userId: string) {
    const k = await this.prisma.kycProfile.findUniqueOrThrow({ where: { userId } });
    return {
      status: k.status,
      submittedAt: k.submittedAt?.toISOString() ?? null,
      approvedAt: k.approvedAt?.toISOString() ?? null,
      documentVerified: k.documentVerified,
      livenessVerified: k.livenessVerified,
      legalName: k.legalFirstName ? `${k.legalFirstName} ${k.legalLastName}` : null,
      reviewNote: k.status === "RESUBMISSION_REQUIRED" ? k.reviewNote : null,
      sandbox: this.provider.sandbox,
    };
  }

  private async move(tx: Tx, kycId: string, from: KycStatus, to: KycStatus, actor: { type: "USER" | "STAFF" | "SYSTEM"; id?: string | null }, note?: string, data?: object) {
    if (!canKycTransition(from, to)) throw new AppError("INVALID_KYC_TRANSITION", 409, undefined, { from, to });
    await tx.kycEvent.create({ data: { kycId, fromStatus: from, toStatus: to, actorType: actor.type, actorId: actor.id ?? null, note: note ?? null, data } });
  }

  /** Step 1: personal data + Israeli ID → applicant at the KYC provider (document & liveness capture follows). */
  async start(userId: string, input: KycStartInput, ctx: RequestContext) {
    const k = await this.prisma.kycProfile.findUniqueOrThrow({ where: { userId }, include: { user: true } });
    if (!k.user.emailVerifiedAt || !k.user.phoneVerifiedAt) throw new AppError("VERIFY_EMAIL_AND_PHONE_FIRST", 409);
    if (!["NOT_STARTED", "RESUBMISSION_REQUIRED", "EXPIRED"].includes(k.status)) throw new AppError("KYC_ALREADY_SUBMITTED", 409);
    const dob = new Date(`${input.dateOfBirth}T00:00:00Z`);
    if (Number.isNaN(dob.getTime()) || ageOn(dob) < 18) throw new AppError("UNDER_18", 422);

    const idHash = this.crypto.lookupHash(`IL-ID:${input.nationalId.padStart(9, "0")}`);
    const dupe = await this.prisma.kycProfile.findFirst({ where: { nationalIdHash: idHash, NOT: { userId } }, select: { userId: true } });
    if (dupe) {
      await this.prisma.riskFlag.create({ data: { userId, type: "DUPLICATE_IDENTITY", severity: "HIGH", details: { otherUserId: dupe.userId } } });
      throw new AppError("IDENTITY_ALREADY_REGISTERED", 409);
    }

    const applicant = await this.provider.createApplicant({ userId, firstName: input.legalFirstName, lastName: input.legalLastName, dateOfBirth: input.dateOfBirth, nationalId: input.nationalId });
    await this.prisma.tx(async (tx) => {
      await this.move(tx, k.id, k.status, "PENDING", { type: "USER", id: userId }, undefined, { provider: this.provider.name });
      await tx.kycProfile.update({
        where: { id: k.id },
        data: {
          status: "PENDING",
          legalFirstName: input.legalFirstName,
          legalLastName: input.legalLastName,
          nationalIdEnc: this.crypto.encrypt(input.nationalId),
          nationalIdHash: idHash,
          dateOfBirth: dob,
          city: input.city,
          street: input.street,
          houseNumber: input.houseNumber,
          postalCode: input.postalCode,
          occupation: input.occupation,
          expectedVolume: input.expectedMonthlyVolumeIls,
          sourceOfFunds: input.sourceOfFunds,
          selfDeclaredPep: input.isPep,
          provider: this.provider.name,
          providerApplicantId: applicant.applicantId,
          submittedAt: new Date(),
          reviewNote: null,
        },
      });
      await this.audit.record(tx, { actorType: "USER", actorId: userId, action: "kyc.submitted", entityType: "KycProfile", entityId: k.id, ctx });
    });
    return { status: "PENDING" as const, sdkToken: applicant.sdkToken, sandbox: this.provider.sandbox };
  }

  /** Sandbox only: lets demo users pick the provider verdict. */
  async sandboxComplete(userId: string, outcome: "APPROVE" | "REJECT" | "RESUBMIT" | "MANUAL_REVIEW") {
    if (!isSandbox() || !(this.provider instanceof SandboxKycProvider)) throw new AppError("NOT_AVAILABLE", 404);
    const k = await this.prisma.kycProfile.findUniqueOrThrow({ where: { userId } });
    if (k.status !== "PENDING" || !k.providerApplicantId) throw new AppError("KYC_NOT_PENDING", 409);
    const result = this.provider.simulate(k.providerApplicantId, outcome, k.dateOfBirth!.toISOString().slice(0, 10));
    await this.applyProviderResult(result);
    return this.status(userId);
  }

  /** Real providers call this via webhook (after signature verification in the adapter). */
  async handleWebhook(headers: Record<string, string | string[] | undefined>, raw: Buffer) {
    const result = await this.provider.parseWebhook(headers, raw);
    if (!result) throw new AppError("WEBHOOK_SIGNATURE_INVALID", 401);
    await this.applyProviderResult(result);
    return { ok: true };
  }

  /**
   * Turns a provider verdict + sanctions/PEP screening into a KYC decision. Residency must be verified
   * as IL by the provider (never inferred from IP/phone). PEP or screening matches go to manual review.
   */
  private async applyProviderResult(r: KycVerificationResult) {
    const k = await this.prisma.kycProfile.findFirst({ where: { providerApplicantId: r.applicantId } });
    if (!k || k.status !== "PENDING") return;
    const screening = await this.screening.screenPerson({
      firstName: k.legalFirstName!,
      lastName: k.legalLastName!,
      dateOfBirth: k.dateOfBirth!.toISOString().slice(0, 10),
      nationalId: this.crypto.decrypt(k.nationalIdEnc!),
    });
    const verifiedDob = r.verifiedDateOfBirth ? new Date(`${r.verifiedDateOfBirth}T00:00:00Z`) : k.dateOfBirth!;

    let to: KycStatus;
    let note: string | undefined;
    if (screening.sanctionsHit) {
      to = "IN_REVIEW";
      note = "Sanctions screening match — compliance review required";
    } else if (r.answer === "RED") {
      to = "REJECTED";
      note = r.labels.join(", ");
    } else if (r.answer === "RETRY") {
      to = "RESUBMISSION_REQUIRED";
      note = r.labels.join(", ") || "Please resubmit clearer documents";
    } else if (r.residencyCountry !== "IL") {
      to = "REJECTED";
      note = "Residency not verified as Israel";
    } else if (ageOn(verifiedDob) < 18) {
      to = "REJECTED";
      note = "Under 18";
    } else if (r.answer === "MANUAL" || screening.pepHit || k.selfDeclaredPep) {
      to = "IN_REVIEW";
      note = screening.pepHit || k.selfDeclaredPep ? "PEP — enhanced due diligence" : "Provider requested manual review";
    } else {
      to = "APPROVED";
    }

    const riskLevel = screening.sanctionsHit || screening.pepHit || k.selfDeclaredPep ? "HIGH" : k.expectedVolume === "OVER_200K" || k.expectedVolume === "50K_200K" ? "MEDIUM" : "LOW";
    await this.prisma.tx(async (tx) => {
      await this.move(tx, k.id, "PENDING", to, { type: "SYSTEM" }, note, { answer: r.answer, labels: r.labels, screening });
      await tx.kycProfile.update({
        where: { id: k.id },
        data: {
          status: to,
          documentVerified: r.documentVerified,
          livenessVerified: r.livenessVerified,
          residencyCountry: r.residencyCountry,
          dateOfBirth: verifiedDob,
          sanctionsHit: screening.sanctionsHit,
          pepHit: screening.pepHit,
          riskLevel,
          screenedAt: new Date(),
          reviewNote: note ?? null,
          ...(to === "APPROVED" ? { approvedAt: new Date(), expiresAt: new Date(Date.now() + KYC_VALIDITY_MS) } : {}),
        },
      });
      if (to === "IN_REVIEW") {
        await tx.complianceCase.create({
          data: {
            type: screening.sanctionsHit ? "SANCTIONS_MATCH" : "KYC_REVIEW",
            priority: screening.sanctionsHit ? "CRITICAL" : "HIGH",
            userId: k.userId,
            summary: note ?? "KYC manual review",
          },
        });
      }
      if (screening.sanctionsHit) {
        await tx.user.update({ where: { id: k.userId }, data: { status: "RESTRICTED", statusReason: "Sanctions screening match pending review" } });
      }
      await this.audit.record(tx, { actorType: "SYSTEM", action: `kyc.${to.toLowerCase()}`, entityType: "KycProfile", entityId: k.id, data: { riskLevel } });
      if (to === "APPROVED") await this.outbox.notify(tx, k.userId, "KYC_APPROVED", {}, "/dashboard");
      if (to === "REJECTED") await this.outbox.notify(tx, k.userId, "KYC_REJECTED", {}, "/kyc");
      if (to === "RESUBMISSION_REQUIRED") await this.outbox.notify(tx, k.userId, "KYC_RESUBMISSION", {}, "/kyc");
    });
    this.outbox.kick();
  }

  /** Compliance officer decision on an IN_REVIEW profile. */
  async decide(staffId: string, kycId: string, decision: "APPROVED" | "REJECTED" | "RESUBMISSION_REQUIRED", note: string, ctx: RequestContext) {
    const k = await this.prisma.kycProfile.findUnique({ where: { id: kycId } });
    if (!k) throw new AppError("KYC_NOT_FOUND", 404);
    if (decision === "APPROVED" && (k.residencyCountry !== "IL" || !k.documentVerified)) throw new AppError("KYC_PREREQUISITES_MISSING", 409);
    await this.prisma.tx(async (tx) => {
      await this.move(tx, k.id, k.status, decision, { type: "STAFF", id: staffId }, note);
      await tx.kycProfile.update({
        where: { id: k.id },
        data: {
          status: decision,
          reviewNote: note,
          reviewedById: staffId,
          ...(decision === "APPROVED" ? { approvedAt: new Date(), expiresAt: new Date(Date.now() + KYC_VALIDITY_MS) } : {}),
        },
      });
      await tx.complianceCase.updateMany({
        where: { userId: k.userId, type: { in: ["KYC_REVIEW", "SANCTIONS_MATCH"] }, status: { in: ["OPEN", "IN_PROGRESS", "ESCALATED"] } },
        data: { status: decision === "REJECTED" && k.sanctionsHit ? "CLOSED_REPORTED" : "CLOSED_NO_ACTION", closedAt: new Date(), assignedToId: staffId },
      });
      await this.audit.record(tx, { actorType: "STAFF", actorId: staffId, action: `kyc.decision.${decision.toLowerCase()}`, entityType: "KycProfile", entityId: k.id, data: { note }, ctx });
      const type = decision === "APPROVED" ? "KYC_APPROVED" : decision === "REJECTED" ? "KYC_REJECTED" : "KYC_RESUBMISSION";
      await this.outbox.notify(tx, k.userId, type, {}, decision === "APPROVED" ? "/dashboard" : "/kyc");
    });
    this.outbox.kick();
    return { ok: true };
  }
}
