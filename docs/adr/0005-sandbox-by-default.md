# ADR 0005 — Sandbox by default, gated production

**Status:** accepted

**Decision.** `TRADING_MODE=SANDBOX` is the default. Every external dependency is an interface with a clearly named sandbox adapter that throws if invoked in PRODUCTION. The API refuses to boot in PRODUCTION if any adapter is sandbox, dev secrets are present, or any of the eight production gates (licence, AML programme, custody contract, KYC provider, banking, DPO, terms, pen-test) is unrecorded. "real" adapters are deliberately unimplemented until a provider is contracted and its API verified.

**Consequences.** No path to accidental real-money operation; demos exercise every branch.
