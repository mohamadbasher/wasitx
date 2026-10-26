# Scalability roadmap

## Assumptions (state them, then size)

| | MVP | 10k users | 100k users | 1M users |
|---|---|---|---|---|
| Daily active (10% of registered) | 200 | 1,000 | 10,000 | 100,000 |
| Peak concurrent (10% of DAU) | 20 | 100 | 1,000 | 10,000 |
| Trades / day (≈5% of DAU trade once) | 20–100 | 500 | 5,000 | 50,000 |
| Peak trade starts / min (×4 avg peak hour) | <1 | 2 | 15 | 140 |
| Peak API requests / s (≈0.5 rps per concurrent user) | 10 | 50 | 500 | 5,000 |
| WebSocket connections | 20 | 100 | 1,000 | 10,000 |

Per trade ≈ 60 row writes (trade, ~8 events, ~4 ledger entries/10 lines, audit, outbox, notifications,
system messages) and ≈ 10 KB of row data excluding chat/files. At 50k trades/day: ≈ 3M writes/day
(≈ 35/s average, ≈ 300/s peak) and ≈ 0.5 GB/day — comfortably within one well-sized Postgres primary.
The hot paths are reads (marketplace list, trade page polling) which scale with replicas and caching.

## Performance budgets
- API p95: reads < 300 ms, writes < 800 ms (take offer includes escrow lock in sandbox).
- Web: LCP < 2.5 s on 4G, JS < 250 KB gzipped per route; marketplace updates < 2 s after change.
- Mobile: cold start < 2.5 s on mid-range Android.

## Tiers

### MVP (pilot, sandbox → limited production)
- 2 × API instances (1 vCPU / 2 GB) behind a load balancer; web & admin on a Next.js host/CDN.
- Managed Postgres 16 HA (2 vCPU / 8 GB), daily snapshots + PITR (7 days).
- Redis optional (in-process fallbacks are multi-instance safe, ADR 0007); add for shared rate limits.
- Private object storage with SSE-KMS; CDN + WAF in front of web.
- Rough cost: **$400–700 / month** infrastructure.

### 10,000 users
- 2–3 API instances (2 vCPU / 4 GB); move background loops to a separate *worker* deployment (same image, `JOBS_ENABLED=true` only there; `false` on web-facing pods).
- Postgres 4 vCPU / 16 GB HA + 1 read replica for admin reporting/exports.
- Redis HA (1 GB) for rate limits and the Socket.IO Redis adapter.
- Uptime/latency alerting, log aggregation, error tracking.
- Rough cost: **$1.2–2k / month**.

### 100,000 users
- 4–8 API pods with autoscaling on CPU/latency; dedicated realtime (Socket.IO) pods; 2 worker pods.
- PgBouncer (transaction pooling); Postgres 8–16 vCPU / 64 GB + 2 replicas; route list/stat reads to replicas.
- BullMQ on Redis for notifications and custody instructions (handlers unchanged; outbox feeds queues).
- Cache marketplace first page per (side, payment method) for 1–2 s, invalidated by `ws.offer` events.
- Partition `AuditEvent`, `TradeEvent`, `LedgerLine`, `Message` by month (declarative partitioning).
- Rough cost: **$5–9k / month**.

### 1,000,000 users
- 10–30 API pods; extract **notifications** and **realtime** into their own services consuming the outbox (first two extractions — highest fan-out, least consistency-critical).
- Postgres 32 vCPU / 128–256 GB primary for the money path; replicas for reads; CDC (logical replication) into an analytics warehouse for reporting and fraud models — never run analytics on the primary.
- Multi-AZ everywhere; cross-region encrypted backups; quarterly restore drills.
- Fraud/risk scoring service (rules + ML on device, graph and payment signals).
- Rough cost: **$25–50k / month** infrastructure. Vendor fees (KYC checks, SMS, custody, screening) will likely exceed infrastructure at this scale and must be modelled per active user.

## Practices that make the above possible (already in the code)
- Keyset (cursor) pagination everywhere; indexes for every list filter (see `schema.prisma`), partial index on the open order book.
- Stateless API; sessions in Postgres; idempotent jobs safe on N instances.
- Row-level locks only on the specific offer/trade rows; no global locks on the money path (ADR 0009).
- Rate limits per IP and per user; caps on open offers, tickets, uploads.

## Load testing
`infra/load/market-and-trade.k6.js` — 200 browsing VUs + 10 trading VUs with thresholds matching the
budgets. Run against staging before each tier change; record results in `docs/perf/`.
