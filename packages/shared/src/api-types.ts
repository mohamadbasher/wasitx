// Response shapes returned by the API. Amounts are decimal strings (never JS numbers).
import type {
  AccountStatus,
  DisputeOutcome,
  DisputeReason,
  DisputeStatus,
  KycStatus,
  Locale,
  NetworkCode,
  NotificationType,
  OfferSide,
  OfferStatus,
  PaymentMethodCode,
  Role,
  TradeStatus,
  TradingMode,
} from "./enums";
import type { FeePayer } from "./fees";
import type { Permission } from "./permissions";
import type { IneligibilityReason, VerificationTier } from "./state-machines/kyc";
import type { TradeAction } from "./state-machines/trade";

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface MeDto {
  id: string;
  email: string;
  emailVerified: boolean;
  phoneMasked: string | null;
  phoneVerified: boolean;
  displayName: string;
  locale: Locale;
  roles: Role[];
  permissions: Permission[];
  tier: VerificationTier;
  kycStatus: KycStatus;
  accountStatus: AccountStatus;
  mfaEnabled: boolean;
  ineligibility: IneligibilityReason[];
  createdAt: string;
}

export interface TraderSummary {
  id: string;
  displayName: string;
  verified: boolean;
  completedTrades: number;
  /** Percentage string with one decimal, e.g. "98.5"; null when no finished trades yet. */
  completionRate: string | null;
  positiveRate: string | null;
  avgReleaseMinutes: number | null;
  memberSince: string;
}

export interface OfferDto {
  id: string;
  side: OfferSide;
  status: OfferStatus;
  owner: TraderSummary;
  amountUsdt: string;
  remainingUsdt: string;
  priceIls: string;
  minOrderIls: string;
  /** Effective max = min(configured max, remaining × price). */
  maxOrderIls: string;
  paymentMethod: PaymentMethodCode;
  expiresAt: string;
  terms: string | null;
  version: number;
  isMine: boolean;
  createdAt: string;
}

export interface FeeDto {
  rateBps: number;
  payer: FeePayer;
  feeUsdt: string;
  buyerFeeUsdt: string;
  sellerFeeUsdt: string;
}

export interface QuoteDto {
  amountUsdt: string;
  priceIls: string;
  fiatAmountIls: string;
  fee: FeeDto;
  buyerReceivesUsdt: string;
  sellerLocksUsdt: string;
}

export interface PaymentInstructionsDto {
  bankCode: string;
  bankName: string;
  branchNumber: string;
  accountNumber: string;
  holderName: string;
  reference: string;
  amountIls: string;
  deadline: string;
}

export interface TradeEventDto {
  id: string;
  fromStatus: TradeStatus | null;
  toStatus: TradeStatus;
  action: string;
  actorRole: string;
  note: string | null;
  createdAt: string;
}

export interface TradeDto {
  id: string;
  reference: string;
  status: TradeStatus;
  myRole: "buyer" | "seller" | "staff";
  offerId: string;
  offerSide: OfferSide;
  buyer: TraderSummary;
  seller: TraderSummary;
  amountUsdt: string;
  priceIls: string;
  fiatAmountIls: string;
  fee: FeeDto;
  buyerReceivesUsdt: string;
  sellerLocksUsdt: string;
  paymentMethod: PaymentMethodCode;
  paymentDeadline: string | null;
  paymentInstructions: PaymentInstructionsDto | null;
  markedPaidAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  frozenFrom: TradeStatus | null;
  disputeId: string | null;
  availableActions: TradeAction[];
  canOpenDispute: boolean;
  myRating: boolean | null;
  unreadMessages: number;
  sandbox: boolean;
  createdAt: string;
  events?: TradeEventDto[];
}

export interface MessageDto {
  id: string;
  tradeId: string;
  senderId: string | null;
  senderRole: "buyer" | "seller" | "staff" | "system";
  senderName: string;
  body: string;
  riskSignals: string[];
  attachments: { id: string; fileName: string; mimeType: string; size: number }[];
  readByCounterparty: boolean;
  createdAt: string;
}

export interface DisputeDto {
  id: string;
  tradeId: string;
  tradeReference: string;
  status: DisputeStatus;
  reason: DisputeReason;
  description: string;
  openedByRole: "buyer" | "seller";
  outcome: DisputeOutcome | null;
  findings: string | null;
  createdAt: string;
  resolvedAt: string | null;
  messages: { id: string; authorRole: string; body: string; createdAt: string; evidence: { id: string; fileName: string }[] }[];
}

export interface BalanceDto {
  source: "SANDBOX_CUSTODY" | "CUSTODIAN";
  sourceLabel: string;
  available: string;
  reservedInOffers: string;
  inEscrow: string;
  pendingWithdrawal: string;
  custodianBalance: string;
  reconciled: boolean;
  asOf: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface PublicConfigDto {
  brandName: string;
  tradingMode: TradingMode;
  fee: { rateBps: number; minUsdt: string; maxUsdt: string; payer: FeePayer };
  paymentMethods: { code: PaymentMethodCode; enabled: boolean }[];
  networks: { code: NetworkCode; enabled: boolean; label: string; tokenContract: string | null; minConfirmations: number }[];
  limits: { maxTradeIls: string; dailyLimitIls: string; monthlyLimitIls: string; paymentWindowMinutes: number };
  announcements: { id: string; severity: string; title: Record<Locale, string>; body: Record<Locale, string> }[];
}

export interface MarketStatsDto {
  bestBuyPriceIls: string | null;
  bestSellPriceIls: string | null;
  activeOffers: number;
  volume24hUsdt: string;
  trades24h: number;
  medianCompletionMinutes: number | null;
}
