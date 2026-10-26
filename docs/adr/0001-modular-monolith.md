# ADR 0001 — Modular monolith

**Status:** accepted · 2026-10-25

**Context.** A pre-launch fintech with a small team needs strong consistency (escrow, ledger, offer quantity) across domains, and fast iteration. Microservices would turn every trade into a distributed transaction.

**Decision.** One NestJS deployable with domain folders (`apps/api/src/modules/*`). Cross-domain side effects go through a transactional outbox. Each domain exposes a service interface; no module reads another's tables directly (enforced in review).

**Consequences.** Single Postgres transaction per state change; horizontal scaling by running more stateless API instances. When a domain needs independent scaling (likely notifications, then messaging), it is extracted behind its existing service interface, consuming the outbox.
