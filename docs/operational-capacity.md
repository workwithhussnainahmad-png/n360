# Operational Capacity Baseline

## Scope

This is a local-development baseline captured on 2026-09-28. It is a diagnostic reference, not a production capacity claim. Production capacity depends on VPS CPU, memory, storage latency, request mix, cache hit rate, external services, and active tenant data.

The current request path is documented in the [project context](../.codex/CONTEXT.md#request-authorization-and-data-behavior): Caddy routes to two Next replicas; application traffic uses PgBouncer transaction pooling; PostgreSQL stores durable state; Valkey serves cache and rate-limit work; email and push work run outside web requests.

## Measured baseline

| Check | Result | Conditions |
| --- | --- | --- |
| `GET /api/health`, warm sequential requests | p50 40.41 ms; range 38.74–49.57 ms | Local server, ten requests; first cold request was 3224.94 ms and is excluded from the warm range. |
| Parent portal, authenticated sequential requests | p50 58.25 ms; range 44.62–70.98 ms; 1,028-byte response | Local server, five requests against the 100-row fixture. |
| Admissions list query | 0.864 ms | PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` with 100 applications and a 30-row page. |
| Admissions count query | 0.082 ms | Same local fixture. |

The admissions plans used sequential scans over 100 rows. This is appropriate at that size; adding an index based on this result would add write cost without a demonstrated read benefit.

## Fixture and repeatability

Run `node --env-file=.env --import tsx scripts/seed-local-performance-fixture.ts` once to create the isolated local fixture: one verified institution, ten classes/sections/subjects, and up to 100 each of staff, students, parents, applicants, admission applications, and refresh-token records where applicable. The script stops if that institution already exists and does not print credentials or tokens.

Use `scripts/measure-local-parent-portal.ts` for the parent-portal sequential measurement. It creates an in-memory access token and closes its database and Redis connections on completion. It is a regression check, not a load test.

## Current operating limits

| Component | Current setting | Operational consequence |
| --- | --- | --- |
| Web replicas | 2 app containers, each `--max-old-space-size=1024` | Leaves a bounded Node heap per web process on the 8 GB target host. |
| PgBouncer | Transaction pool: 25 default + 5 reserve; max client connections: 5000 | Caps ordinary PostgreSQL backend concurrency while admitting short-lived application clients. |
| Application pools | `DB_POOL_MAX=15` per web replica; worker `DB_POOL_MAX=1` | Keep pool totals aligned with the PgBouncer backend ceiling before raising either value. |
| PostgreSQL | 1536 MB shared buffers, 4 GB effective cache, 16 MB work memory, 100 max connections | These settings are sized for the complete 8 GB stack, not a dedicated database host. |
| Valkey | 260 MB, `allkeys-lru` | Cache may evict under pressure; application reads must remain correct on misses. |
| Email | Durable outbox worker | Request completion no longer waits for SMTP. Local processing polls every 10 seconds; the production worker cadence is normally 60 seconds. |

## Monitor and act

| Signal | Investigate | First safe action |
| --- | --- | --- |
| Readiness failures or rising p95 latency | Caddy upstream health, app heap, database wait time, Redis availability | Restore the last known-good application image/configuration, then inspect service logs and resource graphs. |
| PgBouncer clients wait while PostgreSQL is idle | Connection leaks, long transactions, pool settings | Find long transactions first; do not increase PostgreSQL `max_connections` as the first response. |
| PostgreSQL slow queries or growing dead tuples | Missing query bounds, absent selective indexes, autovacuum lag | Capture `EXPLAIN (ANALYZE, BUFFERS)` for the real query and inspect table statistics before changing an index. |
| Node heap near its limit or restart loops | Large request bodies, response retention, cache growth | Identify the request path and cap/bound it; do not raise the heap limit without host-memory evidence. |
| Valkey evictions or memory near 260 MB | Oversized cache values, hot-key churn, incorrect TTLs | Inspect key sizes and TTLs; preserve cache-miss correctness before changing eviction policy or memory. |
| Email outbox age grows | Worker health, SMTP/provider errors, lock contention | Repair the worker/provider path; do not move SMTP delivery back into web requests. |

## Change and rollback procedure

1. Capture one targeted baseline for the affected route, query, or worker before changing it.
2. Change one capacity control at a time and retain its validation output with the deployment record.
3. Compare the same measurement after deployment and watch the relevant signal above.
4. If latency, errors, or resource pressure regress, restore the prior application image or configuration and re-run the baseline check.

Changes to application pool size, PgBouncer pools, PostgreSQL memory, Valkey memory, and Node heap must be based on host-level measurements. Docker currently has no enforced CPU or memory limits in the local compose environment, so this document does not prescribe container limits for production.

## Open operational work

- Capture production p50/p95/p99 latency, error rate, CPU, RSS, database waits, PgBouncer queue depth, and Valkey evictions before setting a throughput target.
- Add monitoring/alert ownership and thresholds using the production observability platform.
- Re-measure the admissions list only after real tenant data makes its current query plan materially expensive.
