# ADR 0003 — Explicit, shared state machines

**Status:** accepted

**Decision.** Trade, offer, KYC and account transitions are data tables in `packages/shared/src/state-machines`, keyed by (from, action, actor kind). The API executes transitions only via `TradeEngine.transition`, which locks the row (`SELECT … FOR NO KEY UPDATE`), checks the table, applies effects, and writes `TradeEvent` + audit + outbox in one transaction. Clients import the same table only to render available actions.

**Consequences.** Illegal transitions are impossible by construction and covered by unit tests (e.g. no actor can move a paid trade to EXPIRED; no buyer/seller can trigger release).
