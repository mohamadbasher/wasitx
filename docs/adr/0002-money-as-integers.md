# ADR 0002 — Money as integer minor units

**Status:** accepted

**Decision.** All amounts are `bigint` minor units: micro-USDT (6 dp, matching the token), agorot (2 dp), price in 1/10,000 ₪. Wire format is decimal strings. Conversions in `packages/shared/src/money.ts` with documented rounding: fiat = half-up; fiat→USDT = round down (never over-credit).

**Consequences.** No floating point anywhere in accounting; DB columns are `BIGINT`; JS `Number` appears only for display-only charts.
