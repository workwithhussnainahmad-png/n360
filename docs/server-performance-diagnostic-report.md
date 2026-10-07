# Server performance diagnostic report — 2026-10-01

This report inspects the actual source, live containers, effective Caddy/PgBouncer configuration, PostgreSQL catalogs, bounded read-only queries and saved test/profiler evidence. **No fixes, configuration changes, deployments, restarts, migrations, bulk token generation or k6 scenarios were performed.** Only diagnostic scripts and report artifacts were added under `docs/`. Twelve bounded authenticated wire requests were made. Source-handler probes used a separate process with Redis disabled and a read-only PostgreSQL client; they did not disable Redis in either serving process. SELECT/EXPLAIN can warm buffers and increment statistics; these observations are not an untouched replay of the tests.

The supplied acceptance targets are dashboard p95 <500 ms, HTTP p95 <1,000 ms and HTTP p99 <2,000 ms. The existing `k6/config.js` currently sets **p99 <1,000 ms**, a mismatch with this latest requested target. No threshold was edited. All three runs also fail the requested 2,000-ms p99 target.

Evidence scope: current live snapshot starts at **2026-10-01T17:30:06.164Z**; the saved preflight is **2026-10-01T16:16:03.564Z**. The supplied k6 summaries do not identify absolute test start/end times. Older profiles are explicitly labeled historical and are not attributed to these three runs.

Evidence bundle, all relative to this report:

- [Full dashboard handlers and first-party helper source](performance-diagnostic-evidence/full-handler-and-helper-source.md): exact code, including auth/policy/cache/serialization/DB helpers; SHA256 fingerprints per file.
- [Exact generated SQL](performance-diagnostic-evidence/exact-queries.md): 14 executed SELECTs across six source-handler probes, plus conditional SQL with bound parameters.
- [Query capture and all 13 unique JSON plans](performance-diagnostic-evidence/queries-and-plans.json).
- [Three slowest sampled EXPLAIN (ANALYZE, BUFFERS) outputs](performance-diagnostic-evidence/three-sampled-plans.txt).
- [Live schema, every column, constraints and index definitions](performance-diagnostic-evidence/live-schema-and-indexes.md).
- [Live runtime, limits, versions, table sizes, logs and wire measurements](performance-diagnostic-evidence/runtime.json).
- [Effective Caddy JSON](performance-diagnostic-evidence/caddy-effective.json), [effective PgBouncer INI](performance-diagnostic-evidence/pgbouncer-effective.ini), [Windows physical host](performance-diagnostic-evidence/windows-host.json).
- [Supplied test output](performance-diagnostic-evidence/supplied-test-results.txt), [historical 4-core diagnostic summary](performance-diagnostic-evidence/historical-4core-diagnostic.json).

## 1. Stack and runtime

| Component | Verified value | Evidence |
|---|---|---|
| Application language | TypeScript, compiled JavaScript; CommonJS server adapter | `src/app/api/**/route.ts`, `scripts/standalone-server.cjs` |
| Node | **24.21.0** | Live app-container executable |
| Next / React | **16.3.2 / 19.2.4** | Live installed package manifests |
| ORM / PostgreSQL driver / pool | **drizzle-orm 0.45.2 / pg 8.22.0 / pg-pool 3.14.0** | Live installed manifests |
| Source/build dependencies | TypeScript **5.9.3**, ioredis **5.11.1**, jose **6.2.3** | `package-lock.json`; ioredis is bundled and not separately resolvable in standalone container |
| Proxy | **Caddy 2.11.4** | Live `caddy version` |
| Pooler | **PgBouncer 1.25.2**, transaction pooling | Live binary and INI |
| Database | **PostgreSQL 16.15**, x86_64 Alpine | Live `SELECT version()` |
| Cache | **Valkey 8.1.10**, standalone | Live `INFO server`; compatibility string `redis_version:7.2.4` is not its Valkey version |

**Process model:** two replicas, each running one Node serving process and one JavaScript event loop. No PM2, cluster, Gunicorn or uvicorn is used. `docker top` shows **11 OS threads per Node process** at inspection; these are runtime/helper threads, not eleven JavaScript request workers. Both replicas run `node scripts/standalone-server.cjs`. Docker init is a separate PID-1 supervisor. No separate email-worker container is currently running.

Both serving images are exactly `sha256:e09d120974a77ec79cb9276b2c21ce00acf3294f8ed80a808daa6cec29b158b9`; build ID `X3NyTuiKs74AHXAGc-ft3`. Both have `HOT_PATH_LANE=1`, `DB_POOL_MAX=15`, `NODE_OPTIONS=--max-old-space-size=1024`, `KEEP_ALIVE_TIMEOUT=65000`, `NODE_ENV=production` and `DEPLOYMENT_ENV=production`. Profiling/preloader flags are absent. Both are healthy, restart count 0, OOMKilled false.

`scripts/standalone-server.cjs` uses:

```javascript
const server = http.createServer(requestListener);
if (keepAliveTimeout) server.keepAliveTimeout = keepAliveTimeout;
```

Thus configured server keep-alive is **65,000 ms**. A separate `http.createServer()` probe of the same Node binary reports defaults: requestTimeout **300,000 ms**, headersTimeout **60,000 ms**, socket timeout **0**, keepAliveTimeoutBuffer **1,000 ms**, maxRequestsPerSocket **0**. The adapter does not override those properties. Request/header timers concern receiving a request; they are not a 500-ms or 1-s handler execution deadline. Shutdown force-exit timer is **8,000 ms**. The production app heap cap is **1,024 MiB old-space per replica**, not a complete RSS/container memory limit.

**Routing:** eleven exact GET routes use a direct compiled-handler lane, including all six staff/student endpoints in these tests. Other routes, pages and mutations use Next's ordinary handler. This avoids the ordinary Next routing pipeline on successful lane matches but still creates `NextRequest`, runs policy/auth/handler, copies headers and sends the body. Server source snapshots include full dispatch code.

**Reverse proxy:** the live Caddy admin JSON confirms the mounted `Caddyfile.k6` behavior:

```caddyfile
encode zstd gzip
reverse_proxy app:3000 app2:3000 {
    lb_policy least_conn
    lb_try_duration 1s
    lb_try_interval 50ms
    lb_retry_match { method GET }
    transport http {
        keepalive 60s
        keepalive_idle_conns 1024
        keepalive_idle_conns_per_host 512
    }
    header_down X-Perf-Proxy-Ms {http.reverse_proxy.upstream.latency_ms}
    health_uri /api/ready
    health_interval 10s
    health_timeout 10s
    health_fails 2
    health_passes 1
    fail_duration 30s
    max_fails 1
}
```

There is no nginx `worker_connections` setting: this is Caddy/Go. Neither source nor effective JSON specifies an active upstream connection cap, response-header/read/write timeout, request/response buffer limit or custom encode minimum size. The 1-s retry budget is **not a whole-request deadline**, and idle-connection limits are **not active request limits**. Effective-default timeout/buffering values not represented by the admin JSON were not independently reconstructed from Caddy's compiled transport implementation. Brotli is not configured; gzip and zstd are.

**Hosting:** this inspected environment is **local Docker Desktop / WSL2**, kernel `6.18.33.2-microsoft-standard-WSL2`, Docker server **29.8.0**, x86_64, overlayfs. Docker sees **4 CPUs / 8,328,421,376 bytes RAM (7.756 GiB)**, shared by all services. No inspected container has an explicit CPU quota/cpuset, memory limit or PID limit. Windows reports Intel Core **i7-8650U @1.90 GHz, 4 physical cores / 8 logical processors**, **17,052,270,592 bytes physical RAM**. Native Windows k6 and the WSL VM share that physical machine; no exclusive CPU assignment is configured. The cloud production host and its effective specs are unknown; Compose comments mentioning a VPS are not live-host evidence.

## 2. Dashboard endpoint — highest priority

There are two tested dashboard handlers: `src/app/api/student/dashboard/route.ts` and `src/app/api/staff/dashboard/route.ts`. Their **full code and complete first-party helper files** are in the source appendix. Institution/parent/applicant paths exist but are not exercised by MIXED, so this report does not claim their query counts or capacity. Third-party library internals are identified by versions rather than reproduced in full.

**Call path, both roles:** `requestListener` → `handleLane` → compiled `GET` → `withApiPolicy` (strip untrusted session headers; apply CORS after handler) → `requireRole` (declared body limit, `getSessionFromRequest`, role/password/graduate guards) → dashboard handler → `getTenantContext`, `getCachedOrFetch`, `getInstitutionCourseStreamingHint` → `dashboardResponse` → `serializedResponse` → adapter header copy/`res.end`.

Auth calls `verifyAccessToken` → local verified-token memo or `getJwtKey`/`jwtVerify`; `verifyUserExists` → local validity memo, Valkey or `verifyUserExistsInDatabase`; and, for legacy students only, `enrichSession` → cached/uncached student/institution join. Current prepared student tokens all already contain academic claims, so they skip that legacy query. Cookie transport additionally uses `getSessionEdge`; k6 uses bearer transport. GET does not invoke the mutation rate limiter. `measurePerformancePhase` directly calls its operation when no profiler bridge exists.

**Student body:** personal cached aggregate fetch calls `fetchStudentDashboardData` → lazily compiled `prepareStudentDashboard`/`jsonRows`, one SQL statement containing pending-assignment and latest-published-mark subqueries. Active students then fetch today's section timetable and visible announcements concurrently. Student identity data is supplied to `getVisibleAnnouncements`, avoiding its optional identity lookup; `includeReadStatus:false` avoids announcement-read SQL. The separately cached course hint calls `isInstitutionCourseStreamingConfigured`; it only checks credential format through `hasStreamingCredentials`, **not provider API calls or decryption**. Graduates omit timetable/assignments/announcements and return the restricted surface.

**Staff body:** personal cached aggregate fetch calls `fetchStaffDashboardData` → `prepareStaffDashboard`/`jsonRows`, one SQL statement containing identity, today's timetable and up to three future assignments from the first assigned section. Visible announcements execute one SQL query with EXISTS scope predicates; when nonempty, one additional batched announcement-read query runs. Course hint is fetched concurrently with the dashboard payload.

**Actual query counts depend on cache state.** A fully valid, warm auth/dashboard/course path can complete with **zero SQL**; background refresh may issue SQL separately. For fully cold normal active-user requests:

| Query source | Student | Staff |
|---|---:|---:|
| Account validity absent from local/Valkey caches | 1 | 1 |
| Personal aggregate | 1 | 1 |
| Course hint miss | 1 | 1 |
| Today's section timetable miss | 1 | Included in aggregate |
| Visible announcements miss | 1 | 1 |
| Read status for nonempty notices | 0 | 1 |
| Legacy academic enrichment | +1 if needed | 0 |
| Total with empty notices/current claims, all above cold | **5** | **4** |

The source-handler probe returned 200 for both roles with exactly **5 student / 4 staff SELECTs**, using disabled Redis and empty current notices. A nonempty staff notice preview makes its fully cold count **5**. Warm course/timetable/notices reduce counts. This is not a measured cache-hit distribution during the tests.

No application-level N+1 query loop was found in these dashboard paths. Child rows are aggregated inside one statement, and read status uses one `IN (...)` query. Correlated SQL subqueries/EXISTS remain planner work, not a round trip per displayed row. `getVisibleAnnouncements` outside this specific student dashboard can query student scope separately; that fallback is documented in conditional SQL.

**Exact SQL:** `exact-queries.md` contains SQL with `$n` parameters emitted by actual Drizzle execution, including aggregates, announcements, course hint, timetable and account validity, plus both profile queries. For example the shared course-hint miss is exactly:

```sql
select "course_streaming_provider", "course_streaming_credentials"
from "institutions" where "institutions"."id" = $1 limit $2
```

Bound sample parameters: `[2,1]`. Statements are unnamed (`prepare('')`) and compatible with the existing transaction-pooling path; query compilation is reused, but that does not cache SQL results.

**Request work:** SQL/Valkey/network waits use async APIs. Promise.all overlaps independent dashboard/course and child queries. Synchronous work includes JSON.parse/JSON.stringify on misses, array mapping/slicing, dates, name splitting, percentage formatting, request/header construction, Buffer.byteLength and Node response writes. The response helper memoizes decoded JSON (4,096 entries; max 16,384 code units) and encoded variants by object identity; the adapter can send the immutable serialized string directly. Fallback adapter responses use `await response.arrayBuffer()` and Buffer allocation. No external HTTP provider calls, filesystem IO, password hashing, synchronous database calls or long CPU loops were found on successful dashboard GET paths. `fs.readFileSync` in the adapter loads manifests at startup, not per request. These facts do not rule out event-loop overload from the aggregate cost of many small requests.

## 3. Database

App URL host is **pgbouncer:6432**; pooler points to **postgres:5432**, and direct migration URL points to postgres:5432. Both are containers on this same local Docker host/network, not a remote region. Region is inapplicable to this local test path. Host administration reaches PostgreSQL through loopback port 5433.

Eight sequential `SELECT 1` samples from a separate process inside app1 produced:

- Direct PostgreSQL: **13.925, 2.842, 4.635, 1.139, 1.479, 1.330, 0.863, 0.679 ms**.
- Via PgBouncer: **1.827, 1.234, 0.927, 0.671, 0.771, 0.926, 0.670, 0.607 ms**.

These are idle client round-trip/SQL/scheduling measurements after connection establishment, **not isolated network RTT or latency under load**. The first direct sample was much slower than later samples. The source-handler Windows-client elapsed values likewise include scheduling/shared-client waiting and are not pure SQL execution times.

**Live schema and indexes:** the schema appendix enumerates all columns, types, nullability, defaults, constraints and exact CREATE INDEX definitions for every table touched by tested dashboards: institutions, students, staff, staff_assignments, subjects, classes, sections, assignments, submissions, marks, tests, announcements, announcement_reads. It additionally includes campuses for profiles. Source schema is `src/db/schema.ts`; live catalogs are authoritative for installed indexes. Relevant installed/used indexes include:

```sql
-- See appendix for exact complete CREATE INDEX statements.
students_id_institution_unique
staff_pkey
staff_time_slot_unique
staff_assignments_institution_staff_idx
assignments_institution_class_due_idx
submissions_institution_student_idx
marks_institution_student_created_idx
tests_pkey
```

| Table | Exact rows now | Total bytes, including indexes/TOAST |
|---|---:|---:|
| institutions | 1 | 98,304 |
| students | 1,500 | 3,276,800 |
| staff | 1,000 | 868,352 |
| staff_assignments | 1,000 | 376,832 |
| subjects | 10 | 40,960 |
| classes | 10 | 40,960 |
| sections | 100 | 57,344 |
| assignments | **0** | 40,960 |
| submissions | **0** | 32,768 |
| marks | **0** | 32,768 |
| tests | **0** | 57,344 |
| announcements | **0** | 32,768 |
| announcement_reads | **0** | 24,576 |
| campuses (profile) | 1 | 49,152 |

Whole database: **19,151,895 bytes**. Table statistics report zero estimated dead tuples for these tables at inspection. Counts/sizes now do not prove an identical snapshot at test time. The fixture exercises accounts/timetables but not real assignment/mark/notice volume; therefore it is not representative evidence for large production datasets.

**EXPLAIN:** all 13 unique captured SELECT shapes were run with `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` on current data. The three largest execution times in this single idle sample were student aggregate **0.706 ms**, student profile **0.488 ms**, staff aggregate **0.453 ms**. Separate text-plan executions for those same three returned:

| Statement | Planning time | Execution time | Execution shared buffers |
|---|---:|---:|---:|
| Student dashboard aggregate | 2.557 ms | 0.490 ms | 10 hits |
| Student profile | 1.759 ms | 0.529 ms | 8 hits |
| Staff dashboard aggregate | 3.389 ms | 0.797 ms | 10 hits |

The **full EXPLAIN (ANALYZE, BUFFERS) outputs** are in `three-sampled-plans.txt`; all JSON plans are also retained. These are **the three slowest sampled statements, not the three slowest queries during the load tests**. That latter ranking cannot be established: `pg_stat_statements` is not installed, shared_preload_libraries is empty, and log_min_duration_statement is **-1 (disabled)**. The empty child tables sharply limit what these plans demonstrate. Some tiny-table sequential scans occur (e.g. 100 sections); that alone is not evidence of a problematic missing index.

**Connection pools, `src/db/index.ts`:**

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!, max: poolMax,
  idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
  query_timeout: 5000, keepAlive: true,
  application_name: 'nisaab360_api'
});
export const cacheRefreshPool = new Pool({
  ...pool.options, max: 4,
  application_name: 'nisaab360_cache_refresh'
});
```

Per replica: foreground max **15**, refresh max **4**, readiness max **1**. Min is not specified; installed pg-pool default is **0**. Foreground/refresh acquire timeout **5 s**, client query timeout **5 s**, idle timeout **30 s**. Readiness acquire/query timeouts **2 s**, idle **30 s**. Thus two replicas can open **40** configured pg clients, not forty dedicated PostgreSQL backends. No explicit pending-request-count ceiling or overall dashboard deadline is configured. URL `connection_limit=1` is not a pg-pool `max:1` override.

Live PgBouncer: max_client_conn **5,000**, default_pool_size **25**, reserve_pool_size **5**, reserve_pool_timeout **3 s**, query_timeout **10 s**, server_idle_timeout **30 s**, pool_mode **transaction**. This backend capacity is per applicable database/user pool, not necessarily a universal server-wide maximum. PostgreSQL max_connections **100**, shared_buffers **1,536 MiB**, effective_cache_size **4 GiB**, work_mem **16 MiB**, maintenance_work_mem **256 MiB**, idle_in_transaction_session_timeout **60 s**, statement_timeout **0**. PgBouncer ignores startup statement_timeout; app client-side query_timeout is not a PostgreSQL server statement_timeout.

**Slow logs/locks:** no configured SQL duration log or statement statistics ranking exists. Current `pg_locks` has no ungranted locks; this does not rule out transient test-time contention. Retained PgBouncer logs contain four timeout incidents represented by 12 lines on Sept 30 at 22:41:32, 23:18:02, 23:55:02, 23:55:32 UTC; these predate the current app start. They cannot explain the supplied October candidate tests without matched windows. Connection `age=` fields are not query-duration measurements. Latest app logs contain no matching timeout/error entries. No evidence supports claiming PostgreSQL connection exhaustion or disk saturation caused the latest failures.

## 4. Caching

| Layer/data | Policy in actual code |
|---|---|
| Verified access-token memo | Per process, max 4,096; JWT remaining lifetime; exp/nbf checked on hit |
| Account-validity local / Valkey | **30 s / 600 s**, max 4,096 local entries; local/Valkey invalidation helpers |
| Student/staff dashboard payload | Base **45 s**, stored **47–49 s** with jitter |
| Course-enabled navigation hint | Base **45 s**, same jitter |
| Dashboard student daily timetable | Base **300 s**, stored **315–329 s** |
| Full staff/student timetable endpoints | Base **600 s**, stored **630–659 s** |
| Visible notices | Base **180 s**, stored **189–197 s**, role/user/limit-scoped |
| Legacy student enrichment | Base **120 s**, stored **126–131 s**; current test tokens skip it |
| Tracked read-data L1 | **8,192 entries**, **32×1,024×1,024 code-unit** budget, value max **16,384 code units**, local lifetime min(Valkey PTTL, **50,000 ms**) |
| Decoded/serialized payload reuse | Separate decode memo and object-keyed response variants; no independent data freshness guarantee |

Tracked L1 uses Valkey CLIENT TRACKING invalidations and clears on tracking loss. Foreground fills have process-local single-flight plus cross-replica owner locks; Lua ownership/CAS protects stores and refreshes. Background refresh is limited to **4 per process**, uses a separate **4-client DB pool**, and is offered only for base TTL <=60 s when less than ttlSeconds×300 milliseconds remain (**13,500 ms** for dashboards). Per-entry retry cooldown is **1,000 ms**. It does not serve values past their original local expiration.

Critical wait path, `src/lib/redis.ts`:

```typescript
const FETCH_TIMEOUT_MS = 60_000;
const FILL_LOCK_MS = 10_000;
const deadline = performance.now() + FILL_LOCK_MS;
// Within fillCachedValue's loop:
const [cached, acquired] = await redis.eval(CACHE_ACQUIRE, 2,
  key, lockKey, owner, FILL_LOCK_MS) as [string | null, number];
await new Promise(resolve => setTimeout(resolve,
  50 + Math.floor(Math.random() * 50)));
// Repeat while ready and before deadline, then fetch from DB if necessary.
```

The **60-s timeout covers the deduped JSON read/fill operation**, and multiple nested operations/DB acquisition happen in the request path; there is no equivalent short whole-request deadline. Lock polling uses async timers but can hold requests waiting for a shared fill. Under a busy event loop, timers and network completion callbacks can be delayed. **This is a verified mechanism capable of contributing long waits, not proof it produced the 54-s outlier.** Ioredis enables auto-pipelining, offline queue and maxRetriesPerRequest **3**, reconnect delay min(times×50, **2,000 ms**); no per-command deadline is specified here. Latest serving logs do not establish a Redis outage.

Valkey now reports maxmemory **272,629,760 bytes**, allkeys-lru, peak used_memory **47,245,176 bytes**, evicted_keys **0**, rejected_connections **0**, blocked_clients **0**, AOF disabled and snapshot saves disabled. Global keyspace hits **903,308** / misses **396,130** span service lifetime and multiple key families; **they are not dashboard hit rates**, and L1 hits bypass them.

**Change frequency:** no production write-frequency history was supplied, so actual update cadence cannot be determined. In the inspected fixture, assignment/mark/notice tables are empty. Code-derived change triggers include profile/push-token/status changes, assignment/submission changes, mark publication, timetable edits, announcements/read status and course configuration. Timetable is also weekday-dependent. Invalidation calls were found in `src/app/actions/assessment-actions.ts`, `institution-actions.ts`, `src/app/api/institution/timetable/route.ts` and `src/app/api/course-streaming/route.ts`; this is not a certification that every mutation invalidates every nested key.

Dashboard aggregates already support TTL caching and precomputed serialized variants. Further precomputation is technically possible, but a safe freshness interval cannot be selected without update rates and freshness requirements. Auth/ownership/current student membership must be evaluated separately from read-data cache policy. No CDN participates in loopback tests. Live tested responses have **no Cache-Control header**; Caddy has no configured response-cache handler. Public static `/models` headers in next.config.ts do not apply to these APIs.

## 5. Response behavior

Measured one current prepared identity per role, raw HTTP through Caddy (not fetch auto-decompression):

| Endpoint | Identity body bytes | Body bytes with gzip accepted | Actual Content-Encoding |
|---|---:|---:|---|
| Student dashboard | **240** | **240** | absent |
| Staff dashboard | **123** | **123** | absent |
| Student timetable | **1,184** | **297** | gzip |
| Staff timetable | **143** | **143** | absent |
| Student profile | **341** | **341** | absent |
| Staff profile | **170** | **170** | absent |

Compression is enabled and works on the larger timetable; configured compression does not imply every tiny body is encoded. Next `compress:false` delegates compression to Caddy. Brotli is not configured. These are representative sample bodies, not p95 body sizes across all identities or populated production data. Caddy preserves Content-Length for these samples; compressed timetable adds `Vary: Accept-Encoding` alongside Origin.

Dashboard caps: student pending assignments **5**, latest mark **1**, notices **2**; staff assignments **3**, notices **3**. Today's dashboard timetable has a weekday predicate but **no explicit LIMIT**. Full timetable endpoint has neither pagination nor a row limit; it returns all assigned periods for the selected staff/section. Schema scheduling constraints and current data constrain the sample, but the code itself is not a paginated collection API.

No per-row SQL fetch or oversized fixture response was found. Personal aggregates project selected columns. Notice queries use `db.select()` and retrieve all announcement columns even though response previews use a subset; the staff read-status query likewise retrieves all read columns. Course hint selects encrypted credential text only to test its prefix. These are concrete over-fetching sites; none has been measured as a material bottleneck, and current notices are empty. Plain profile GETs project fields and do not fetch student catalog/staff campuses; those require `include=catalog` / `campuses=1`, absent from these scripts.

## 6. Behavior under load

**Supplied runs:** all completed with zero reported HTTP/business failures and all status checks passing. Failures are latency thresholds. Business checks are principally response-status assertions, not exhaustive semantic correctness. Slow responses were successful, so maximum latency does not by itself demonstrate a timeout error, OOM or worker failure.

| Test | Requests | Average req/s | Dashboard p95 | HTTP p95 | HTTP p99 | Max |
|---|---:|---:|---:|---:|---:|---:|
| Load | 517,332 | 956.065551 | 1,154.0053 ms | 1.28 s | 2.40 s | 14.40 s |
| Spike | 102,836 | 513.903987 | 3,518.61345 ms | 3.51 s | 7.90 s | 54.17 s |
| Stress | 892,896 | 743.903117 | 1,465.47122 ms | 1.46 s | 3.31 s | 33.41 s |

The current summaries include proxy timing:

| Test | Mean HTTP ms | Mean proxy-upstream ms | Outside-proxy p95 ms |
|---|---:|---:|---:|
| Load | 421.58 | 361.771779 | 244.795317 |
| Spike | 1,091.17 | 962.036040 | 441.006463 |
| Stress | 549.80 | 440.962840 | 431.410294 |

Most mean elapsed time lies in the proxy-upstream interval. That measures dialing/upstream communication/waiting for app headers, **not Caddy-only CPU or SQL duration**. Outside-proxy values are derived approximations and are not a clean measurement of generator CPU or network RTT. Percentiles from different request populations cannot be added/subtracted to reconstruct a request.

**Which limit hits first in these runs? Unknown.** No synchronized CPU/RAM/event-loop/pool/IO traces for these three runs were supplied or found. Current idle `docker stats` cannot answer that question. Healthy current containers, zero current restarts and no OOMKilled flag are useful observations, not a complete test-time resource trace.

**Retained live logs:** current app1/app2 each contain four startup lines, no pool/query/RBAC/profile/Redis error lines. Their starts are 16:02:28.301 / 16:02:27.543 UTC on October 1. Caddy's one connection-refused entry is a readiness probe at **15:58:34.493 UTC**, before those app starts; it is not evidence of a test request failure. PgBouncer timeout incidents are historical Sept 30 records, described above. Caddy access logging is not enabled in the effective test config. No current request-level traces correlate the long successful responses with cache locks or SQL calls.

**Historical measurements, a different run/build with profiling enabled:** `.codex/performance/run-2026-09-30T21-34-42.508Z` contains both app JSONL traces, V8 `.cpuprofile`, native k6 output, Docker stats, PostgreSQL and PgBouncer snapshots. That 2,000-VU run reported HTTP p95 **3.90 s / p99 6.84 s**, so it is not the supplied candidate run.

| Historical peak-window metric | App1 | App2 |
|---|---:|---:|
| Median event-loop utilization | **1.000000** | **0.999829** |
| Median interval loop p95 | **295.436287 ms** | **287.309823 ms** |
| Largest interval loop delay in analyzed peak windows | **895.483903 ms** | **823.656447 ms** |
| Largest foreground pool waiter count in analyzed peak windows | **299** | **297** |
| Maximum RSS in analyzed windows | **349.55 MiB** | **347.50 MiB** |

The historical k6 phase headers report DB acquisition wait median **2,067.4075 ms**, p95 **4,208.69875 ms**; client query/completion interval median **25.7595 ms**, p95 **180.2219 ms**. All **55** PgBouncer snapshots had **zero waiting clients**; maximum active backends **17**, below default pool 25. Snapshot spacing does not rule out brief intervening waits. Median sampled Caddy CPU was **86.47% of one core**, PostgreSQL **57.37%**, Valkey **3.67%**. App peak-interval CPU from process counters was about **63.69%** per replica despite almost completely busy loops; that is compatible with scheduling/VM competition and is not proof of a specific host scheduling cause.

Historical V8 self samples include `writeUtf8String` **9.31% / 9.27%**, `writev` **5.89% / 6.10%**, GC **2.76% / 2.69%**, plus request adaptation, task queues and instrumentation. Profiles were taken with a **10,000-us** sampling interval. They do not prove that JSON.stringify or GC dominates current candidate latency. Diagnostic phase values include client scheduling and conditional populations, and background refresh can inherit phase context. They are not pure server SQL timings and cannot be summed into a serial request budget.

The installed `pg-pool/index.js` releases a client in its query callback:

```javascript
client.query(text, values, (err, res) => {
  // ...
  clientReleased = true
  client.release(err)
  // ...
  return cb(undefined, res)
})
```

An application event-loop delay can therefore postpone completion/release even when PostgreSQL has completed work. **Historical app-side pool queues alongside no sampled PgBouncer queue support this mechanism. They do not establish it as the exact cause of every current outlier.** No current APM traces, Caddy pprof, host scheduler trace or per-request timeline for the three supplied runs exists in the evidence bundle.

## 7. Test setup

Native Windows **k6 v2.3.0**, launched by `k6/run.mjs`; host loopback URL **http://127.0.0.1:3000** reaches Caddy and both Docker replicas. The generator is outside Docker but **on the same physical machine**, not an independent load-generator host. It shares the Windows physical CPUs with WSL while sitting outside the four-CPU Docker VM budget. Exact generator CPU utilization during these runs is unmeasured.

`k6/lib/tokens.js` loads pre-issued tokens and MIXED randomly selects a student/staff token **every iteration**. Current token file contains **1,500 student / 1,000 staff / 1 institution**; MIXED uses **2,500** and excludes institution. Expected random mix is 60% student /40% staff; measured role proportions are not provided. VUs are concurrent script users, not 2,000 guaranteed distinct accounts. No login requests, writes, payments, parent/applicant/institution portals, SSR pages or exports are in this MIXED workload.

| Scenario | VUs/ramp and duration | Requests per iteration | Think time |
|---|---|---|---|
| Load | 1m to 400; 2m to 2,000; 5m hold; 1m down; nominal **9m** | Dashboard; timetable when `__ITER % 5===0`; profile when `%11===0`, sequential | **1.5 s** default |
| Spike | 30s to 20; 10s to 2,000; 1m peak; 10s to 20; 1m low; 30s down; **3m20s** | Dashboard only | **0.3 s** |
| Stress | 1m to20; 2m each to50/100/150/200/300/2,000; 5m peak; 2m down; **20m** | Dashboard only | **0.5 s** default |

Load optionally requests unread count every seventh iteration only if INCLUDE_UNREAD=true; the supplied run contains no unread trend/check evidence. THINK_SEC can override load/stress; complete inherited shell environment at execution was not saved. Initial iteration zero also triggers timetable/profile calls. Load/stress setup performs one health request; spike does not. Graceful ramp-down is 30s load /1m stress; spike does not specify it in source. The report gives nominal stages, not an inferred engine default.

These are closed-loop ramping-VU tests: a delayed response postpones that VU's next request. At zero response time, peak dashboard pacing ceilings would be roughly load **1,333/s**, stress **4,000/s**, spike **6,667/s**; load additionally makes secondary requests. These are **not measured arrivals or sustainable capacity**. Whole-run average requests/s includes ramps and recovery, so 514 spike req/s is not an independently measured maximum server throughput.

Local app flags are production, but this is a local demo/test deployment, not evidence of production-host parity. The production CPU architecture, dedicated/shared resources, network, disk, dataset and users cannot be determined from these tests.

**Other endpoints contributing to load tails:**

| Endpoint group | p95 | p99 | Source behavior |
|---|---:|---:|---|
| Dashboard | 1,154.0053 ms | 2,536.30057 ms | Cached aggregates, conditional cold/refresh paths |
| Timetable | **1,352.39855 ms** | **1,923.481112 ms** | Student always fresh membership SQL; timetable data cached |
| Profile/secondary | **1,518.54098 ms** | **2,056.557507 ms** | Both profiles always fresh SQL; no catalog/campus option |

Thus profile and timetable independently miss the 1-s p95 target. Profile also misses the requested 2-s p99 target; timetable's own aggregate p99 remains below 2s. These trends combine roles and do not identify whether student or staff is worse. Global p95/p99 cannot be assigned to one endpoint solely from endpoint percentiles. Spike/stress exercise only dashboard, so secondary endpoints cannot explain their failures.

## Ranked suspected bottlenecks

1. **Application completion/event-loop capacity and request queueing.** Highest evidence-supported suspicion: latest requests spend most mean time in the upstream path; all workloads show long successful tails; historical profiles directly show almost completely busy app loops with hundreds of app-side DB waiters. pg-pool releases clients through loop callbacks, providing a concrete coupling between scheduling delay and pool availability. Current exact first saturation point and its CPU/scheduler cause remain unmeasured. This is a ranked diagnosis, not a proven current root cause.
2. **Cache-fill waiting and refresh churn amplifying overload.** Verified 10-s owner-lock polling, 60-s single-flight timeout, short dashboard TTLs, no serving beyond expiry and multiple nested cache paths create opportunities for long waits/foreground refills. There are 2,500 randomly revisited identities across two separate local caches. Current cache-hit/miss, waiter duration and refresh completion rates were not captured, so the contribution cannot be quantified. No evidence establishes a latest Redis outage or memory eviction problem.
3. **Shared physical-host/WSL/proxy transport cost.** Native generator and Docker services share a four-physical-core mobile CPU; Caddy is a real added serving stage. Historical Caddy CPU and app write/adaptation samples show meaningful transport work. No exclusive core assignment, current host utilization, throttling/thermal/scheduler trace or matched direct-versus-Caddy run exists. This supports investigating competition; it does not prove Caddy alone causes the tails.
4. **Foreground pool waiting on necessary uncached reads.** Both profiles always query SQL; student timetable always queries current membership; cold dashboards issue 4–5 queries. Foreground client cap is 15 per app, independent of pooler backend availability. Historical pool waiting is measured; current pool hold/acquisition distributions are missing. Increasing connection count is not justified as a diagnosis or fix by these data alone.
5. **SQL plans, locks, memory/IO exhaustion.** Lower-supported current explanations: all 13 idle sampled SELECTs execute in under 1 ms, key business tables are empty, current locks are granted, Valkey has zero evictions and apps have no retained OOM/restart evidence. Production-volume SQL costs, transient locks, disk latency and latest peak RAM cannot be excluded without matching telemetry. Do not invent a missing-index or OOM explanation.

The zero-error results do not negate queueing; successful requests can wait many seconds before returning. Conversely, **a 14–54-s maximum alone does not prove resource exhaustion, a SQL timeout or a 54-s database query**. Verified time-budget/wait mechanisms and historical saturation evidence narrow the investigation, but no synchronized latest request trace proves the causal sequence.

## Undetermined items and evidence needed

| Cannot determine from existing evidence | What would establish it |
|---|---|
| Which resource saturates first in these three runs | Their UTC start/end times and synchronized app CPU/ELU/loop-lag, DB pool occupancy/wait/hold, cgroup/host CPU/RAM/IO/network and generator CPU samples |
| Exact cause of the 14.4/54.17/33.41-s outliers | Per-request proxy/app arrival, auth/cache hit, lock wait, SQL acquire/execute/release, headers/body timestamps with request IDs |
| Three slowest SQL queries during load | Test-window statement statistics or SQL duration logs/traces, plus representative bound parameters; currently disabled/unavailable |
| Actual dashboard L1/Valkey hit rates, fill sharing and refresh throughput | Per-key-family/per-replica counters and wait/refresh histograms during the same tests; global Valkey hits/misses are insufficient |
| Transient lock waits, disk/thermal/host scheduling pressure | Matching pg_stat_activity/pg_locks sampling, disk latency/cgroup pressure, host CPU frequency/scheduler/thermal measurements |
| Endpoint/role contribution to global tails | Per-request metrics tagged by endpoint and role, with peak-window distributions |
| Production update rates or a safe additional cache TTL | Production mutation/event rates and agreed freshness requirements, including profile, marks, timetable, notices and authorization changes |
| Production parity or large-dataset behavior | Actual production deployment/config/resource fingerprints and populated representative data |
| Historical fast suite's port owner/topology | Its listener PID/image/proxy/environment snapshot; absent, user does not remember |
| Unspecified Caddy transport defaults as compiled | Version-matched transport implementation/default inspection; effective JSON only establishes explicitly represented settings |

No load test or profiling mode was enabled to fill these gaps. They are the missing inputs to a causal diagnosis, not a recommendation to apply speculative configuration changes.
