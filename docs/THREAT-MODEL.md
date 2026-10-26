# Threat model

Method: STRIDE per asset, focused on the money path. "Control" lists what is implemented in this
repository; "Residual / next" lists what depends on providers, operations, or future work.
Generated code is not evidence of security — an independent penetration test is a production gate.

## Assets

| Asset | Why it matters |
|---|---|
| Seller USDT in escrow | Direct loss if released wrongly |
| Release decision | The single most valuable action in the system |
| User accounts / sessions | Takeover → fraudulent trades, withdrawals |
| Bank details & KYC data | Highly sensitive personal/financial data (Privacy Law Amendment 13) |
| Ledger & audit records | Legal evidence; regulator reliance |
| Staff privileges | Insider can bypass controls |

## Threats and controls

### 1. Account takeover
| Threat | Control | Residual / next |
|---|---|---|
| Credential stuffing | Argon2id; per-IP+email rate limit; 5-failure lockout; identical timing for unknown emails | Breached-password check (HIBP k-anonymity) — planned |
| Session theft | httpOnly cookies, CSRF double-submit, 15-min access tokens, refresh rotation with reuse detection → family revoked + alert | Device-bound tokens (DPoP) — future |
| SIM swap on SMS OTP | Phone OTP only verifies the number; login never relies on SMS; TOTP for MFA; new-device alerts by email | Passkeys (WebAuthn) — planned |
| Phishing / fake site | Strict CSP, HSTS preload, brand-consistent domain; security alerts always emailed | Domain monitoring, DMARC |
| Withdrawal after takeover | TOTP required for withdrawals; screening; manual approval above threshold | Address allowlist with 24 h delay — planned |

### 2. Fraudulent fiat payment
| Threat | Control | Residual / next |
|---|---|---|
| Buyer claims "paid" but didn't | Marking paid never releases; release needs **seller confirmation** + settlement policy | — |
| Fake screenshot / edited receipt | Evidence is advisory only; UI and notifications tell sellers to check their bank, never screenshots | — |
| Payment from third-party account (triangulation fraud) | Bank accounts must match KYC legal name; seller confirms sender name; dispute reason `PAYMENT_FROM_THIRD_PARTY` | Open-banking payer-name verification |
| Chargeback / recall of instant transfer | Large trades → compliance review; reconciliation path via statement match | Loss allocation in Terms (counsel) |
| Payment redirection in chat ("pay my brother") | Chat risk detection (ar/he/en), masking of account numbers to counterparty, warning banner, trade flagged → release needs compliance | ML-based detection — future |
| Self-dealing / wash trades | Same bank-account hash on both sides blocked + flagged; duplicate ID numbers blocked | Device/graph analytics |

### 3. Escrow bypass & double spending
| Threat | Control |
|---|---|
| Overselling an offer under concurrency | Row lock on offer + price/version check; DB CHECK `remaining ≥ 0`; tested with 8 parallel buyers |
| Same USDT backing several offers | SELL offers reserve funds in the ledger; non-negative balance CHECK |
| Duplicate execution on retry | Idempotency-Key with DB claim row; deterministic custody idempotency keys; unique journal keys |
| Release while frozen / disputed | State machine has no such edge; escrow worker re-checks status before first custody attempt |
| Custody call succeeded but DB rolled back | Attempt counter incremented before call; replays are idempotent; CANCEL_HOLD waits for HOLD resolution; reconciliation flags holds without matching trades |
| Ledger tampering | Append-only + balanced-entry triggers; balance writable only via lines |

### 4. Insider misuse
| Threat | Control | Residual / next |
|---|---|---|
| Staff releases escrow to accomplice | No manual "release" action exists; only dispute resolution, which above threshold needs a **different** approver with permission | Lower threshold for new staff |
| Privilege escalation | ADMIN/SUPER_ADMIN grants need four-eyes; role changes revoke sessions | Quarterly access reviews |
| Covering tracks | Audit rows append-only with digests + seals; DB role used by the app should lack DDL rights in production | WORM export of seals to separate account |
| Data exfiltration | RBAC per screen, staff MFA, admin on separate origin + IP allowlist, no bulk PII export endpoint | DLP, session recording for support tools |

### 5. Blockchain integration failures
| Threat | Control | Residual / next |
|---|---|---|
| Wrong-network withdrawal | Address validated per network (TRON base58check, EIP-55); cross-network detection blocks | — |
| Sanctioned / high-risk destination | Wallet screening before any withdrawal; BLOCK → case; REVIEW → approval | Real provider integration |
| Fake deposit / reorg | Deposits credited only after custodian confirmation; min-confirmations per network config | Real custodian webhooks + signature checks |
| Token contract spoofing | Networks disabled until a verified contract address is recorded | — |
| Issuer freeze of USDT | Disclosed in risk disclosure; reconciliation would surface | Operational playbook |

### 6. Application-level
| Threat | Control |
|---|---|
| SQL injection | Prisma parameterised queries; raw SQL only via tagged templates |
| XSS | React escaping; no `dangerouslySetInnerHTML` except the static theme script; strict CSP; uploads served as attachments with `nosniff` and sandbox CSP |
| Malicious uploads | Magic-byte allowlist (JPG/PNG/WEBP/PDF), 8 MB cap, malware-scan hook (EICAR in sandbox; ClamAV/vendor in prod), AES-256-GCM at rest, authorised download only |
| IDOR | Every query scoped by party or permission; not-found returned instead of forbidden |
| Mass assignment | Zod schemas (shared) on every body |
| Abuse / spam | Global + per-route rate limits; chat 20 msg/min; ticket and offer caps |
| Webhook forgery | Provider adapters must verify signatures; unsigned → 401 |

## Out of scope for this codebase (operational)
DDoS protection (CDN/WAF), HSM/KMS key custody, SIEM, 24/7 on-call — see DEPLOYMENT.md.
