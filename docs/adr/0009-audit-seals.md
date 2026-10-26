# ADR 0009 — Audit tamper-evidence via row digests + periodic seals

**Status:** accepted (supersedes the initial synchronous hash chain)

**Context.** The first version chained every audit row to the previous one under a global advisory lock. The concurrency test exposed a deadlock: a trade transaction held an offer row lock while waiting for the audit lock, while the escrow transaction held the audit lock and waited on a foreign-key share lock on the same offer.

**Decision.** Each audit row stores a SHA-256 digest of its canonical content (no lock). A background sealer chains contiguous id ranges of rows older than 60 s (longer than the max transaction time, so no lower id can still commit) onto the previous seal. Rows and seals are append-only by trigger. Verification recomputes digests and seals.

**Consequences.** Auditing no longer serialises financial transactions; the newest ≤ 90 s of events are protected by the append-only trigger before they are sealed.
