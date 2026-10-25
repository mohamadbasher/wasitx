# WASIT X — Product Requirements (v0.1)

> Brand name is configurable (`BRAND_NAME` / `NEXT_PUBLIC_BRAND_NAME` / `EXPO_PUBLIC_BRAND_NAME`).
> **Operating mode: SANDBOX.** No real money, custody, or blockchain transfers until the gates in
> [REGULATORY-CHECKLIST.md](REGULATORY-CHECKLIST.md) are satisfied and recorded in system configuration.

## 1. Problem

Israeli residents who want to buy or sell USDT for shekels mostly use informal channels (Telegram groups,
WhatsApp, cash meetups) or offshore exchanges. These channels expose users to fraud (fake transfers,
chargebacks, payment-redirection scams), give no recourse, and are opaque to AML controls.

## 2. Product

A supervised, Israel-only P2P marketplace where **verified** Israeli residents (18+) trade USDT ↔ ILS
with each other. The platform:

- verifies identity, age and residency (KYC) and screens for sanctions/PEP;
- holds the seller's USDT in **escrow at a licensed custodian** for the duration of a trade;
- guides both parties through a strict, auditable state machine;
- verifies fiat settlement before release (never on a screenshot alone);
- provides chat, dispute resolution and support;
- charges a transparent, configurable commission shown before confirmation.

## 3. Users and roles

| Role | Can |
|---|---|
| Guest | Browse public pages and the marketplace (read-only) |
| Registered user | Manage account, start KYC |
| KYC-pending user | Same as registered; KYC in progress |
| Verified trader | Create offers, accept offers, trade, open disputes |
| Support agent | Read users/trades, reply in support inbox, join trade chats |
| Compliance officer | KYC review, compliance cases, freeze/unfreeze, risk rules |
| Dispute manager | Resolve disputes (high-value resolutions need a second approver) |
| Administrator | Operations, configuration, employees (except super-admin grants) |
| Super administrator | Everything, including role grants and production-mode gates |

All permissions are enforced server-side (`packages/shared/src/permissions.ts` is the single source).

## 4. Scope (launch)

- **Geography:** Israel only. ILS only. USDT only. Israeli +972 mobile numbers. Eligibility decided
  by verified residency from KYC — never by IP or phone prefix alone.
- **Languages:** Arabic, Hebrew (RTL) and English (LTR), equal quality. Times in Asia/Jerusalem.
- **Payment methods:** Israeli bank transfer (incl. instant transfer where the bank supports it).
  Additional methods (e.g. Bit, PayBox) are adapters that stay **disabled** until their commercial terms
  explicitly permit this use case.
- **Networks:** USDT on TRON (TRC-20) and Ethereum (ERC-20) are *modelled* but disabled by default; an
  admin enables a network only after custody-provider support and contract addresses are verified.

## 5. Core journeys

1. **Onboard:** register (email + password) → verify email → verify +972 phone (OTP) → KYC (document,
   liveness, residency) → sanctions/PEP screening → *verified trader*.
2. **Publish offer:** choose SELL or BUY, quantity, price per USDT (₪), min/max order, payment method,
   expiry. SELL offers require sufficient custody balance; the quantity is reserved when a trade starts.
3. **Take offer:** pick an offer → enter amount → see price, fiat total, fee, net received →
   confirm (price-locked; rejected if the offer changed) → trade starts.
4. **Trade:** compliance check → escrow lock at custodian → buyer pays by bank transfer using the
   *platform-generated reference* → buyer marks paid (optional evidence) → seller confirms funds
   received (plus reconciliation / compliance where required) → release → both rate each other.
5. **Problem:** either party opens a dispute → evidence → dispute manager decides → resolution
   executed through the custody adapter (dual approval above threshold).

## 6. Non-functional requirements

- Money in integer minor units (USDT 6 dp, ILS agorot) using `bigint`; prices in 1/10,000 ₪.
- Every state change is an explicit transition with an actor and permission, written with an
  append-only event, inside one DB transaction.
- Idempotency keys on every money-moving or state-changing POST.
- Double-entry ledger; ledger never mixed with custodian balances; reconciliation reports diffs.
- p95 API < 300 ms for reads at MVP scale; marketplace updates pushed in < 2 s.
- WCAG 2.2 AA contrast, keyboard navigation, screen-reader labels; RTL-correct layouts.

## 7. Revenue

Commission (demo default 0.75% of USDT amount; min 1 USDT; max 50 USDT; payer: BUYER). Fee parameters
are versioned configuration; each trade snapshots the fee it was quoted. No hidden charges.

## 8. Out of scope for launch

Fiat custody by the platform, margin/derivatives, other cryptocurrencies, non-Israeli users,
cash meetups, card payments, automatic release based on user claims.

## 9. Success metrics

KYC pass rate, time-to-first-trade, trade completion rate, dispute rate (< 1.5%), median trade
duration, fraud loss rate (target 0 platform-borne), NPS.

## 10. Assumptions (documented, adjustable)

- A licensed custodian holds client USDT; the platform never holds private keys.
- Fiat moves directly bank-to-bank between users; the platform never touches fiat.
- Commission is collected in USDT from the escrowed amount at release.
- Trade payment window: 30 minutes (configurable); offers expire after max 30 days.
- Default UI locale is Arabic (`ar`), configurable; locale chosen by user preference first.
