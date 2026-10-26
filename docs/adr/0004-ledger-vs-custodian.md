# ADR 0004 — Double-entry ledger, separate from custodian balances

**Status:** accepted

**Decision.** The platform keeps a double-entry ledger of what clients own (available / reserved / escrow / pending withdrawal / fee revenue / custody omnibus). Postgres enforces: entries balance to zero (deferred constraint trigger), balances change only via lines (trigger), client balances never negative (CHECK), rows append-only. The custodian keeps its own books (sandbox: `SandboxCustody*` tables). `ReconciliationService` compares totals, per-client balances, the fee account, and that every escrowed trade has a confirmed hold of equal size.

**Consequences.** The UI shows balances with their source and reconciliation status, never implying the platform holds assets itself.
