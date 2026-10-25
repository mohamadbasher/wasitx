import { z } from "zod";
import {
  DISPUTE_OUTCOMES,
  DISPUTE_REASONS,
  KYC_STATUSES,
  LOCALES,
  NETWORK_CODES,
  OFFER_SIDES,
  PAYMENT_METHOD_CODES,
  ROLES,
  ACCOUNT_STATUSES,
  PRODUCTION_GATES,
} from "./enums";
import { FEE_PAYERS } from "./fees";
import { ILS_DECIMALS, PRICE_DECIMALS, USDT_DECIMALS, parseIls } from "./money";
import { isValidIsraeliId, normalizeIsraeliMobile } from "./validation/israel";

// ── primitives ────────────────────────────────────────────────────────────────
const decimal = (decimals: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{1,12}(\\.\\d{1,${decimals}})?$`), { message: "invalid_amount" })
    .refine((s) => !/^0+(\.0+)?$/.test(s), { message: "amount_must_be_positive" });

export const usdtAmount = decimal(USDT_DECIMALS);
export const ilsAmount = decimal(ILS_DECIMALS);
export const priceIls = decimal(PRICE_DECIMALS);
export const id = z.string().min(10).max(40);
export const email = z.string().trim().toLowerCase().email({ message: "invalid_email" }).max(254);
export const locale = z.enum(LOCALES);

/** OWASP ASVS 2.1: ≥ 12 chars, no composition rules forced beyond requiring non-trivial content. */
export const password = z
  .string()
  .min(12, { message: "password_too_short" })
  .max(128, { message: "password_too_long" })
  .refine((p) => new Set(p).size >= 6, { message: "password_too_simple" });

export const israeliMobile = z
  .string()
  .transform((v, ctx) => {
    const n = normalizeIsraeliMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "invalid_il_mobile" });
      return z.NEVER;
    }
    return n;
  });

export const otpCode = z.string().regex(/^\d{6}$/, { message: "invalid_code" });

// ── auth ─────────────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(2).max(40),
  locale: locale.default("ar"),
  acceptTerms: z.literal(true, { message: "terms_required" }),
  confirmAge: z.literal(true, { message: "age_required" }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  totp: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().max(20).optional(),
  deviceName: z.string().max(80).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const phoneStartSchema = z.object({ phone: israeliMobile });
export const phoneVerifySchema = z.object({ phone: israeliMobile, code: otpCode });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
export const mfaCodeSchema = z.object({ code: otpCode });
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(400).optional() });

// ── profile & kyc ────────────────────────────────────────────────────────────
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  locale: locale.optional(),
  marketingOptIn: z.boolean().optional(),
});

export const kycStartSchema = z.object({
  legalFirstName: z.string().trim().min(1).max(60),
  legalLastName: z.string().trim().min(1).max(60),
  nationalId: z.string().trim().refine(isValidIsraeliId, { message: "invalid_israeli_id" }),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  city: z.string().trim().min(2).max(60),
  street: z.string().trim().min(2).max(80),
  houseNumber: z.string().trim().min(1).max(10),
  postalCode: z.string().trim().regex(/^\d{7}$/, { message: "invalid_postal_code" }),
  occupation: z.string().trim().min(2).max(80),
  expectedMonthlyVolumeIls: z.enum(["UP_TO_10K", "10K_50K", "50K_200K", "OVER_200K"]),
  sourceOfFunds: z.enum(["SALARY", "BUSINESS", "SAVINGS", "INVESTMENTS", "INHERITANCE", "OTHER"]),
  isPep: z.boolean(),
});
export type KycStartInput = z.infer<typeof kycStartSchema>;

/** Sandbox-only: simulates the provider's verdict so demos can exercise every branch. */
export const kycSandboxCompleteSchema = z.object({
  outcome: z.enum(["APPROVE", "REJECT", "RESUBMIT", "MANUAL_REVIEW"]),
});

export const bankAccountSchema = z.object({
  bankCode: z.string().regex(/^\d{1,3}$/),
  branchNumber: z.string().regex(/^\d{1,3}$/),
  accountNumber: z.string().regex(/^\d{4,13}$/),
  holderName: z.string().trim().min(3).max(100),
});

// ── offers ───────────────────────────────────────────────────────────────────
export const createOfferSchema = z
  .object({
    side: z.enum(OFFER_SIDES),
    amountUsdt: usdtAmount,
    priceIls,
    minOrderIls: ilsAmount,
    maxOrderIls: ilsAmount,
    paymentMethod: z.enum(PAYMENT_METHOD_CODES),
    bankAccountId: id.optional(),
    expiresInHours: z.number().int().min(1).max(720),
    terms: z.string().trim().max(500).optional(),
  })
  .refine((o) => parseIls(o.minOrderIls) <= parseIls(o.maxOrderIls), { message: "min_exceeds_max", path: ["minOrderIls"] })
  .refine((o) => o.side === "BUY" || !!o.bankAccountId, { message: "bank_account_required", path: ["bankAccountId"] });
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const updateOfferSchema = z.object({
  priceIls: priceIls.optional(),
  amountUsdt: usdtAmount.optional(),
  minOrderIls: ilsAmount.optional(),
  maxOrderIls: ilsAmount.optional(),
  bankAccountId: id.optional(),
  expiresInHours: z.number().int().min(1).max(720).optional(),
  terms: z.string().trim().max(500).optional(),
  version: z.number().int().nonnegative(),
});
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;

export const OFFER_SORTS = ["price", "amount", "completion", "newest"] as const;
export const listOffersSchema = z.object({
  side: z.enum(OFFER_SIDES).default("SELL"),
  paymentMethod: z.enum(PAYMENT_METHOD_CODES).optional(),
  amountIls: ilsAmount.optional(),
  sort: z.enum(OFFER_SORTS).default("price"),
  verifiedOnly: z.coerce.boolean().optional(),
  favoritesOnly: z.coerce.boolean().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListOffersQuery = z.infer<typeof listOffersSchema>;

// ── trades ───────────────────────────────────────────────────────────────────
export const takeOfferSchema = z.object({
  offerId: id,
  amountUsdt: usdtAmount,
  /** Price & version the user saw — the trade is rejected if the offer changed (stale-price guard). */
  quotedPriceIls: priceIls,
  quotedVersion: z.number().int().nonnegative(),
  /** Required when taking a BUY offer: the taker is the seller and receives shekels here. */
  bankAccountId: id.optional(),
  acceptFees: z.literal(true, { message: "fees_must_be_accepted" }),
});
export type TakeOfferInput = z.infer<typeof takeOfferSchema>;

export const markPaidSchema = z.object({
  paidFromOwnAccount: z.literal(true, { message: "must_pay_from_own_account" }),
  note: z.string().trim().max(500).optional(),
  evidenceFileIds: z.array(id).max(5).optional(),
});

export const confirmReceiptSchema = z.object({
  receivedFullAmount: z.literal(true, { message: "confirm_full_amount" }),
  senderNameMatches: z.literal(true, { message: "confirm_sender_name" }),
});

export const cancelTradeSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const rateTradeSchema = z.object({
  positive: z.boolean(),
  comment: z.string().trim().max(300).optional(),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().max(2000).default(""),
  attachmentIds: z.array(id).max(3).optional(),
}).refine((m) => m.body.length > 0 || (m.attachmentIds?.length ?? 0) > 0, { message: "empty_message" });

export const reportMessageSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const openDisputeSchema = z.object({
  reason: z.enum(DISPUTE_REASONS),
  description: z.string().trim().min(20, { message: "description_too_short" }).max(2000),
  evidenceFileIds: z.array(id).max(10).optional(),
});

export const disputeMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  evidenceFileIds: z.array(id).max(10).optional(),
});

// ── wallet (sandbox) ─────────────────────────────────────────────────────────
export const sandboxDepositSchema = z.object({ network: z.enum(NETWORK_CODES), amountUsdt: usdtAmount });
export const withdrawalSchema = z.object({
  network: z.enum(NETWORK_CODES),
  address: z.string().trim().min(26).max(64),
  amountUsdt: usdtAmount,
  mfaCode: otpCode,
});

// ── support & notifications ──────────────────────────────────────────────────
export const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(4000),
  tradeId: id.optional(),
  category: z.enum(["ACCOUNT", "KYC", "TRADE", "PAYMENT", "SECURITY", "OTHER"]),
});
export const ticketMessageSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const notificationPrefsSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
  sms: z.boolean(),
  marketing: z.boolean(),
});
export const pushTokenSchema = z.object({ token: z.string().min(10).max(300), platform: z.enum(["ios", "android", "web"]) });

// ── admin ────────────────────────────────────────────────────────────────────
export const kycDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"]),
  note: z.string().trim().min(3).max(1000),
});
export const userStatusSchema = z.object({ status: z.enum(ACCOUNT_STATUSES), reason: z.string().trim().min(3).max(500) });
export const userRolesSchema = z.object({ roles: z.array(z.enum(ROLES)).min(1) });
export const freezeTradeSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const complianceApproveSchema = z.object({ note: z.string().trim().min(3).max(500) });
export const resolveDisputeSchema = z.object({
  outcome: z.enum(DISPUTE_OUTCOMES),
  findings: z.string().trim().min(10).max(4000),
});
export const requestInfoSchema = z.object({ party: z.enum(["BUYER", "SELLER", "BOTH"]), message: z.string().trim().min(5).max(2000) });
export const approvalDecisionSchema = z.object({ note: z.string().trim().max(1000).optional() });
export const commissionConfigSchema = z.object({
  rateBps: z.number().int().min(0).max(1000),
  minUsdt: usdtAmount.or(z.literal("0")),
  maxUsdt: usdtAmount,
  payer: z.enum(FEE_PAYERS),
  note: z.string().trim().min(3).max(500),
});
export const riskRulesSchema = z.object({
  maxTradeIls: ilsAmount,
  dailyLimitIls: ilsAmount,
  monthlyLimitIls: ilsAmount,
  reviewThresholdIls: ilsAmount,
  dualApprovalThresholdUsdt: usdtAmount,
  paymentWindowMinutes: z.number().int().min(10).max(180),
  newAccountDays: z.number().int().min(0).max(90),
  newAccountMaxTradeIls: ilsAmount,
});
export type RiskRules = z.infer<typeof riskRulesSchema>;
export const toggleSchema = z.object({ enabled: z.boolean(), note: z.string().trim().min(3).max(500) });
export const gateSchema = z.object({ gate: z.enum(PRODUCTION_GATES), value: z.boolean(), evidence: z.string().trim().min(5).max(1000) });
export const announcementSchema = z.object({
  title: z.object({ ar: z.string().min(1).max(120), he: z.string().min(1).max(120), en: z.string().min(1).max(120) }),
  body: z.object({ ar: z.string().min(1).max(2000), he: z.string().min(1).max(2000), en: z.string().min(1).max(2000) }),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]),
  publish: z.boolean(),
});
export const adminListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().max(40).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const kycStatusFilter = z.enum(KYC_STATUSES);
