# WASIT X

**A supervised peer-to-peer marketplace for trading USDT ↔ ILS in Israel**: web app, iOS/Android app, staff console, and one secure API, built as a TypeScript monorepo.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![Tests](https://img.shields.io/badge/tests-58%20passing-2ea44f)

> **Status: sandbox.** Every flow works end to end, but deposits, escrow, KYC and SMS run against
> simulated providers. The API refuses to boot in production mode until the legal and licensing
> gates in [the regulatory checklist](docs/REGULATORY-CHECKLIST.md) are met.
> What is real and what is simulated is tracked honestly in [docs/STATUS.md](docs/STATUS.md).

## What it does

Buyers and sellers post offers, take each other's offers, and settle through an escrowed trade:
the platform locks the seller's USDT, the buyer pays by bank transfer, and the seller releases.
Staff supervise everything from a separate console: KYC review, disputes, risk flags, approvals.

## Engineering highlights

- **Money is never a float.** All amounts are `bigint` in a shared package, and every movement is
  posted to a **double-entry ledger** whose invariants are enforced by **database triggers**, not
  just application code.
- **Trades are explicit state machines**: escrow pending → awaiting payment → buyer marked paid →
  seller confirmed → release → completed, with dispute, freeze and expiry branches. They are
  defined once in `packages/shared` and enforced by the API. See [STATE-MACHINES.md](docs/STATE-MACHINES.md).
- **Concurrency is tested, not assumed.** An 8-way concurrent "take offer" integration test runs
  against real Postgres. It caught a real deadlock between offer row locks and a global audit
  lock, which was fixed and documented in [ADR 0009](docs/adr/0009-audit-seals.md).
- **Security by design:** mandatory TOTP MFA for staff, refresh-token reuse detection, account
  lockout, encrypted uploads with content sniffing, an append-only audit log with tamper-evident
  seals, and "four-eyes" approval for sensitive staff actions. See the
  [threat model](docs/THREAT-MODEL.md).
- **Trilingual and RTL-first:** Arabic, Hebrew and English across web and mobile, sharing one
  i18n catalogue.
- **Realtime trade rooms:** Socket.IO chat with read receipts, attachments, and rule-based
  detection of scam patterns in all three languages.
- **Documented like a real product:** PRD, architecture, database design, state machines,
  scaling plan, deployment and disaster recovery, and 9 architecture decision records.

## Architecture

```
apps/
  api/      NestJS modular monolith · Prisma · PostgreSQL 16 · Socket.IO
            auth · KYC · offers · trades (engine, escrow, risk) · ledger · disputes
            messaging · wallet · notifications · outbox · admin · jobs
  web/      Next.js · next-intl (ar/he/en, RTL) · Tailwind · Playwright e2e
  admin/    Next.js staff console (separate origin, mandatory MFA)
  mobile/   Expo · Expo Router · secure-store
packages/
  shared/   money math, fees, state machines, permissions, Zod schemas, i18n
  ui/       React design system
  tokens/   design tokens shared by web and React Native
infra/      Dockerfiles, docker-compose, k6 load test
docs/       PRD, architecture, threat model, ADRs, status
```

**Tooling:** pnpm workspaces + Turborepo, Vitest, Supertest, Playwright. GitHub Actions CI runs
typecheck, unit and integration tests against Postgres, web/admin/mobile builds, a dependency
audit, a secret scan and CodeQL.

## Tests

| Suite | What it covers | Result |
|---|---|---|
| Unit (`packages/shared`) | money math, fees, state machines, validators, chat safety | 33 / 33 ✅ |
| Integration (`apps/api`) | full trade lifecycle, insufficient funds, concurrency, against real Postgres | 18 / 18 ✅ |
| End-to-end (`apps/web`) | marketplace in 3 languages, login → take offer → trade room, desktop + mobile viewport | 7 ✅ |

## Run it locally

Requirements: Node 22+, pnpm, PostgreSQL 16 (or Docker).

```bash
pnpm install
pnpm db:start                                   # local Postgres on 127.0.0.1:5544
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
pnpm --filter @wasitx/shared build
pnpm --filter @wasitx/api prisma:deploy
pnpm --filter @wasitx/api build && pnpm db:seed   # sandbox config, staff and demo traders

pnpm --filter @wasitx/api start      # http://localhost:4000/api/v1 · OpenAPI docs at /api/docs
pnpm --filter @wasitx/web dev        # http://localhost:3000/ar
pnpm --filter @wasitx/admin dev      # http://localhost:3001
cd apps/mobile && npx expo start
```

Seeded sandbox accounts use the password `Sandbox-Demo-Pass-2026`: traders `rania@demo.local`,
`yossi@demo.local`, `omar@demo.local`; staff `owner@`, `admin@`, `compliance@`, `disputes@` and
`support@wasitx.local` (staff enrol TOTP on first login). These exist only in your local database.
Sandbox emails and SMS codes appear at `GET http://localhost:4000/api/v1/dev/outbox`.

```bash
pnpm --filter @wasitx/shared test     # unit tests
pnpm --filter @wasitx/api test        # integration tests (database wasitx_test)
cd apps/web && npx playwright test    # browser e2e (API + web running, seeded)
```

## Documents

[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [State machines](docs/STATE-MACHINES.md) ·
[Database](docs/DATABASE.md) · [Routes & screens](docs/ROUTES.md) · [MVP plan](docs/MVP-PLAN.md) ·
[Regulatory checklist](docs/REGULATORY-CHECKLIST.md) · [Threat model](docs/THREAT-MODEL.md) ·
[Security checklist](docs/SECURITY-CHECKLIST.md) · [Scaling](docs/SCALING.md) ·
[Integrations](docs/INTEGRATIONS.md) · [Deployment & DR](docs/DEPLOYMENT.md) ·
[Store submission](docs/STORE-SUBMISSION.md) · [ADRs](docs/adr) · **[Status](docs/STATUS.md)**

---

Built by [Mohamad Basher](https://github.com/mohamadbasher).
