// Mirrors the Prisma enums in apps/api/prisma/schema.prisma. Keep the two in sync
// (apps/api/test/enums-sync.spec.ts fails if they drift).

export const LOCALES = ["ar", "he", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const RTL_LOCALES: readonly Locale[] = ["ar", "he"];
export const isRtl = (l: string) => (RTL_LOCALES as readonly string[]).includes(l);
export const TIME_ZONE = "Asia/Jerusalem";

export const ROLES = [
  "USER",
  "SUPPORT_AGENT",
  "COMPLIANCE_OFFICER",
  "DISPUTE_MANAGER",
  "ADMIN",
  "SUPER_ADMIN",
] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: readonly Role[] = ROLES.filter((r) => r !== "USER");

export const ACCOUNT_STATUSES = ["ACTIVE", "RESTRICTED", "SUSPENDED", "CLOSED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const KYC_STATUSES = [
  "NOT_STARTED",
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "RESUBMISSION_REQUIRED",
  "EXPIRED",
  "REVOKED",
] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const OFFER_SIDES = ["BUY", "SELL"] as const;
export type OfferSide = (typeof OFFER_SIDES)[number];

export const OFFER_STATUSES = ["ACTIVE", "PAUSED", "EXHAUSTED", "CANCELLED", "EXPIRED", "SUSPENDED"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const TRADE_STATUSES = [
  "OFFER_ACCEPTED",
  "COMPLIANCE_REVIEW",
  "ESCROW_PENDING",
  "ESCROW_CONFIRMED",
  "AWAITING_FIAT_PAYMENT",
  "BUYER_MARKED_PAID",
  "SELLER_CONFIRMED_RECEIPT",
  "RELEASE_PENDING",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "DISPUTED",
  "FROZEN",
] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const DISPUTE_STATUSES = ["OPEN", "AWAITING_INFO", "UNDER_REVIEW", "ESCALATED", "RESOLVED"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_REASONS = [
  "PAYMENT_NOT_RECEIVED",
  "PAID_BUT_NOT_CONFIRMED",
  "WRONG_AMOUNT",
  "PAYMENT_FROM_THIRD_PARTY",
  "SUSPECTED_FRAUD",
  "OTHER",
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_OUTCOMES = ["RELEASE_TO_BUYER", "REFUND_TO_SELLER"] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

export const PAYMENT_METHOD_CODES = ["IL_BANK_TRANSFER", "IL_INSTANT_TRANSFER", "BIT", "PAYBOX"] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[number];

export const NETWORK_CODES = ["TRON_TRC20", "ETHEREUM_ERC20"] as const;
export type NetworkCode = (typeof NETWORK_CODES)[number];

export const NOTIFICATION_TYPES = [
  "KYC_APPROVED",
  "KYC_REJECTED",
  "KYC_RESUBMISSION",
  "TRADE_STARTED",
  "TRADE_ESCROW_LOCKED",
  "TRADE_MARKED_PAID",
  "TRADE_PAYMENT_DEADLINE",
  "TRADE_RECEIPT_CONFIRMED",
  "TRADE_COMPLETED",
  "TRADE_CANCELLED",
  "TRADE_EXPIRED",
  "TRADE_DISPUTED",
  "TRADE_FROZEN",
  "DISPUTE_UPDATE",
  "DISPUTE_RESOLVED",
  "NEW_MESSAGE",
  "SUPPORT_REPLY",
  "SECURITY_NEW_LOGIN",
  "SECURITY_PASSWORD_CHANGED",
  "SECURITY_MFA_CHANGED",
  "SECURITY_SESSION_REVOKED",
  "WITHDRAWAL_UPDATE",
  "ANNOUNCEMENT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const TRADING_MODES = ["SANDBOX", "PRODUCTION"] as const;
export type TradingMode = (typeof TRADING_MODES)[number];

export const PRODUCTION_GATES = [
  "gate.licence.confirmed",
  "gate.aml.program.approved",
  "gate.custody.contract.signed",
  "gate.kyc.provider.contracted",
  "gate.banking.confirmed",
  "gate.privacy.dpo.appointed",
  "gate.terms.published",
  "gate.pentest.passed",
] as const;
export type ProductionGate = (typeof PRODUCTION_GATES)[number];
