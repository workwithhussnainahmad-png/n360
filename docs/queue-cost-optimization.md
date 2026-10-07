# Queue-cost candidate — 2026-10-01

The candidate is built and deployed to both existing Docker app replicas, behind
Caddy on port 3000. Image: `lms-backend-app:queue-cost-candidate`, ID
`sha256:e09d120974a77ec79cb9276b2c21ce00acf3294f8ed80a808daa6cec29b158b9`.
Docker remains four CPUs / 8,328,421,376 bytes. Profiling is disabled. No schema
migration, bulk token generation, production data write or k6 run was performed.
The user will run acceptance tests. Capacity is **not yet certified**.

## Retained runtime changes

1. `src/lib/dashboard-response.ts`: ordinary independent Response bodies now use
   a zero-buffer stream. It encodes UTF-8 only when a consumer actually reads it.
   The direct standalone adapter continues sending immutable JSON strings;
   normal Next/stream consumers still receive the same bytes. This removes eager
   stream pulls/encoding from warm requests. Clone/text/arrayBuffer/Unicode,
   consumed/locked streams, mutable headers and independent body bytes were
   checked. This changes allocation/scheduling work, not response data or caching.
2. `src/lib/cache-scripts.ts`, `redis.ts` and `tracked-dashboard-cache.ts`: an
   atomic Redis script returns an existing payload or acquires its separate
   owner lock. It replaces SET NX + GET during cold fills. A normal cold fill
   uses three cache exchanges instead of four; a polling loser uses one instead
   of two per attempt. The new script cannot mutate payload keys and is recognized
   accordingly by the tracked-cache wrapper. Ownership, expiry, distributed
   single-flight, failure unlock and overwrite protections remain enforced.

Pools, PostgreSQL limits, Redis TTLs, auth freshness, tenant checks, business logic,
HTTP request mix, think time and VM resources were not enlarged or weakened.

## Strict user acceptance gates

All load/spike/stress scenarios now require dashboard p95 <500ms, HTTP p95 <1s,
HTTP p99 <1s, zero HTTP/business failures and 100% checks. The user's latest p99
phrase was incomplete, so the preceding explicit p99 <1s target was retained.
All three requested test targets are 2,000 VUs; scenario defaults remain unchanged
and the commands below set their respective VU overrides explicitly.

Offline gate verification now checks a 2,000-VU peak hold in every scenario.
No latency threshold was relaxed and no think time, request, role or account was
removed. Stress still has the five-minute peak hold; spike still has its normal
one-minute hold and sudden ramp. Increasing spike from the old 1,500 target is
an acceptance change, not a claim that it now passes.

## Verification and measurement

* Normal production Docker build passed Next compilation, full TypeScript and
  227 static pages. No experimental adapter is in the final image.
* Targeted lint and tenant-scope audit passed.
* Disposable Valkey DB15 checks passed for two-process cold-fill coordination,
  owner/loser locks, remote invalidation, tracking reconnect/fallback, original
  expiry, 6,000-entry residency, bounded string retention and background-pool
  isolation. Locks do not flush unrelated warm entries.
* Response and adapter contracts passed. Complete warm authenticated fixture
  checked zero SQL and zero Valkey writes, including hint invalidation/revocation.
* 508 live assertions passed through Caddy across guarded student/staff/institution
  routes, transport security/CORS, query validation and Next fallbacks. Six raw
  HTTP wire checks passed for identity/gzip equality, exact byte lengths and
  gzip refusal. These use prepared tokens and are read-only.
* The new `scripts/verify-capacity-target.mjs` preflight passed: two healthy
  identical images, expected entry point, profiling off, Caddy owns the published
  port and its timing header exists on a live authenticated response. Its
  sanitized runtime/script/token-file fingerprint snapshot is
  `.codex/latest-capacity-environment.json`; tokens and secrets are never printed.
* Isolated Linux response-construction comparison showed roughly 20–29us/call
  for warmed string bodies versus about 7–16us/call for lazy streams. This is one
  cost component, not the total HTTP request CPU or a capacity result.
* Bounded 32-connection, two-identity probes were short and noisy. Original warm
  rounds were 1,477/1,428 req/s with combined app CPU 1.226/1.216ms/request.
  The final candidate's third round was 1,395 req/s with 1.186ms/request. Initial
  candidate rounds were slower during warm-up. These do **not** demonstrate a
  reliable end-to-end throughput improvement or elimination of the 2,000-VU tail.
  See `response-baseline-probe.json` and `queue-cost-candidate-probe.json` in docs.

## Experiments rejected

Caddy GOMAXPROCS=1 reduced its sampled CPU slightly but lowered throughput;
ordinary settings were restored. An additional cached UTF-8/gzip transport path
also did not improve the current small payload fixture; it was removed from
source and is absent from the deployed image. Both temporary overrides were
removed. Experimental image tags and probe JSONs remain as evidence, not the
selected runtime. Do not deploy `cache-transport-candidate` as the final candidate.

## User retest

Run from `D:\lms-backend-tunned\lms-backend`. The two-app stack is already healthy.
Do not start a separate Windows server on port 3000 for this acceptance run.
Run each test separately, allowing recovery and saving its complete summary:

```powershell
$env:TEST_ROLE = 'MIXED'
$env:BASE_URL = 'http://127.0.0.1:3000'
node scripts/verify-capacity-target.mjs
npm.cmd run k6:load -- -e TARGET_VUS=2000 -e DURATION=5m --summary-export=queue-cost-load-2000.json
npm.cmd run k6:spike -- -e SPIKE_VUS=2000 --summary-export=queue-cost-spike-2000.json
npm.cmd run k6:stress -- -e MAX_VUS=2000 -e DURATION=5m --summary-export=queue-cost-stress-2000.json
```

Saved summaries are relative to `k6/`. Keep the workload's existing pacing and
2,500 MIXED tokens. Preserve the preflight snapshot for the matching run. Send
the full results, including dashboard/timetable/secondary, p95/p99, failures,
checks, throughput and proxy_ms. If a scenario fails, use those phase results
before another runtime change; the small probes above are not substitutes.

## Rollback

Prior images were preserved as `lms-backend-app:before-oct1-cache-transport` and
`lms-backend-app2:before-oct1-cache-transport` (the serialized candidate).
Restore their latest tags and recreate only app/app2 with the normal Compose +
k6 overlay to roll back the runtime. Stricter host-side k6 gates remain in source.
The normal Dockerfile can rebuild the selected source; no overlay is required.
