# Deployment, operations & recovery

## Environments
| Env | Mode | Data | Who |
|---|---|---|---|
| local | SANDBOX | `.pgdata` cluster / compose | developers |
| staging | SANDBOX | managed Postgres (separate) | team, QA, pen-testers |
| production | SANDBOX until all gates set → PRODUCTION | managed Postgres HA, israel-region or approved region (CMISA outsourcing / privacy transfer rules) | ops |

Production and staging never share databases, keys, or provider credentials.

## Components
- `api` image (`infra/docker/api.Dockerfile`) — stateless; run ≥ 2 replicas. Web-facing pods `JOBS_ENABLED=false`; one *worker* deployment of the same image with `JOBS_ENABLED=true` (2 replicas are safe — ADR 0007).
- `web`, `admin` images (`infra/docker/next.Dockerfile`, build arg `APP`). Admin on a separate hostname behind VPN / IP allowlist.
- Managed Postgres 16 (HA, PITR), Redis (HA), private object storage (SSE-KMS), CDN + WAF for web.

## Configuration & secrets
- All variables documented in `apps/api/.env.example`, `apps/web/.env.example`, `apps/admin/.env.example`, `apps/mobile/.env.example`.
- Secrets (`TOKEN_SIGNING_KEY`, `DATA_ENCRYPTION_KEY`, `LOOKUP_HMAC_KEY`, provider keys, DB URL) come from the cloud secrets manager, injected at runtime; never in images or git (CI runs gitleaks).
- `DATA_ENCRYPTION_KEY` should be a KMS-wrapped data key; rotation = new `v2:` key + background re-encryption job (ciphertexts are versioned).
- The DB role used by the API must not own the schema (no DDL); migrations run with a separate migration role.

## Release procedure
1. CI green on `main` (types, unit, API integration on real Postgres, builds, mobile bundle, audit, CodeQL).
2. Build images tagged with the git SHA; sign and scan images.
3. **Migrations first**, as a one-off job: `prisma migrate deploy` with the migration role. Migrations must be backward-compatible with the running version (expand → deploy → contract).
4. Roll out API (rolling, readiness = `/api/v1/health`), then worker, then web/admin.
5. Smoke: health, public config, login, marketplace list, a sandbox trade on staging.
6. Rollback: redeploy previous image; never roll back migrations destructively (write a forward fix).

Production mode switch: a super-admin records the eight gates in the admin console (each with evidence), real adapters are configured, then `TRADING_MODE=PRODUCTION` is deployed. The API refuses to boot otherwise.

## Monitoring & alerting
| Signal | Alert when |
|---|---|
| API p95 latency / 5xx rate | p95 > 800 ms or 5xx > 1% for 5 min |
| Outbox backlog (`OutboxEvent` PENDING older than 1 min) | > 100 or oldest > 5 min |
| Escrow ops (`EscrowOperation` PENDING > 5 min, or FAILED) | any FAILED; any PENDING > 15 min |
| Reconciliation (`SystemConfig recon.last`) | `ok=false` → page compliance + engineering |
| Frozen trades, CRITICAL risk flags | any new one → compliance on-call |
| Audit seal lag | newest seal older than 10 min |
| Login failure spikes / refresh-reuse events | anomaly → security on-call |
| DB: replication lag, connections, disk | standard thresholds |

## Backups & disaster recovery
- Postgres PITR (≥ 14 days) + daily snapshot copied cross-region, encrypted with a separate key.
- Object storage versioning + cross-region replication for evidence/KYC files.
- Targets: **RPO ≤ 5 min, RTO ≤ 1 h** for the money path.
- **Quarterly restore drill**: restore to an isolated environment, run `GET /admin/audit/verify` and reconciliation, compare totals with the custodian statement; record results.
- If the custodian and ledger disagree after recovery, the custodian is the source of truth for assets; affected trades are frozen until reconciled.

## Incident response (summary)
1. **Detect & triage** (on-call, severity S1–S4). S1 = funds at risk or data breach.
2. **Contain**: kill switches — disable trading by pausing payment methods (admin), freeze specific trades, suspend accounts, revoke sessions (`logout-all` per user; rotate `TOKEN_SIGNING_KEY` to invalidate all access tokens).
3. **Preserve evidence**: audit log, seals, DB snapshot, provider logs.
4. **Notify**: legal/compliance decide regulator (CMISA), Privacy Protection Authority (data breach under the 2017 Data Security Regulations), IMPA, custodian, affected users — within statutory timelines (counsel to confirm).
5. **Recover & review**: post-mortem within 5 business days; update threat model and tests.

## Data retention
- Identity, transaction, ledger, audit, dispute and chat records: **7 years** after relationship end (AML default — confirm with counsel, REGULATORY-CHECKLIST §2.6).
- Closed accounts: login disabled immediately; marketing data deleted; PII minimised after the retention period by a purge job (to be implemented with counsel's final schedule — see STATUS).
- Sessions, verification tokens, idempotency records, processed outbox rows: purged automatically (hourly job).
