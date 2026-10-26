# Database design

Source of truth: [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) (47 models) plus
hand-written integrity migrations in `apps/api/prisma/migrations/*_integrity`, `*_trigger_errcodes`,
`*_audit_seals`.

## Domains → tables

| Domain | Tables |
|---|---|
| Identity | `User`, `UserRole`, `Session`, `Device`, `LoginEvent`, `VerificationToken`, `PushToken` |
| Compliance | `KycProfile`, `KycEvent`, `RiskFlag`, `ComplianceCase`, `ComplianceCaseNote`, `WalletScreening` |
| Payments config | `BankAccount`, `PaymentMethodConfig`, `NetworkConfig`, `BankStatementLine` |
| Custody & ledger | `DepositAddress`, `Deposit`, `Withdrawal`, `LedgerAccount`, `JournalEntry`, `LedgerLine`, `EscrowOperation`, `SandboxCustodyAccount`/`Hold`/`Operation` (sandbox custodian only) |
| Marketplace | `Offer` (BUY and SELL, `side` column), `Trade` (= "order/transaction"), `TradeEvent`, `Payment`, `Rating`, `TraderStats`, `FavoriteTrader` |
| Messaging | `Message`, `MessageRead`, `MessageReport`, `FileObject` |
| Disputes & approvals | `Dispute`, `DisputeMessage`, `ApprovalRequest` |
| Revenue & config | `CommissionConfig` (versioned), `SystemConfig` (risk rules, gates, reconciliation report), `Announcement` |
| Notifications | `Notification`, `NotificationDelivery`, `OutboxEvent` |
| Support | `SupportTicket`, `TicketMessage` |
| Audit | `AuditEvent`, `AuditSeal`, `IdempotencyRecord` |

## Money representation
`BIGINT` minor units everywhere: `*Usdt` micro-USDT, `*Agorot` ILS agorot, `priceE4` ₪ × 10⁴. Fees are
snapshotted on each `Trade` (`feeUsdt`, `buyerFeeUsdt`, `sellerFeeUsdt`, `feeRateBps`, `feePayer`,
`commissionConfigId`), so later commission changes never affect open trades.

## Constraints enforced by Postgres (not just the app)
- Append-only: `AuditEvent`, `AuditSeal`, `TradeEvent`, `JournalEntry`, `LedgerLine`, `KycEvent`.
- `LedgerAccount.balance` changes only through `LedgerLine` inserts; `CHECK (allowNegative OR balance >= 0)`.
- Every journal entry sums to zero per currency (deferred constraint trigger, checked at commit).
- `Offer`: `0 ≤ remaining ≤ amount`, positive price, `min ≤ max`.
- `Trade`: fee arithmetic identities, `buyerReceives > 0`, buyer ≠ seller, FROZEN ⇒ `frozenFrom` set.
- Sandbox custodian: `0 ≤ held ≤ total`.
- Uniques: national-ID lookup hash, verified phone, payment reference, trade reference, idempotency keys
  (`Trade.takeIdempotencyKey`, `JournalEntry.idempotencyKey`, `EscrowOperation.idempotencyKey`, `Withdrawal.idempotencyKey`).

## Indexing highlights
- Order book: `(side, status, paymentMethod, priceE4)`, `(side, status, effectiveMaxAgorot)`, partial
  index on `ACTIVE` offers.
- Trades: `(buyerId|sellerId, status, createdAt)`, `(status, paymentDeadline)` for the expiry sweep.
- Work queues: `OutboxEvent(status, availableAt)`, `EscrowOperation(status, nextAttemptAt)`,
  `KycProfile(status, submittedAt)`, `Dispute(status, createdAt)`, `RiskFlag(resolvedAt, severity)`.

## Encryption & PII
App-layer AES-256-GCM: `KycProfile.nationalIdEnc`, `BankAccount.accountNumberEnc`, `User.mfaSecretEnc`, and
all stored files. HMAC lookup hashes: `nationalIdHash`, `accountHash`. Phone numbers and names are
stored in clear for search and matching (access-controlled).

## Retention
See DEPLOYMENT.md § Data retention. Partition the high-volume append-only tables by month at the
100k-user tier (SCALING.md).

## Migrations
`prisma migrate deploy` in CI and releases. Hand-written SQL migrations carry the triggers; never edit
an applied migration — add a new one. Local test DB is migrated non-destructively by the test setup.
