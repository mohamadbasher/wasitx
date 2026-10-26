# WASIT X

Israel-only, supervised peer-to-peer marketplace for **USDT ↔ ILS** — web, iOS/Android, staff console,
one secure API. Brand name is configurable (`BRAND_NAME`, `NEXT_PUBLIC_BRAND_NAME`, `EXPO_PUBLIC_BRAND_NAME`).

> ⚠ **Sandbox only.** No real money, custody, KYC or blockchain transfers until the legal and
> commercial gates in [docs/REGULATORY-CHECKLIST.md](docs/REGULATORY-CHECKLIST.md) are met. The API
> refuses to start in production mode otherwise. See [docs/STATUS.md](docs/STATUS.md).

## Repository

```
wasitx/
├─ apps/
│  ├─ api/        NestJS 12 modular monolith · Prisma 7 · PostgreSQL 16 · Socket.IO
│  │  ├─ prisma/  schema (47 models) + migrations incl. integrity triggers
│  │  ├─ src/modules/  auth · users · kyc · offers · trades (engine, escrow, risk) · ledger
│  │  │                messaging · disputes · approvals · wallet · notifications · outbox
│  │  │                realtime · support · admin · jobs · integrations (sandbox + real adapters)
│  │  └─ test/    integration tests against real Postgres
│  ├─ web/        Next.js 16 · next-intl (ar/he/en, RTL) · Tailwind 4 · Playwright e2e
│  ├─ admin/      Next.js staff console (separate origin, mandatory MFA)
│  └─ mobile/     Expo SDK 58 · Expo Router · use-intl · secure-store
├─ packages/
│  ├─ shared/     money (bigint), fees, state machines, permissions, Zod schemas, validators, i18n catalogues
│  ├─ ui/         React design system (web/admin)
│  └─ tokens/     design tokens (web + React Native)
├─ infra/         Dockerfiles, docker-compose, k6 load test
├─ docs/          PRD, architecture, state machines, database, routes, regulatory checklist,
│                 threat model, security checklist, scaling, integrations, deployment, store, ADRs, status
└─ scripts/       local Postgres helper
```

## Quick start (local)

Requirements: Node 22+ (tested on 24), pnpm 11, PostgreSQL 16 binaries (or Docker).

```bash
pnpm install
pnpm db:start                                  # project-local Postgres on 127.0.0.1:5544
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
pnpm --filter @wasitx/shared build
pnpm --filter @wasitx/api prisma:deploy        # apply migrations (non-destructive)
pnpm --filter @wasitx/api build && pnpm db:seed  # config, staff + demo traders (sandbox)

pnpm --filter @wasitx/api start                # http://localhost:4000/api/v1 · docs at /api/docs
pnpm --filter @wasitx/web dev                  # http://localhost:3000/ar
pnpm --filter @wasitx/admin dev                # http://localhost:3001
cd apps/mobile && npx expo start               # set EXPO_PUBLIC_API_URL to your LAN IP for devices
```

Seeded sandbox accounts (password `Sandbox-Demo-Pass-2026`): traders `rania@demo.local`,
`yossi@demo.local`, `omar@demo.local`; staff `owner@`, `admin@`, `compliance@`, `disputes@`,
`support@wasitx.local` (staff must enrol TOTP on first console login).

Sandbox messages (email links, SMS codes) appear at `GET http://localhost:4000/api/v1/dev/outbox`.

Alternatively: `docker compose -f infra/docker-compose.yml up --build` (not yet verified — see STATUS).

## Tests

```bash
pnpm --filter @wasitx/shared test     # 33 unit tests
pnpm --filter @wasitx/api test        # 18 integration tests (uses database wasitx_test)
cd apps/web && npx playwright test    # browser e2e (API + web running, seeded)
```

## Key documents
[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [State machines](docs/STATE-MACHINES.md) ·
[Database](docs/DATABASE.md) · [Routes & screens](docs/ROUTES.md) · [MVP plan](docs/MVP-PLAN.md) ·
[Regulatory checklist](docs/REGULATORY-CHECKLIST.md) · [Threat model](docs/THREAT-MODEL.md) ·
[Security checklist](docs/SECURITY-CHECKLIST.md) · [Scaling](docs/SCALING.md) ·
[Integrations](docs/INTEGRATIONS.md) · [Deployment & DR](docs/DEPLOYMENT.md) ·
[Store submission](docs/STORE-SUBMISSION.md) · [ADRs](docs/adr) · **[Status](docs/STATUS.md)**
