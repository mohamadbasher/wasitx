# Status report — what is real, what is simulated, what is pending

_Last updated: 2026-10-26._ Legend: ✅ implemented & verified by tests or a real run · 🧪 implemented
against a **sandbox** adapter (no real provider) · 🟡 implemented, not yet verified end-to-end ·
⏳ not built / blocked.

> **No real money, custody, KYC, SMS, or blockchain activity happens anywhere in this system today.**
> Every "deposit", "withdrawal", "escrow hold" and "release" is executed by the sandbox custodian and
> labelled simulated in the UI.

## Verification performed (actual results)
| Check | Result |
|---|---|
| Shared core unit tests (`packages/shared`, Vitest) | **33 / 33 pass** — money math, fees, state machines, validators, chat safety |
| API integration tests (`apps/api`, Vitest + Supertest, real Postgres 16 with migrations & triggers) | **18 / 18 pass** — full lifecycle, BUY offers, insufficient funds, 8-way concurrency (exactly 6 fills, no oversell), stale price, own-offer, expiry + custody cancel, paid-never-expires, cancel rules, disputes incl. four-eyes, chat risk → compliance release, freeze/unfreeze, admin/MFA/KYC/CSRF authorisation, lockout, refresh-reuse, ledger immutability, reconciliation |
| Browser e2e (`apps/web`, Playwright, Chromium desktop + Pixel 7) | **7 pass, 1 skipped by design** — marketplace in ar/he/en (dir + content), login → take offer → trade room with verified instructions → cancel |
| Staff console | Driven in Chromium: login, mandatory TOTP enrolment, overview/trades/revenue/settings render without page errors |
| Production builds | Web ✅, Admin ✅, API ✅; Mobile: `expo-doctor` 20/20, Android + iOS Hermes bundles export ✅ |
| Typecheck | All 5 workspaces clean |
| Dependency audit | ⚠ `pnpm audit` **timed out locally** (registry advisory endpoint, exit 124) — not verified here; CI runs it with `--audit-level high` |
| Docker images / compose | ⚠ **Not built** — Docker is not installed on the development machine |
| Mobile on device/simulator | ⚠ **Not run** — no emulator/Xcode available; bundles compile only |
| Load test | ⏳ script written (`infra/load`), not executed |
| Penetration test | ⏳ production gate |

A real bug was found and fixed by the concurrency test: a deadlock between offer row locks and a
global audit lock (see ADR 0009).

## Functionality by area
| Area | Status | Notes |
|---|---|---|
| Registration, email verification, login, lockout, password reset | ✅ | Emails go to the sandbox inbox |
| Phone OTP (+972 only) | ✅ / 🧪 SMS | Logic real; SMS delivery sandbox |
| TOTP MFA + recovery codes; staff MFA enforcement | ✅ | |
| Passkeys (WebAuthn) | ⏳ | Planned; UI states it |
| Sessions, devices, login history, logout-all, refresh-reuse detection | ✅ | |
| KYC data capture, ID-number checksum, dedupe, age, residency rule, PEP/sanctions routing, manual review | ✅ logic / 🧪 provider | Document + liveness verdict simulated |
| Bank accounts with legal-name matching & shared-account detection | ✅ | |
| Offers: create/edit/pause/resume/cancel, reservation, expiry | ✅ | |
| Marketplace: tabs, filters, sorting, keyset paging, live updates, stats, depth | ✅ | |
| Take offer: stale-price/version guard, limits, self-trade guard, idempotency | ✅ | |
| Trade state machine, escrow lock/release/cancel, settlement policy, expiry | ✅ logic / 🧪 custody | |
| Double-entry ledger with DB-enforced invariants; reconciliation | ✅ | |
| Fees: versioned config, snapshot per trade, disclosure before confirm, receipts | ✅ | VAT treatment pending tax advice |
| Chat: realtime, read receipts, attachments, masking, risk detection, reporting, staff intervention | ✅ | Detection is rule-based (ar/he/en) |
| Uploads: sniffing, size cap, encryption at rest, authorised download | ✅ / 🧪 malware scan | EICAR-only scanner in sandbox |
| Disputes: open, evidence, staff notes, info requests, escalation, resolution, four-eyes | ✅ | |
| Notifications: in-app, realtime, email/SMS (🧪), Expo push (✅ adapter), preferences | ✅ / 🧪 | Push not tested on a device |
| Wallet: balances with source + reconciliation flag, deposit address, sandbox deposit, withdrawals with MFA, address validation, wrong-network block, screening, approval | ✅ logic / 🧪 custody + screening | Withdrawals are web-only (not in mobile) |
| Bank-statement reconciliation (CSV import, reference + amount match) | 🧪 | Real feed needs a licensed open-banking provider |
| Admin console (all listed sections) | ✅ | English UI (staff tool); customer apps are trilingual |
| Production gates + boot guard | ✅ | |
| Audit log: append-only, digests, seals, verify | ✅ | Rows written before the seal migration (dev DB) show as non-conforming |
| Data-retention purge job | ⏳ | Waiting for counsel's retention schedule |
| Withdrawal address allowlist with time delay | ⏳ | Recommended before production |
| Mobile: disputes opening & withdrawals | ⏳ | Available on web; mobile shows trade status and links |
| Certificate pinning / app attestation | ⏳ | Before store submission |
| Real provider adapters (KYC, screening, custody, wallet risk, SMS, email, malware, open banking) | ⏳ | Blocked on contracts — see INTEGRATIONS.md |

## Pending approvals & decisions (blocking production)
Licence path (CMISA), AML programme & officer, custodian contract, KYC/screening vendor, company
banking, DPO, published terms, penetration test — the eight gates in REGULATORY-CHECKLIST §9; plus
VAT treatment, retention schedule, launch limits, and Bit/PayBox terms.

## Next engineering steps (suggested order)
1. Pick custodian + KYC vendor; implement real adapters against their sandboxes; nightly contract tests.
2. Passkeys; withdrawal allowlist; breached-password check.
3. Retention purge job per counsel's schedule; DSAR export.
4. Build and scan Docker images in CI; staging deployment; k6 baseline; pen test.
5. Mobile: dispute screens, withdrawals, biometrics, pinning, attestation; device testing matrix.
