# State machines

The executable definitions live in `packages/shared/src/state-machines/*.ts` and are imported by the
API (enforcement) and by clients (to render available actions). The API is the only place transitions
are executed; clients only *display* allowed actions. Tests: `packages/shared/test/state-machines.test.ts`.

## 1. Authentication / account

```
Account status:  ACTIVE ──(compliance/admin)──▶ RESTRICTED ──▶ ACTIVE
                 ACTIVE|RESTRICTED ──(admin)──▶ SUSPENDED ──(admin)──▶ ACTIVE
                 any ──(user request + retention)──▶ CLOSED   (terminal; PII purged per retention policy)

Login: password ✓ → (MFA enrolled? TOTP ✓) → session issued (access 15 min, refresh 30 days rotating)
       refresh reuse detected → whole session family revoked + security alert
       5 failed passwords / 15 min → temporary lockout + alert; new device/IP → "new login" alert
```

Verification ladder (derived "tier", not a stored role):
`REGISTERED → EMAIL_VERIFIED → PHONE_VERIFIED → KYC_PENDING → VERIFIED_TRADER`. Trading requires
email + phone + KYC `APPROVED` + residency `IL` + age ≥ 18 + not sanctioned + account `ACTIVE`.

## 2. KYC

```
NOT_STARTED → PENDING → APPROVED
                  ├──▶ IN_REVIEW → APPROVED | REJECTED | RESUBMISSION_REQUIRED
                  └──▶ REJECTED | RESUBMISSION_REQUIRED
RESUBMISSION_REQUIRED → PENDING
APPROVED → EXPIRED (document expiry) | REVOKED (compliance)
```

## 3. Offer

`OFFER_CREATED` in the brief corresponds to an offer entering `ACTIVE`.

```
ACTIVE ⇄ PAUSED          (owner)
ACTIVE|PAUSED → CANCELLED (owner, admin)       — in-flight trades continue on their snapshot
ACTIVE → EXHAUSTED        (system: remaining < min order)
EXHAUSTED → ACTIVE        (system: trade cancelled/expired returns quantity)
ACTIVE|PAUSED|EXHAUSTED → EXPIRED (system: expiresAt passed)
ACTIVE|PAUSED → SUSPENDED (admin/compliance) → PAUSED (admin)
```

- SELL offers reserve the maker's USDT internally (ledger `AVAILABLE → OFFER_RESERVED`) at creation.
- Edits: price, min/max, payment method, expiry while `ACTIVE|PAUSED`; quantity can be reduced
  to ≥ 0 remaining or increased if balance allows. `version` increments on every edit.
- Taking an offer is an atomic conditional update:
  `UPDATE offer SET remaining = remaining - x, version = version + 1 WHERE id = ? AND status = 'ACTIVE'
  AND remaining >= x AND price = :quotedPrice AND version = :quotedVersion` → 0 rows ⇒ `OFFER_CHANGED`.

## 4. Trade (escrow)

```
OFFER_ACCEPTED ─sys─▶ COMPLIANCE_REVIEW ─compliance approve─▶ ESCROW_PENDING
       │                      └─compliance reject─▶ CANCELLED
       └─sys (auto-pass)─▶ ESCROW_PENDING ─sys hold ok─▶ ESCROW_CONFIRMED ─sys─▶ AWAITING_FIAT_PAYMENT
                                 └─sys hold failed─▶ CANCELLED
AWAITING_FIAT_PAYMENT ─buyer mark paid─▶ BUYER_MARKED_PAID
AWAITING_FIAT_PAYMENT ─buyer cancel─▶ CANCELLED
AWAITING_FIAT_PAYMENT ─sys deadline─▶ EXPIRED
BUYER_MARKED_PAID ─seller confirms receipt─▶ SELLER_CONFIRMED_RECEIPT
BUYER_MARKED_PAID ─buyer|seller open dispute─▶ DISPUTED
SELLER_CONFIRMED_RECEIPT ─sys settlement verified | compliance approve─▶ RELEASE_PENDING
RELEASE_PENDING ─sys custody release confirmed─▶ COMPLETED
DISPUTED ─dispute manager (buyer wins; dual approval ≥ threshold)─▶ RELEASE_PENDING
DISPUTED ─dispute manager (seller wins; dual approval ≥ threshold)─▶ CANCELLED
any non-terminal ─compliance freeze─▶ FROZEN ─compliance unfreeze─▶ (previous state)
FROZEN ─compliance (dual approval)─▶ CANCELLED
Terminal: COMPLETED, CANCELLED, EXPIRED
```

### Guards and invariants

| Rule | Where |
|---|---|
| A seller can never cancel after escrow is confirmed (the buyer may already have paid). | machine |
| No transition from `BUYER_MARKED_PAID` to `EXPIRED` — paid trades never auto-expire. | machine |
| `SELLER_CONFIRMED_RECEIPT → RELEASE_PENDING` only by `system` after the settlement policy passes, or by a compliance officer. A buyer's claim or uploaded screenshot never satisfies it. | machine + `SettlementPolicy` |
| Settlement policy: seller confirmation **and** (amount < review threshold and no risk flags) **or** bank reconciliation match **or** compliance approval. | `trades/settlement.policy.ts` |
| Dispute resolutions ≥ `DUAL_APPROVAL_THRESHOLD_USDT` create an `ApprovalRequest`; a *different* staff member with the permission must approve before execution. | `admin/approvals` |
| Every transition writes `TradeEvent(from,to,actor,reason)` + `AuditEvent` + `OutboxEvent` in the same DB transaction. | `TradesService.transition` |
| Every transition runs with the trade row locked (`SELECT … FOR UPDATE`). | `TradesService.transition` |

### Effects

| Entering | Effect |
|---|---|
| `ESCROW_PENDING` | `custody.createHold(seller, amount + sellerFee, idempotencyKey=trade:<id>:hold)`; ledger `seller OFFER_RESERVED|AVAILABLE → seller ESCROW` |
| `AWAITING_FIAT_PAYMENT` | payment reference `WX-XXXXXX`, deadline = now + payment window |
| `CANCELLED` / `EXPIRED` (after hold) | `custody.cancelHold`; ledger `ESCROW → AVAILABLE` (BUY offers) or back to `OFFER_RESERVED` (SELL offer still open); offer `remaining += amount` |
| `COMPLETED` | `custody.releaseHold`; ledger `seller ESCROW → buyer AVAILABLE (net)` + `→ PLATFORM_FEE_REVENUE (fee)` |

Custody calls carry deterministic idempotency keys so a retried job can never double-execute.
