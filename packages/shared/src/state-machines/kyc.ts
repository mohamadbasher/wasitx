import type { AccountStatus, KycStatus } from "../enums";

const KYC_TRANSITIONS: Record<KycStatus, readonly KycStatus[]> = {
  NOT_STARTED: ["PENDING"],
  PENDING: ["IN_REVIEW", "APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"],
  IN_REVIEW: ["APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"],
  RESUBMISSION_REQUIRED: ["PENDING"],
  APPROVED: ["EXPIRED", "REVOKED"],
  REJECTED: [],
  EXPIRED: ["PENDING"],
  REVOKED: [],
};

export const canKycTransition = (from: KycStatus, to: KycStatus) => KYC_TRANSITIONS[from].includes(to);

const ACCOUNT_TRANSITIONS: Record<AccountStatus, readonly AccountStatus[]> = {
  ACTIVE: ["RESTRICTED", "SUSPENDED", "CLOSED"],
  RESTRICTED: ["ACTIVE", "SUSPENDED", "CLOSED"],
  SUSPENDED: ["ACTIVE", "RESTRICTED", "CLOSED"],
  CLOSED: [],
};

export const canAccountTransition = (from: AccountStatus, to: AccountStatus) => ACCOUNT_TRANSITIONS[from].includes(to);

export type VerificationTier = "REGISTERED" | "EMAIL_VERIFIED" | "PHONE_VERIFIED" | "KYC_PENDING" | "VERIFIED_TRADER";

export interface EligibilityInput {
  emailVerified: boolean;
  phoneVerified: boolean;
  kycStatus: KycStatus;
  residencyCountry: string | null;
  isAdult: boolean;
  sanctionsHit: boolean;
  accountStatus: AccountStatus;
}

export type IneligibilityReason =
  | "EMAIL_NOT_VERIFIED"
  | "PHONE_NOT_VERIFIED"
  | "KYC_NOT_APPROVED"
  | "NOT_ISRAELI_RESIDENT"
  | "UNDER_18"
  | "SCREENING_HIT"
  | "ACCOUNT_RESTRICTED";

/** Trading eligibility. Residency comes from verified KYC data — never from IP or phone prefix. */
export function tradingIneligibility(u: EligibilityInput): IneligibilityReason[] {
  const r: IneligibilityReason[] = [];
  if (!u.emailVerified) r.push("EMAIL_NOT_VERIFIED");
  if (!u.phoneVerified) r.push("PHONE_NOT_VERIFIED");
  if (u.kycStatus !== "APPROVED") r.push("KYC_NOT_APPROVED");
  else {
    if (u.residencyCountry !== "IL") r.push("NOT_ISRAELI_RESIDENT");
    if (!u.isAdult) r.push("UNDER_18");
  }
  if (u.sanctionsHit) r.push("SCREENING_HIT");
  if (u.accountStatus !== "ACTIVE") r.push("ACCOUNT_RESTRICTED");
  return r;
}

export function verificationTier(u: Pick<EligibilityInput, "emailVerified" | "phoneVerified" | "kycStatus">): VerificationTier {
  if (u.kycStatus === "APPROVED" && u.emailVerified && u.phoneVerified) return "VERIFIED_TRADER";
  if (["PENDING", "IN_REVIEW", "RESUBMISSION_REQUIRED"].includes(u.kycStatus)) return "KYC_PENDING";
  if (u.phoneVerified && u.emailVerified) return "PHONE_VERIFIED";
  if (u.emailVerified) return "EMAIL_VERIFIED";
  return "REGISTERED";
}

/** Age in whole years on `at` (Asia/Jerusalem calendar date is close enough for a ≥18 check on DOB). */
export function ageOn(dob: Date, at: Date = new Date()): number {
  let age = at.getUTCFullYear() - dob.getUTCFullYear();
  const m = at.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}
