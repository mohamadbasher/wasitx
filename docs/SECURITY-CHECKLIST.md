# Security review checklist

Baselines: OWASP ASVS 4.0.3 (level 2, level 3 for money paths) and OWASP MASVS v2 for the mobile app.
Status: ✅ implemented & tested · 🟡 implemented, not independently verified · ⏳ pending.

## Authentication & sessions (ASVS V2, V3)
- ✅ Argon2id (19 MiB, t=2) password hashing; ≥ 12-char passwords, no composition rules (V2.1)
- ✅ Lockout after 5 failures / 15 min; rate limits per IP+email (V2.2) — tested
- ✅ TOTP MFA with recovery codes; mandatory for staff (V2.8) — tested
- ⏳ Passkeys (WebAuthn) and breached-password screening
- ✅ Refresh rotation + reuse detection revokes family (V3.3) — tested
- ✅ httpOnly, Secure (prod), SameSite=Lax cookies; CSRF double-submit (V3.4, V13.2) — tested
- ✅ Logout / logout-all / per-session revoke; sessions revoked on password reset, suspension, role change
- ✅ New-device alerts; login history

## Access control (V4)
- ✅ Central permission catalogue; deny-by-default global guard; `@Staff()` requires MFA session — tested
- ✅ Object-level checks (party or permission) on trades, messages, files, disputes, tickets — tested (404 for strangers)
- ✅ Four-eyes for dispute resolutions ≥ threshold, frozen-trade cancellation, privileged role grants, withdrawals needing approval — tested
- 🟡 Admin origin behind IP allowlist / VPN (deployment)

## Validation, encoding, injection (V5)
- ✅ Shared Zod schemas on every request body/query
- ✅ Parameterised SQL only
- ✅ Output encoding by React; strict CSP on web and admin
- ✅ Decimal-string money parsing rejects exponents, signs, excess precision — unit-tested

## Cryptography & data protection (V6, V8)
- ✅ AES-256-GCM for PII fields (national ID, bank account number, MFA secret) and stored files
- ✅ Keyed HMAC lookup hashes for uniqueness without plaintext
- 🟡 Key management: env-injected keys; production must use KMS/HSM with rotation (ciphertexts are versioned `v1:`)
- ✅ TLS everywhere (HSTS preload header); 🟡 TLS termination config is deployment
- ✅ Bank details shown only to the trade's parties and staff; masked elsewhere

## Files (V12)
- ✅ Content sniffing allowlist, size cap, sanitised names, malware hook, encrypted at rest, attachment disposition, `nosniff`, sandbox CSP

## Business logic (V11) — money path
- ✅ Explicit state machine; illegal transitions impossible — unit-tested
- ✅ Row-level locking and version/price guards — concurrency-tested
- ✅ Idempotency on all money-moving endpoints — tested
- ✅ Ledger invariants enforced by DB triggers — tested (edit/delete/direct balance write/unbalanced entry all rejected)
- ✅ Reconciliation ledger ↔ custodian — tested
- ✅ Paid trades never auto-expire; buyer claims never release — tested

## Logging & monitoring (V7)
- ✅ Tamper-evident audit log (append-only, digests, seals, verify endpoint)
- ✅ No secrets/PII in logs (OTPs only logged by the *sandbox* SMS adapter)
- ⏳ Central log shipping, alerting, SIEM rules

## Configuration (V14)
- ✅ Env validated at boot; PRODUCTION refuses sandbox adapters, dev secrets, unset gates
- ✅ Helmet headers on API; security headers on web/admin
- ✅ CI: dependency audit (high+), gitleaks, CodeQL
- ⏳ Container image scanning, SBOM

## Mobile (MASVS)
- ✅ Tokens in iOS Keychain / Android Keystore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`)
- ✅ No secrets in the bundle; API URL from config
- ✅ Unneeded Android permissions blocked
- ⏳ Certificate pinning, jailbreak/root signals, app attestation (App Attest / Play Integrity)
- ⏳ Biometric unlock

## Before production (gate `gate.pentest.passed`)
- ⏳ Independent web/API/mobile penetration test and fix of all high/critical findings
- ⏳ Threat-model review with the custodian and KYC vendor integrations in place
- ⏳ Load test at target scale (script: `infra/load/market-and-trade.k6.js`)
- ⏳ Backup restore drill; incident-response tabletop
