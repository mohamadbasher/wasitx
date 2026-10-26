# External integrations

Every external dependency is an interface in `apps/api/src/modules/integrations/providers.ts` with a
**sandbox** implementation. Real implementations are intentionally **not written** until a provider is
contracted and its current API documentation and terms are verified — this repository does not
invent provider APIs. The API refuses to start in `TRADING_MODE=PRODUCTION` with any sandbox adapter.

| Capability | Interface | Sandbox behaviour | Status | Candidate providers to evaluate* |
|---|---|---|---|---|
| Identity document + liveness | `KycProvider` | User picks verdict via `POST /kyc/sandbox/complete` | 🧪 sandbox | Israeli or global KYC vendors supporting Israeli ID cards (Teudat Zehut, biometric ID) and Hebrew/Arabic documents; onboarding SDKs for web + React Native |
| Sanctions / PEP screening | `ScreeningProvider` | Names containing "sanction"/"pep" hit | 🧪 sandbox | Screening vendors covering Israeli NBCTF lists, UN, OFAC, EU, PEP databases |
| Custody & escrow holds | `CustodyProvider` | `SandboxCustody*` tables simulate an external custodian (own transactions, idempotency keys) | 🧪 sandbox | CMISA-licensed custodians or regulated institutional custodians that support per-transaction holds/escrow and TRC-20/ERC-20 USDT |
| Wallet risk | `WalletScreeningProvider` | Deterministic pseudo-risk by address hash; block list | 🧪 sandbox | Blockchain analytics vendors with TRON + Ethereum coverage |
| Bank settlement evidence | CSV import (`/admin/reconciliation/statement`) | Staff paste statement lines | 🧪 sandbox | Licensed Israeli open-banking information providers (Bank of Israel Directive 368); company bank statement feeds |
| SMS (+972) | `SmsProvider` | Dev inbox (`GET /api/v1/dev/outbox`) | 🧪 sandbox | SMS gateways with Israeli sender-ID registration and delivery receipts |
| Email | `EmailProvider` | Dev inbox | 🧪 sandbox | Transactional email services with DKIM/DMARC alignment |
| Push | `PushProvider` | Dev inbox | ✅ **Expo Push implemented** (`PUSH_PROVIDER=expo`) against Expo's public documented API | — |
| Malware scanning | `MalwareScanner` | Detects EICAR only | 🧪 sandbox | ClamAV sidecar or a cloud scanning API |
| File storage | `StorageDriver` | Local encrypted files | ✅ S3-compatible driver implemented (`STORAGE_DRIVER=s3`, requires `@aws-sdk/client-s3`) | AWS S3 / Cloudflare R2 / MinIO with SSE-KMS |
| Payment methods beyond bank transfer | Config only | Bit / PayBox disabled | ⏳ blocked on provider terms | — |

\* Candidate *categories*; no specific vendor's API is assumed. Selection criteria: Israeli regulatory
fit, data residency/transfer terms (Privacy Protection Law, Transfer of Data Abroad Regulations),
Hebrew/Arabic support, sandbox availability, webhook signing, SLAs, pricing per active user.

## How to add a real adapter (checklist)
1. Contract signed; sandbox credentials issued; API docs version recorded in the adapter header.
2. Implement the interface in `integrations/real/<provider>.ts` — no changes to domain services.
3. Verify webhook signatures; store raw payloads for audit; idempotent processing by provider event id.
4. Map provider statuses to domain results explicitly (unknown → manual review, never approve).
5. Contract tests against the provider sandbox in CI (nightly); chaos tests for timeouts/retries.
6. Switch the env var (e.g. `KYC_PROVIDER=real`) in staging; run the e2e suite; then record the gate.

## Custody-specific requirements for the chosen provider
- Per-trade **hold** that the account owner cannot spend, released or cancelled by platform instruction.
- Idempotency keys on hold/release/cancel/withdraw; query by key for reconciliation.
- Dual-control on release instructions (API key scoping + platform-side four-eyes for manual ops).
- Per-client sub-accounts (segregation) and a fee account; daily balance statements for reconciliation.
- Deposit webhooks with confirmation counts; address-per-user; Travel Rule data exchange where applicable.
