# ADR 0007 — DB-backed background work (Redis optional)

**Status:** accepted

**Decision.** Outbox events are claimed with `FOR UPDATE SKIP LOCKED`; escrow operations with a lease column (`nextAttemptAt`) and an attempt counter incremented *before* calling the custodian; expiries go through row-locked transitions. This is safe on N instances without Redis. Redis (when `REDIS_URL` is set) backs shared rate limits now and can back BullMQ / Socket.IO fan-out later without changing handlers.

**Consequences.** One less moving part at MVP; queue latency ~1 s via in-process kick + polling.
