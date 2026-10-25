-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ar', 'he', 'en');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'SUPPORT_AGENT', 'COMPLIANCE_OFFICER', 'DISPUTE_MANAGER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'RESTRICTED', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "OfferSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXHAUSTED', 'CANCELLED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('OFFER_ACCEPTED', 'COMPLIANCE_REVIEW', 'ESCROW_PENDING', 'ESCROW_CONFIRMED', 'AWAITING_FIAT_PAYMENT', 'BUYER_MARKED_PAID', 'SELLER_CONFIRMED_RECEIPT', 'RELEASE_PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'DISPUTED', 'FROZEN');

-- CreateEnum
CREATE TYPE "PaymentMethodCode" AS ENUM ('IL_BANK_TRANSFER', 'IL_INSTANT_TRANSFER', 'BIT', 'PAYBOX');

-- CreateEnum
CREATE TYPE "NetworkCode" AS ENUM ('TRON_TRC20', 'ETHEREUM_ERC20');

-- CreateEnum
CREATE TYPE "FeePayer" AS ENUM ('BUYER', 'SELLER', 'SPLIT');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('EMAIL_VERIFY', 'PASSWORD_RESET', 'PHONE_OTP');

-- CreateEnum
CREATE TYPE "BankAccountStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "LedgerAccountKind" AS ENUM ('USER_AVAILABLE', 'USER_OFFER_RESERVED', 'USER_ESCROW', 'USER_WITHDRAWAL_PENDING', 'PLATFORM_FEE_REVENUE', 'PLATFORM_CUSTODY_OMNIBUS');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('DEPOSIT', 'OFFER_RESERVE', 'OFFER_UNRESERVE', 'ESCROW_LOCK', 'ESCROW_CANCEL', 'TRADE_SETTLE', 'WITHDRAWAL_REQUEST', 'WITHDRAWAL_COMPLETE', 'WITHDRAWAL_CANCEL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "EscrowOpType" AS ENUM ('HOLD', 'RELEASE', 'CANCEL_HOLD');

-- CreateEnum
CREATE TYPE "EscrowOpStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('AWAITING', 'MARKED_SENT', 'CONFIRMED_BY_SELLER', 'RECONCILED', 'DISPUTED', 'REVERSED', 'VOID');

-- CreateEnum
CREATE TYPE "SettlementBasis" AS ENUM ('POLICY_AUTO', 'RECONCILIATION', 'COMPLIANCE', 'DISPUTE');

-- CreateEnum
CREATE TYPE "MessageSenderRole" AS ENUM ('BUYER', 'SELLER', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('CHAT_ATTACHMENT', 'PAYMENT_EVIDENCE', 'DISPUTE_EVIDENCE', 'KYC_DOCUMENT');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'AWAITING_INFO', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeReason" AS ENUM ('PAYMENT_NOT_RECEIVED', 'PAID_BUT_NOT_CONFIRMED', 'WRONG_AMOUNT', 'PAYMENT_FROM_THIRD_PARTY', 'SUSPECTED_FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeOutcome" AS ENUM ('RELEASE_TO_BUYER', 'REFUND_TO_SELLER');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('DISPUTE_RESOLUTION', 'FROZEN_TRADE_CANCEL', 'WITHDRAWAL', 'ROLE_GRANT_PRIVILEGED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('KYC_REVIEW', 'SANCTIONS_MATCH', 'SUSPICIOUS_ACTIVITY', 'TRANSACTION_REVIEW', 'SOURCE_OF_FUNDS', 'CHAT_FLAG', 'WALLET_RISK');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ESCALATED', 'CLOSED_NO_ACTION', 'CLOSED_REPORTED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ScreeningResult" AS ENUM ('CLEAR', 'REVIEW', 'BLOCK');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING_SCREENING', 'PENDING_APPROVAL', 'APPROVED', 'BROADCAST', 'CONFIRMED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('DETECTED', 'CONFIRMING', 'CREDITED', 'QUARANTINED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('KYC_APPROVED', 'KYC_REJECTED', 'KYC_RESUBMISSION', 'TRADE_STARTED', 'TRADE_ESCROW_LOCKED', 'TRADE_MARKED_PAID', 'TRADE_PAYMENT_DEADLINE', 'TRADE_RECEIPT_CONFIRMED', 'TRADE_COMPLETED', 'TRADE_CANCELLED', 'TRADE_EXPIRED', 'TRADE_DISPUTED', 'TRADE_FROZEN', 'DISPUTE_UPDATE', 'DISPUTE_RESOLVED', 'NEW_MESSAGE', 'SUPPORT_REPLY', 'SECURITY_NEW_LOGIN', 'SECURITY_PASSWORD_CHANGED', 'SECURITY_MFA_CHANGED', 'SECURITY_SESSION_REVOKED', 'WITHDRAWAL_UPDATE', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'AWAITING_SUPPORT', 'AWAITING_USER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('ACCOUNT', 'KYC', 'TRADE', 'PAYMENT', 'SECURITY', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "phoneE164" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "mfaSecretEnc" TEXT,
    "mfaEnabledAt" TIMESTAMP(3),
    "recoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "notifySms" BOOLEAN NOT NULL DEFAULT true,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "deletionRequestedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "name" TEXT,
    "platform" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastIp" TEXT,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "newDevice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "target" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "legalFirstName" TEXT,
    "legalLastName" TEXT,
    "nationalIdEnc" TEXT,
    "nationalIdHash" TEXT,
    "dateOfBirth" DATE,
    "residencyCountry" TEXT,
    "city" TEXT,
    "street" TEXT,
    "houseNumber" TEXT,
    "postalCode" TEXT,
    "occupation" TEXT,
    "expectedVolume" TEXT,
    "sourceOfFunds" TEXT,
    "selfDeclaredPep" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "providerApplicantId" TEXT,
    "documentVerified" BOOLEAN NOT NULL DEFAULT false,
    "livenessVerified" BOOLEAN NOT NULL DEFAULT false,
    "sanctionsHit" BOOLEAN NOT NULL DEFAULT false,
    "pepHit" BOOLEAN NOT NULL DEFAULT false,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "screenedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycEvent" (
    "id" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "fromStatus" "KycStatus",
    "toStatus" "KycStatus" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "tradeId" TEXT,
    "type" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "details" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCase" (
    "id" TEXT NOT NULL,
    "type" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "userId" TEXT,
    "tradeId" TEXT,
    "summary" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ComplianceCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCaseNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletScreening" (
    "id" TEXT NOT NULL,
    "network" "NetworkCode" NOT NULL,
    "address" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "result" "ScreeningResult" NOT NULL,
    "riskScore" INTEGER,
    "riskCategory" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletScreening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "branchNumber" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountLast4" TEXT NOT NULL,
    "accountHash" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "nameMatchesKyc" BOOLEAN NOT NULL DEFAULT false,
    "status" "BankAccountStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodConfig" (
    "code" "PaymentMethodCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodConfig_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "NetworkConfig" (
    "code" "NetworkCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "tokenContract" TEXT,
    "minConfirmations" INTEGER NOT NULL DEFAULT 20,
    "withdrawalFeeUsdt" BIGINT NOT NULL DEFAULT 0,
    "minWithdrawalUsdt" BIGINT NOT NULL DEFAULT 10000000,
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkConfig_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "DepositAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "network" "NetworkCode" NOT NULL,
    "address" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "network" "NetworkCode" NOT NULL,
    "address" TEXT NOT NULL,
    "amountUsdt" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "status" "DepositStatus" NOT NULL DEFAULT 'DETECTED',
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "screeningId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "network" "NetworkCode" NOT NULL,
    "address" TEXT NOT NULL,
    "amountUsdt" BIGINT NOT NULL,
    "networkFeeUsdt" BIGINT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING_SCREENING',
    "screeningId" TEXT,
    "approvalRequestId" TEXT,
    "txHash" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "failureReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "LedgerAccountKind" NOT NULL,
    "userId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "balance" BIGINT NOT NULL DEFAULT 0,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "type" "JournalType" NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowOperation" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "type" "EscrowOpType" NOT NULL,
    "status" "EscrowOpStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "amountUsdt" BIGINT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "EscrowOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxCustodyAccount" (
    "id" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "totalUsdt" BIGINT NOT NULL DEFAULT 0,
    "heldUsdt" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxCustodyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxCustodyHold" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountUsdt" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "idempotencyKey" TEXT NOT NULL,
    "releasedTo" TEXT,
    "feeAccountRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SandboxCustodyHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SandboxCustodyOperation" (
    "idempotencyKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxCustodyOperation_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "side" "OfferSide" NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "amountUsdt" BIGINT NOT NULL,
    "remainingUsdt" BIGINT NOT NULL,
    "priceE4" BIGINT NOT NULL,
    "minOrderAgorot" BIGINT NOT NULL,
    "maxOrderAgorot" BIGINT NOT NULL,
    "paymentMethod" "PaymentMethodCode" NOT NULL,
    "bankAccountId" TEXT,
    "terms" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "offerSide" "OfferSide" NOT NULL,
    "makerId" TEXT NOT NULL,
    "takerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "TradeStatus" NOT NULL DEFAULT 'OFFER_ACCEPTED',
    "frozenFrom" "TradeStatus",
    "amountUsdt" BIGINT NOT NULL,
    "priceE4" BIGINT NOT NULL,
    "fiatAgorot" BIGINT NOT NULL,
    "feeUsdt" BIGINT NOT NULL,
    "buyerFeeUsdt" BIGINT NOT NULL,
    "sellerFeeUsdt" BIGINT NOT NULL,
    "feeRateBps" INTEGER NOT NULL,
    "feePayer" "FeePayer" NOT NULL,
    "commissionConfigId" TEXT,
    "sellerLocksUsdt" BIGINT NOT NULL,
    "buyerReceivesUsdt" BIGINT NOT NULL,
    "paymentMethod" "PaymentMethodCode" NOT NULL,
    "sellerBankAccountId" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "paymentDeadline" TIMESTAMP(3),
    "requiresReleaseReview" BOOLEAN NOT NULL DEFAULT false,
    "settlementBasis" "SettlementBasis",
    "markedPaidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "takeIdempotencyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeEvent" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "fromStatus" "TradeStatus",
    "toStatus" "TradeStatus" NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "method" "PaymentMethodCode" NOT NULL,
    "amountAgorot" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'AWAITING',
    "buyerNote" TEXT,
    "markedSentAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "reconciledAt" TIMESTAMP(3),
    "reconciliationSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amountAgorot" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "payerName" TEXT,
    "valueDate" TIMESTAMP(3) NOT NULL,
    "matchedPaymentId" TEXT,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "rateeId" TEXT NOT NULL,
    "positive" BOOLEAN NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraderStats" (
    "userId" TEXT NOT NULL,
    "completedTrades" INTEGER NOT NULL DEFAULT 0,
    "finishedTrades" INTEGER NOT NULL DEFAULT 0,
    "positiveRatings" INTEGER NOT NULL DEFAULT 0,
    "totalRatings" INTEGER NOT NULL DEFAULT 0,
    "releaseSecondsTotal" BIGINT NOT NULL DEFAULT 0,
    "releaseCount" INTEGER NOT NULL DEFAULT 0,
    "boughtUsdt" BIGINT NOT NULL DEFAULT 0,
    "soldUsdt" BIGINT NOT NULL DEFAULT 0,
    "feesPaidUsdt" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraderStats_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "FavoriteTrader" (
    "userId" TEXT NOT NULL,
    "traderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteTrader_pkey" PRIMARY KEY ("userId","traderId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderRole" "MessageSenderRole" NOT NULL,
    "body" TEXT NOT NULL,
    "riskSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRead" (
    "tradeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageRead_pkey" PRIMARY KEY ("tradeId","userId")
);

-- CreateTable
CREATE TABLE "MessageReport" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "tradeId" TEXT,
    "messageId" TEXT,
    "disputeMessageId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "openedByRole" TEXT NOT NULL,
    "reason" "DisputeReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "outcome" "DisputeOutcome",
    "findings" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeMessage" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "staffOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestNote" TEXT,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionConfig" (
    "id" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "minUsdt" BIGINT NOT NULL,
    "maxUsdt" BIGINT NOT NULL,
    "payer" "FeePayer" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "body" JSONB NOT NULL,
    "severity" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "params" JSONB NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "tradeId" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "isStaff" BOOLEAN NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "data" JSONB,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneE164_key" ON "User"("phoneE164");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_fingerprint_key" ON "Device"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_email_createdAt_idx" ON "LoginEvent"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_ip_createdAt_idx" ON "LoginEvent"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_type_createdAt_idx" ON "VerificationToken"("userId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "KycProfile_userId_key" ON "KycProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "KycProfile_nationalIdHash_key" ON "KycProfile"("nationalIdHash");

-- CreateIndex
CREATE INDEX "KycProfile_status_submittedAt_idx" ON "KycProfile"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "KycEvent_kycId_createdAt_idx" ON "KycEvent"("kycId", "createdAt");

-- CreateIndex
CREATE INDEX "RiskFlag_userId_resolvedAt_idx" ON "RiskFlag"("userId", "resolvedAt");

-- CreateIndex
CREATE INDEX "RiskFlag_tradeId_idx" ON "RiskFlag"("tradeId");

-- CreateIndex
CREATE INDEX "RiskFlag_resolvedAt_severity_idx" ON "RiskFlag"("resolvedAt", "severity");

-- CreateIndex
CREATE INDEX "ComplianceCase_status_priority_createdAt_idx" ON "ComplianceCase"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceCase_userId_idx" ON "ComplianceCase"("userId");

-- CreateIndex
CREATE INDEX "WalletScreening_network_address_createdAt_idx" ON "WalletScreening"("network", "address", "createdAt");

-- CreateIndex
CREATE INDEX "BankAccount_userId_deletedAt_idx" ON "BankAccount"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "BankAccount_accountHash_idx" ON "BankAccount"("accountHash");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_network_address_key" ON "DepositAddress"("network", "address");

-- CreateIndex
CREATE UNIQUE INDEX "DepositAddress_userId_network_key" ON "DepositAddress"("userId", "network");

-- CreateIndex
CREATE INDEX "Deposit_userId_createdAt_idx" ON "Deposit"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_network_txHash_key" ON "Deposit"("network", "txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_idempotencyKey_key" ON "Withdrawal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_key_key" ON "LedgerAccount"("key");

-- CreateIndex
CREATE INDEX "LedgerAccount_userId_idx" ON "LedgerAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_idempotencyKey_key" ON "JournalEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JournalEntry_referenceType_referenceId_idx" ON "JournalEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "JournalEntry_type_createdAt_idx" ON "JournalEntry"("type", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerLine_accountId_createdAt_idx" ON "LedgerLine"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerLine_entryId_idx" ON "LedgerLine"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "EscrowOperation_idempotencyKey_key" ON "EscrowOperation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EscrowOperation_tradeId_idx" ON "EscrowOperation"("tradeId");

-- CreateIndex
CREATE INDEX "EscrowOperation_status_createdAt_idx" ON "EscrowOperation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxCustodyAccount_externalRef_key" ON "SandboxCustodyAccount"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "SandboxCustodyHold_idempotencyKey_key" ON "SandboxCustodyHold"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Offer_side_status_paymentMethod_priceE4_idx" ON "Offer"("side", "status", "paymentMethod", "priceE4");

-- CreateIndex
CREATE INDEX "Offer_side_status_createdAt_idx" ON "Offer"("side", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_ownerId_status_idx" ON "Offer"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Offer_status_expiresAt_idx" ON "Offer"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_reference_key" ON "Trade"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_paymentReference_key" ON "Trade"("paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_takeIdempotencyKey_key" ON "Trade"("takeIdempotencyKey");

-- CreateIndex
CREATE INDEX "Trade_buyerId_status_createdAt_idx" ON "Trade"("buyerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Trade_sellerId_status_createdAt_idx" ON "Trade"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Trade_status_paymentDeadline_idx" ON "Trade"("status", "paymentDeadline");

-- CreateIndex
CREATE INDEX "Trade_offerId_idx" ON "Trade"("offerId");

-- CreateIndex
CREATE INDEX "Trade_createdAt_idx" ON "Trade"("createdAt");

-- CreateIndex
CREATE INDEX "TradeEvent_tradeId_createdAt_idx" ON "TradeEvent"("tradeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tradeId_key" ON "Payment"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementLine_matchedPaymentId_key" ON "BankStatementLine"("matchedPaymentId");

-- CreateIndex
CREATE INDEX "BankStatementLine_reference_idx" ON "BankStatementLine"("reference");

-- CreateIndex
CREATE INDEX "Rating_rateeId_idx" ON "Rating"("rateeId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_tradeId_raterId_key" ON "Rating"("tradeId", "raterId");

-- CreateIndex
CREATE INDEX "Message_tradeId_createdAt_idx" ON "Message"("tradeId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_flagged_createdAt_idx" ON "Message"("flagged", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReport_messageId_reporterId_key" ON "MessageReport"("messageId", "reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_storageKey_key" ON "FileObject"("storageKey");

-- CreateIndex
CREATE INDEX "FileObject_tradeId_idx" ON "FileObject"("tradeId");

-- CreateIndex
CREATE INDEX "FileObject_ownerId_createdAt_idx" ON "FileObject"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_tradeId_key" ON "Dispute"("tradeId");

-- CreateIndex
CREATE INDEX "Dispute_status_createdAt_idx" ON "Dispute"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_assignedToId_status_idx" ON "Dispute"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "DisputeMessage_disputeId_createdAt_idx" ON "DisputeMessage"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_createdAt_idx" ON "ApprovalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ApprovalRequest_referenceId_idx" ON "ApprovalRequest"("referenceId");

-- CreateIndex
CREATE INDEX "CommissionConfig_effectiveFrom_idx" ON "CommissionConfig"("effectiveFrom");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_updatedAt_idx" ON "SupportTicket"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycProfile" ADD CONSTRAINT "KycProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycEvent" ADD CONSTRAINT "KycEvent_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "KycProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCaseNote" ADD CONSTRAINT "ComplianceCaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ComplianceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAddress" ADD CONSTRAINT "DepositAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLine" ADD CONSTRAINT "LedgerLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowOperation" ADD CONSTRAINT "EscrowOperation_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SandboxCustodyHold" ADD CONSTRAINT "SandboxCustodyHold_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SandboxCustodyAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeEvent" ADD CONSTRAINT "TradeEvent_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraderStats" ADD CONSTRAINT "TraderStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteTrader" ADD CONSTRAINT "FavoriteTrader_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteTrader" ADD CONSTRAINT "FavoriteTrader_traderId_fkey" FOREIGN KEY ("traderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_disputeMessageId_fkey" FOREIGN KEY ("disputeMessageId") REFERENCES "DisputeMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
