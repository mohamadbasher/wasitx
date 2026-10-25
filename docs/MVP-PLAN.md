# MVP implementation plan

Build order follows risk: the money-moving core (state machine, ledger, idempotency, locking) is built
and tested before UI polish. Progress is tracked in [STATUS.md](STATUS.md).

| Phase | Deliverable | Exit criterion |
|---|---|---|
| 1 | PRD, architecture, state machines, schema, routes, regulatory checklist, ADRs | Docs reviewed |
| 2 | Design tokens, Tailwind theme, components, ar/he/en messages, RTL layouts | Every screen renders in 3 locales, light/dark |
| 3 | NestJS foundation: config, Prisma, auth (argon2, sessions, MFA, OTP), RBAC, validation, audit, rate limits | Auth e2e tests green |
| 4 | Offers, take-offer with locking, trade state machine, chat, disputes (sandbox) | Lifecycle + concurrency tests green |
| 5 | Integration interfaces + sandbox adapters: KYC, sanctions, custody, wallet screening, bank reconciliation, SMS, email, push | Adapters swappable by config; production boot guard |
| 6 | Web app connected to API | Full trade completable in browser between two users |
| 7 | Expo app (iOS/Android) on the same API | Login → take offer → complete trade on device/simulator |
| 8 | Admin app: KYC queue, trades, disputes, approvals, risk, revenue, config, audit | Staff can operate a sandbox day |
| 9 | Unit, integration, e2e, security checks, load test script | CI green |
| 10 | Dockerfiles, compose, CI/CD, deployment & store checklists | Documented, reproducible build |

## Launch sequencing after the code

1. Legal opinion & licence path (REGULATORY-CHECKLIST §1) — longest lead time.
2. Contract custodian + KYC provider → implement real adapters against their sandbox APIs.
3. Closed alpha with staff accounts in sandbox; penetration test.
4. Production gates recorded; limited pilot with low limits; scale limits with monitoring data.
