# Measured optimization experiments — October 1, 2026

Targets: dashboard p95 <500 ms, HTTP p95 <1000 ms, HTTP p99 <2000 ms, zero HTTP/business errors, all checks pass. DB_POOL_MAX remains <=15. Every active performance change gets the same MIXED 2000-VU load scenario (original ramps, 5-minute hold, 1.5-second think time). No latency improvement is claimed until the corresponding test completes.

**Final outcome, October 2 local time:** two measured optimizations are implemented and deployed, but strict 2000-VU acceptance is **not achieved**. Final load passes both overall HTTP latency gates; spike fails all latency gates; stress passes p99 only. Dashboard p95 fails in all three. Every final HTTP/business/check assertion passed. See the final acceptance section below for exact results and evidence. The older `server-performance-diagnostic-report.md` remains an unchanged pre-optimization snapshot.

The newly supplied guide authorizes agent-run k6, fixture seeding, local instrumentation and a temporary three-replica comparison; this supersedes the earlier user-run-only checkpoint for this task.

## Local hygiene and limitations

Windows k6 is pinned to logical CPUs **6–7 (mask 0xC0)**. Windows accepted the affinity assignment. `.wslconfig` already contains processors=4 and memory=8GB. Assigning vmmemWSL to logical CPUs 0–5 returned **Access is denied**. Consequently exclusive k6/WSL host-core partitioning is **not established**; processors=4 only controls virtual CPU count. No unrelated processes or WSL distributions were terminated. Thermal/background-load/SMT competition remains possible. The original full scenarios are preserved.

## Results ledger

| Change | Before | After | Decision |
|---|---|---|---|
| k6 affinity, three baseline repetitions | Supplied unpinned load: dashboard p95 1154 ms; HTTP p95 1280 ms/p99 2400 ms; max 14400 ms; 956 req/s | Raw evidence under test-results/experiments/2026-10-01T17-58-01-673Z-baseline-affinity | Hygiene control; supplied run is not a matched baseline |
| Baseline repetition 1 | Same image/script/dataset | Dashboard p95 **1053.64 ms**; HTTP p95 **1101.65 ms**, p99 **2419.04 ms**; max **22198.20 ms**; **964.27 req/s**; zero HTTP errors | Fails all latency gates |
| Baseline repetition 2 | Same image/script/dataset | Dashboard p95 **887.22 ms**; HTTP p95 **995.56 ms**, p99 **1823.16 ms**; max **7111.93 ms**; **994.13 req/s**; zero HTTP errors | Fails dashboard gate |
| Baseline repetition 3 | Same image/script/dataset | Dashboard p95 **880.48 ms**; HTTP p95 **923.13 ms**, p99 **1700.93 ms**; max **10383.12 ms**; **999.37 req/s**; zero HTTP errors | Fails dashboard gate |
| Populated control with Windows access-log bind mount | Native path disabled, populated data, corrected observer | Dashboard p95 **2879.21 ms**; HTTP p95 **2873.58 ms**, p99 **3274.17 ms**; max **6462.53 ms**; **519.80 req/s**; zero errors | Completed logging-topology control; only one complete sample |
| Move only Caddy access-log storage to Linux volume, repetition 1 | Above control; same apps/config/log format/workload | Dashboard p95 **1546.00 ms**; HTTP p95 **1845.31 ms**, p99 **3018.40 ms**; max **10483.88 ms**; **874.20 req/s**; zero errors | Keep Linux storage for measurement; p99 gain unproven, max worsened; acceptance still fails |
| Linux-log control repetition 2 | Same image/script/data/topology | Dashboard p95 **1516.95 ms**; HTTP p95 **1697.95 ms**, p99 **2932.37 ms**; max **8909.69 ms**; **881.89 req/s**; zero errors | Matched control repetition; all latency gates fail |
| Linux-log control repetition 3 | Same image/script/data/topology | Dashboard p95 **1548.11 ms**; HTTP p95 **1821.54 ms**, p99 **2942.06 ms**; max **8211.26 ms**; **870.36 req/s**; zero errors | Matched baseline complete; all latency gates fail |
| Native synchronous warm dashboard envelope | Populated baseline means: dash 1537.02; HTTP p95 1788.27/p99 2964.28 ms; 875.48 req/s | Dashboard p95 **1243.12 ms**; HTTP p95 **1252.81 ms**, p99 **2054.96 ms**; max **8217.90 ms**; **924.54 req/s**; zero errors | **Kept**: dash −293.90 ms, HTTP p95 −535.46/p99 −909.31 ms; gains exceed baseline ranges; all latency gates still fail |
| Defer NextRequest on audited bearer GET fallbacks | Native-only run above | Dashboard p95 **976.50 ms**; HTTP p95 **963.50 ms**, p99 **1419.88 ms**; max **4561.43 ms**; **977.64 req/s**; zero errors | **Kept**: dash −266.62; HTTP p95 −289.31/p99 −635.09 ms, beyond control ranges; HTTP gates pass, dashboard fails |
| Cache UTF-8 Content-Length per body variant | Native + deferred request above | Dashboard p95 **1514.27 ms**; HTTP p95 **1549.43 ms**, p99 **3277.65 ms**; max **12208.07 ms**; **897.80 req/s**; zero errors | **Reverted**: no measured gain; worse tails. Single run does not establish that byte-length caching itself caused the regression |
| Bypass Caddy, both app replicas directly | Kept native + light via Caddy: dash 976.50; HTTP p95 963.50/p99 1419.88 ms | Dashboard p95 **578.48 ms**; HTTP p95 **564.81 ms**, p99 **1016.44 ms**; max **4833.49 ms**; **1148.39 req/s**; zero errors | Diagnostic topology only; dash −398.02, HTTP p95 −398.69/p99 −403.44 ms, beyond control ranges. Dashboard still fails; do not silently deploy without proxy |
| Caddy encode minimum_length 1024 | Kept native + light via Caddy above | Dashboard p95 **1000.07 ms**; HTTP p95 **986.78 ms**, p99 **1397.11 ms**; max **3298.09 ms**; **968.53 req/s**; zero errors | **Reverted**: dashboard worsens 23.58 ms; p99 gains 22.77 ms, both smaller than matched control ranges. No compression negotiated by this workload |
| Disable proxy diagnostic observer (access logs + timing header) | Kept native + light via Caddy above | Dashboard p95 **1007.49 ms**; HTTP p95 **1017.65 ms**, p99 **1635.45 ms**; max **6233.90 ms**; **980.75 req/s**; zero errors | **Rejected as a speed improvement**: dashboard/p95 deltas are noise; p99 worsens beyond control range. Diagnostic config restored for subsequent comparisons; final production hygiene still disables observers |
| Rebuilt native + light control, candidates disabled | Earlier retained run: dash976.50; HTTP p95 963.50/p99 1419.88 ms | Dashboard p95 **972.03 ms**; HTTP p95 **956.47 ms**, p99 **1359.10 ms**; max **3061.55 ms**; **978.10 req/s**; zero errors | Reproduces retained result within control ranges; reference for subsequent candidate comparisons |
| Two-second read fill joins/polling | Rebuilt control above | Dashboard p95 **936.52 ms**; HTTP p95 **927.27 ms**, p99 **1306.85 ms**; max **3759.88 ms**; **983.23 req/s**; zero errors | **Provisional only**: dashboard gain35.51ms narrowly exceeds31.16ms range; no two-second fallback recorded, so causal gain unproven. Paired repeat required before final selection |
| Narrow visible-notice/read projections | Same provisional wait setting: dash936.52; HTTP p95 927.27/p99 1306.85ms | Dashboard p95 **990.03 ms**; HTTP p95 **972.78 ms**, p99 **1430.54 ms**; max **4543.68 ms**; **967.16 req/s**; zero errors | **Reverted**: dashboard +53.51ms, p99 +123.69ms and throughput −16.06/s exceed respective control ranges. Single-run regression does not prove narrower SQL itself caused it |
| Course navigation hint as SQL boolean | Same provisional wait setting above | Dashboard p95 **1165.69 ms**; HTTP p95 **1179.82 ms**, p99 **2310.96 ms**; max **8042.30 ms**; **928.16 req/s**; zero errors | **Reverted**: no measured gain; all three latency gates fail. Infrequent query change is not established as the causal source of this regression |
| Today's student timetable LIMIT64, full read on overflow | Same provisional wait setting above | Dashboard p95 **1053.32 ms**; HTTP p95 **1039.15 ms**, p99 **1464.14 ms**; max **3026.31 ms**; **958.95 req/s**; zero errors | **Reverted**: no percentile/throughput gain; complete row contract preserved during the experiment |
| Paired repeat: original wait control | Native + light, all smaller candidates disabled | Dashboard p95 **923.43 ms**; HTTP p95 **919.10 ms**, p99 **1300.11 ms**; max **3382.79 ms**; **986.97 req/s**; zero errors | Final two-app reference before replica experiment |
| Paired repeat: two-second fill wait | Paired original-wait control above | Dashboard p95 **1216.01 ms**; HTTP p95 **1184.40 ms**, p99 **2198.17 ms**; max **6753.73 ms**; **935.60 req/s**; zero errors | **Reverted**: initial marginal gain did not replicate; all three percentiles and throughput regress beyond control ranges. No smaller candidate remains selected |
| Three replicas within the same four-CPU VM | Two-app reference above: dash923.43; HTTP p95 919.10/p99 1300.11ms | Dashboard p95 **1214.02 ms**; HTTP p95 **1194.13 ms**, p99 **1622.87 ms**; max **3557.94 ms**; **919.75 req/s**; zero errors | **Reverted**: worse percentiles/throughput; third process removed, proxy restored to two apps |

Baseline range divided by mean: dashboard p95 **18.41%** (173.16 ms range); HTTP p95 **17.73%** (178.52 ms); HTTP p99 **36.25%** (718.11 ms); req/s **3.56%** (35.09/s). This is a three-run empirical range, not a confidence interval. Initial runner result.json files incorrectly labeled the successful-request count as failures and omitted the exit code. Raw summaries and normalized-result.json are authoritative; all three report zero errors. The exporter is corrected for subsequent runs.

Empty-data baseline and populated-fixture baseline are separate; their differences cannot be attributed to a code change. Measurement/data controls: PostgreSQL pg_stat_statements enabled; slow logging 100 ms; fixture inserted 10,000 assignments, 15,000 submissions, 3,000 tests, 45,000 marks, 3,500 notices and 10,000 notice reads. Manifest `.codex/performance-populated-fixture.json` records inserted IDs. No identities/tokens changed. Idle source-handler capture: 15 SELECTs, 14 unique plans; top execution samples student aggregate **1.911 ms**, staff aggregate **1.241 ms**, staff timetable **0.539 ms**. Dashboard sample bodies 1923/2433 bytes. See performance-experiments/populated-queries-and-plans.json. These do not establish SQL duration under load.

**Matched populated baseline variance:** dashboard p95 mean **1537.02 ms**, range **31.16 ms / 2.03%**; HTTP p95 mean **1788.27 ms**, range **147.37 ms / 8.24%**; HTTP p99 mean **2964.28 ms**, range **86.03 ms / 2.90%**; req/s mean **875.48**, range **11.53 / 1.32%**. Max latency range **8.21–10.48 s**. Use this cohort for native-path comparisons, rather than the empty-data results.

## Fixed-arrival control checks

Dashboard-only MIXED requests with 2000 preallocated/max VUs, **two-minute** constant-arrival stages, no think time, unchanged strict latency gates and an extra dropped-iterations gate. These are short exploratory capacity checks, not substitutes for the full load/spike/stress acceptance scenarios. Cache state is not flushed; starts are explicitly labeled. End-to-end req/s includes completion/graceful-stop time.

| Offered rate | Dashboard/HTTP p95 ms | HTTP p99 ms | Max ms | Completed req/s | Decision |
|---|---:|---:|---:|---:|---|
| 400/s, after quiet interval | 4720.78 | 10141.75 | 12272.98 | 395.06 | Fails, including dropped iterations; cold refill burst |
| 600/s, shortly after 400/s | 224.83 | 781.05 | 1994.57 | 599.97 | All strict gates passed |
| 800/s, shortly after 600/s | 902.36 | 3007.10 | 8151.13 | 795.79 | Dashboard/p99/dropped gates failed |
| 1000/s, shortly after 800/s | 1875.74 | 5391.84 | 17215.38 | 986.15 | Dashboard/p95/p99/dropped gates failed |

The 400/s run's whole-window median app ELU was about **0.41**, but cold-start pool queues reached **676/728**, and k6 exhausted its 2000-VU allocation. It is not evidence of a universal 400/s steady-state cap. Warm and cold capacity differ. A single two-minute passing rate does not establish long-run production capacity or a precise saturation knee.

Completed/dropped arrivals: 400/s **47,412 / 589**; 600/s **72,001 / 0**; 800/s **95,502 / 498**; 1000/s **118,605 / 1,396**. All completed responses passed HTTP/status checks. Dropped arrivals are missing offered work, not HTTP errors; zero errors must not hide them.

## Native-path measurement

`HOT_PATH_NATIVE_WARM=1` enables only successful fully warm student/staff dashboards. Compiled GET callbacks were verified present in the actual image. JWT memo expiry/nbf and existing account-validity memo deadlines are retained; cookie/legacy/miss/denial paths use the ordinary guarded GET. The callback strips session headers, applies identical role/password/graduate guards and CORS, and reads the original tracked L1/refresh policy. No expired data is served. Native headers are per request; payload strings reuse the existing immutable response variants. SQL-backed profile/membership reads remain fresh.

Peak native-run median ELU **0.955/0.960**, median interval loop p95 **101.78/102.69 ms**, median foreground waiters **4/6**, maxima **196/231**. Compared with control median ELU 1.00, loop p95 ~150 ms and median waiters 74–102, these are improvements; individual largest lag samples worsened, so no blanket maximum-lag improvement is claimed. Mean HTTP **471.42 ms**, proxy **266.08 ms**, derived outside-proxy wait **204.35 ms**. Larger outside-proxy delay than the Linux-log control warrants the planned proxy comparison. First sustained ELU pressure at **141.45/153.19 s**, pool waiting at **158.85/158.48 s**. Peak RSS **345.47/350.40 MiB**.

The matched control used the Docker CLI stream; the native run uses the calibrated Engine stream for timestamped one-second container samples. App observer, sanitized access-log policy, generator affinity, data, strict scenario/stages and pool limits are identical. This collection change is explicitly disclosed rather than attributed to application speed.

`HOT_PATH_LIGHT_REQUEST=1` defers NextRequest adaptation on the six audited GETs with bearer credentials. Standard Headers and URL preserve query/header behavior; a proxy constructs the full NextRequest if another Request property is accessed. Cookie/non-bearer paths construct it immediately. Full handler auth, SQL, CORS and response behavior are retained. After this second kept change, peak median ELU **0.925/0.932**, median interval loop p95 **74.06/75.69 ms**, median foreground waiters **0/0**, maxima **92/74**. Caddy median CPU **113.07%** of one core, PostgreSQL **73.26%**, app CPUs **53.44/54.84%**, generator **86.62%** with p95 **181.56%**. These percentages cannot be added to prove an exclusive physical-core cap because WSL/k6 are not isolated. Captured SQL counter-delta mean execution: student aggregate **6.59 ms**, staff aggregate **4.95 ms**, student profile **2.03 ms**; planning time not collected. Largest SQL execution maxima in the snapshot are cumulative across runs, so they are not attributed to this run.

Cached Content-Length failed its full-load measurement and is disabled in the serving containers; its source feature has been removed. The historical candidate image/summary preserve the experiment. Full production build/type checking and its Unicode/body-variant contract checks passed before the performance rejection. Test archives are excluded from the Docker build context.

Proxy bypass uses loopback ports 3001 and 3002, with 1000 VUs assigned to each. Request mix, pacing, identity selection, total VUs and two-process capacity are unchanged. Fixed per-VU assignment differs from Caddy least-connections routing, and upstream headers/proxy diagnostics are absent. This is therefore an end-to-end topology comparison, not an isolated Caddy CPU microbenchmark. Both app loops still reached saturation: peak median ELU **0.971/0.970**, interval loop p95 median **59.83/64.32 ms**, foreground waiters median **0/0**, maxima **185/179**. Caddy median CPU **0.003%** (idle), apps **67.94/68.00%**, PostgreSQL **91.73%**, generator **104.93%** of one core. Aggregate SQL delta means student dashboard **2.76 ms**, staff **1.96 ms**. First three ELU >=.95 samples at **184.80/176.40 s**, pool waiting at **234.07/234.14 s**; app pressure again precedes pool queueing. Faster completion raises arrival throughput in this closed-loop workload, so app/DB CPU need not fall when a proxy is removed.

The actual native **k6/2.3.0** binary made one request to a disposable echo server with the same Accept/Content-Type headers: **Accept-Encoding absent**. See performance-experiments/k6-wire-headers.json. No LMS tokens/requests were involved. Current scripts therefore do not negotiate gzip/zstd; do not attribute their latency to actual compression operations. This agrees with the current [official k6 transport implementation](https://github.com/grafana/k6/blob/master/internal/js/runner.go), which disables automatic transport compression, but the installed-binary wire observation is the primary evidence. Browser compression behavior is separate.

## Constraints on the guide

- Historical SQL/ELU measurements are hypotheses for the current candidate, not established current ground truth. Closed-loop throughput and average latency do not establish an intrinsic 1000-req/s host cap.
- Raising account-validity TTL would increase the revocation staleness bound. That will not be done to gain speed.
- Profile/membership caches or stale serving must not silently extend ownership, enrollment, account validity or publication guarantees. Unsafe proposals will be rejected with source evidence.
- Extra replicas and direct-app transport are temporary comparison topologies, not assumed improvements.

Four smaller candidates were compiled into historical image `39d59eeba3d3f4213ba6a2324e28a88a50fb431b01dbc66abef0412b1f638d4c`. They were tested one at a time against the rebuilt control, retaining only a gain greater than the empirical dashboard/HTTP p95/p99 ranges with no material regression in those percentiles or throughput and zero HTTP/business/check failures. Initial decisions are in `performance-smaller-candidate-decisions.json`; the paired repeat rejection is authoritative in `performance-final-candidate-selection.json`. This conservative rule is not a statistical significance test. All candidate flags and images are recorded per run.

**Final selection:** none of these four smaller candidates survived verification. Their source is archived with `.txt` suffixes and SHA256 fingerprints under `performance-experiments/candidate-source/`; image `lms-backend-app:measured-smaller-candidates` retains the tested implementation. Their implementation and verification scripts were removed from the final source. Two replicas remain selected. The ordinary final build passed TypeScript and contract/security/cache checks; lint has zero errors and three pre-existing RBAC `any` warnings. Normal Compose defaults enable native warm responses and deferred request adaptation; either may be set to0 for rollback.

Three-app peak median ELU **0.822/0.833/0.822**, median interval loop p95 **54.33/58.29/53.31 ms**, median foreground waiters **0/0/0**, maxima **35/34/47**. These app metrics improved while dashboard p95 worsened **290.59 ms** and throughput fell **67.21/s** versus the paired two-app control. Summed app median CPU is about **115.67%** of one virtual core versus **107.33%** for two; Caddy **103.36%**, PostgreSQL **76.23%**, Valkey **8.60%**, generator **81.79%** (p95 **176.63%**). This supports rejecting more replicas on this setup; it does not prove a specific host scheduler, thermal or network cause. Exact first system-wide saturation remains unknown. Lower per-process loop lag alone is insufficient to guarantee end-to-end latency.

Source-handler projection probes returned identical SHA256 hashes, statuses, sizes and query counts for all six full responses. New SQL and plans are in `performance-experiments/projection-notices.json` and `projection-course.json`, compared with `projection-control.json`; Redis is disabled only in those separate read-only probes. The SQL prefix predicate also matches the old JavaScript predicate across 21 nullable/provider/prefix fixtures. Timetable LIMIT64 has a full-read fallback on overflow; read-only PostgreSQL fixtures with 0/12/63/64/65/100 rows confirm none are truncated. Installed `staff_assignments_institution_section_day_idx` covers `(institution_id,section_id,day_of_week)` and is used in the populated capture; no new index was added. Two-second fill tests confirm another owner's lock/value are untouched, joined callers can fetch independently, original owners continue, and failed owners clean up their own locks. Cache race/coordination and complete warm-route security checks passed. Ordinary production Docker build/TypeScript and changed-file lint passed.

Official references: [WSL processor-count configuration](https://learn.microsoft.com/windows/wsl/wsl-config) describes virtual CPU count, not a host affinity mask. [Caddy log_append](https://caddyserver.com/docs/caddyfile/directives/log_append) documents late upstream-latency logging; access-log headers are explicitly filtered to remove authentication/cookies.

## Measurement correction

The first populated control (`18-45-43-608Z-populated-observed-control`) was stopped during its ramp and excluded. A single global source-export pool registry was overwritten during compiled route initialization and reported zero pools while PostgreSQL had active app connections. The corrected opt-in preloader records actual pg-pool instances when acquiring clients, including separate readiness instances, and aggregates only identical pool families. Six authenticated endpoint probes confirmed serving and pool observation before restarting all three controls. This patch changes diagnostic collection, not pool size, acquisition or release behavior. Header whitespace normalization in the native request facade is validated by contract tests; the identical corrected helper is mounted for all instrumented controls/candidates and must be included in the final ordinary Docker build.

The completed Windows-log control (`18-48-47-478Z.../run-1`) had mean HTTP duration **1752.14 ms** (waiting 1751.93 ms; dashboard duration mean 1758.61 ms), mean proxy-upstream **42.23 ms**, and mean derived outside-proxy wait **1709.70 ms**. Its second repetition was stopped during the ramp when this discrepancy was identified. Moving only log storage to a named Linux volume produced mean HTTP duration **566.58 ms**, proxy **436.95 ms** and outside-proxy wait **128.86 ms**, dashboard p95 1546 ms and 874 req/s. This is evidence that cross-VM logging added substantial completion-path delay and obscured app pressure; it is not a clean measurement of log-write duration or proof that every delay was filesystem IO. Logging remains identical and sanitized for all subsequent candidate comparisons. Raw completed summaries and excluded-run markers are preserved.

Linux-log control run 1 has peak median app ELU **1.00/1.00**, median interval loop p95 **156.37/149.29 ms**, foreground waiters max **292/287**, median **97/102**, peak RSS **330.16/330.48 MiB**. First three consecutive ELU >=0.95 samples at **111.03/111.70 s**; first three samples with foreground waiters at **153.51/148.04 s** after k6 start. This supports observed app saturation before app pool queueing. Host scheduler, generator and Caddy may contribute; it is not proof that one resource exclusively causes all latency. Trace artifacts are stored alongside each run (`observer-analysis.json`, app JSONL, docker stats, generator stats, access-log archive and SQL statistics).

## Proposals requiring rejection or additional security work

- **Account-validity 30 to 60 seconds:** rejected. The warm transport reads the same memo and expiry as normal authentication; it never renews a hit. Longer lifetime would extend the bound when an invalidation is missed. Existing shared validity entries live 600 seconds, so a missed mutation hook cannot be described as a guaranteed 30-second revocation bound.
- **Membership/profile SQL removal:** deferred. Student timetable's fresh membership lookup enforces current institution/section state; a cached positive result changes behavior after enrollment moves. `src/lib/batch-promotion.ts` currently invalidates student enrichment rather than a new membership cache; profile mutation paths also lack hooks for a proposed profile key. Preserving fresh ownership SQL would retain a DB query. No safe cache that removes that query has been established, so no TTL is invented.
- **Serve expired values for another 30 seconds:** deferred until complete authoritative invalidation exists. Student daily timetable keys (`cache:timetable:tenant:section:weekday`) differ from weekly timetable/dashboard keys. Existing timetable mutation invalidation does not establish cascade invalidation of all daily and parent payloads. Valkey tracking loss clears current L1; keeping a shadow expired value must not defeat that safety behavior. No expired data is served by this candidate.
- **Arbitrary daily timetable LIMIT:** cannot truncate a currently unbounded public response just to pass latency targets. A safe bound requires a documented scheduling maximum or overflow fallback that preserves all periods. Existing institution/section index and sampled plans are retained as evidence; adding an arbitrary cap is not yet authorized by an API contract.
- **DB pool/timeouts:** remain 15 foreground/4 refresh/1 readiness and 5000-ms foreground acquisition/query timeout. No timeout or connection-count change is justified by idle plans; latest matched traces are needed.

## Final acceptance on the selected production build

Both apps serve image **`sha256:a681a75a2648901c1433308ec047c20b5523ab0fa4e73672a8cd2bfd232788f1`**, tagged `lms-backend-app:measured-native-optimized`. The ordinary production Docker build completed TypeScript validation, static generation and tracing. Only native warm dashboard responses and deferred NextRequest adaptation are retained. The four smaller source candidates and cached-length feature are removed; their source/test archives and historical images remain available for reproduction. No migration or pool increase was applied.

The final deployment uses only `docker-compose.yml` plus `docker-compose.k6.yml`: two apps, Caddy, PostgreSQL, PgBouncer and Valkey. Application preloaders/profiling flags and Caddy observer access logs/timing header are disabled. PostgreSQL `shared_preload_libraries=''`, `log_min_duration_statement=-1`, `max_connections=100` are verified before and after the tests. Removing observation is production hygiene, **not an independently demonstrated speed improvement**. Existing student generation/cache response headers are preserved. NODE_OPTIONS is only `--max-old-space-size=1024`; no inspector, CPU-profiler, preloader or source-map runtime flag is enabled.

Final preflight: twelve authenticated wire GETs across both roles and all three endpoint types returned 200; forged session headers returned 401 and the wrong role returned 403. Contract tests cover cookie/full-request fallbacks, token expiry, role/password/graduate guards, legacy claims, cache misses, independent streams/CORS/header state, invalidation, tracking loss, owner CAS and refresh limits. The warm-path test made 24 authenticated handler calls with zero SQL and zero Valkey socket writes. Fresh profile/membership SQL, cache TTLs, auth validity and pool limits remain unchanged. Changed-file lint has zero errors and three pre-existing RBAC `any` warnings.

All final scenarios were run serially through Caddy at `http://127.0.0.1:3000`, using MIXED 2500 identities, 2000 peak VUs, original ramps/request mix/think time and a 60-second recovery between scenarios. No cache flush, bulk prewarming, source change or build ran concurrently. Passive container/generator statistics were collected once per second. This is a normal production-mode **local** deployment, not proof of cloud production parity.

| Final test | Requests | Average req/s | Dashboard p95 ms | HTTP p95 ms | HTTP p99 ms | Max ms | Failed gates |
|---|---:|---:|---:|---:|---:|---:|---|
| Load, 9 minutes | 547,147 | 1010.741290 | 872.449875 | 870.001130 | 1371.370062 | 3534.0363 | Dashboard |
| Spike, 3m20s | 111,711 | 558.262693 | 2531.280700 | 2531.280700 | 6751.982620 | 13030.3424 | Dashboard, HTTP p95, HTTP p99 |
| Stress, 20 minutes | 919,126 | 765.830628 | 1309.058580 | 1309.058375 | 1791.043900 | 4174.0708 | Dashboard, HTTP p95 |

Every run has **zero HTTP failures, zero business failures, zero failed checks and zero dropped iterations**. Passing check counts are load **547,146**, spike **111,711**, stress **1,838,250**; load/stress also have one setup health request not included in those status assertions. All k6 exits are **99 from latency thresholds**, not crashes. The wrapper's successful exit means artifact collection finished; it does not turn a k6 threshold failure into acceptance. Closed-loop whole-run averages include ramps and are not peak sustainable capacity.

| Remaining gap | Dashboard p95 above 500 ms | HTTP p95 above 1000 ms | HTTP p99 above 2000 ms |
|---|---:|---:|---:|
| Load | 372.449875 ms | Pass | Pass |
| Spike | 2031.280700 ms | 1531.280700 ms | 4751.982620 ms |
| Stress | 809.058580 ms | 309.058375 ms | Pass |

Strict `<` targets require slightly more than the listed excess to pass. There is no justified claim that this server is now perfect at 2000 VUs.

Final per-role dashboard p95: load **student 876.834345 / staff 865.188850 ms**; spike **student 2511.204320 / staff 2561.272825 ms**; stress **student 1307.725865 / staff 1310.782700 ms**. Both roles fail the dashboard target. Load's timetable p95/p99 are **841.025040 / 1194.811112 ms**; profile **913.867160 / 1280.179514 ms**. Both secondary groups now pass the overall 1s/2s gates in this run despite keeping their fresh SQL. Spike/stress hit only dashboard, so secondary endpoints cannot cause their failures. These tagged percentiles are whole-run distributions, not a decomposition of the global percentiles.

Evidence:

- [Final acceptance, gate decisions, per-role metrics, phase observations and source SHA256 fingerprints](performance-experiments/final-acceptance.json).
- [Sanitized final preflight](performance-experiments/final-runtime-preflight.json) and [effective Caddy JSON](performance-experiments/final-caddy-effective.json).
- [Load raw summary](../test-results/experiments/2026-10-01T22-42-56-958Z-final-production-load/run-1/summary.json), [spike raw summary](../test-results/experiments/2026-10-01T22-53-03-932Z-final-production-spike/run-1/summary.json), [stress raw summary](../test-results/experiments/2026-10-01T22-57-29-162Z-final-production-stress/run-1/summary.json). Their adjacent `run.json`, `normalized-result.json`, `resource-analysis.json`, stdout/stderr and JSONL retain UTC windows and measurements.
- [All experiment measurements and variance](performance-experiment-metrics.json), [final smaller-candidate rejection](performance-final-candidate-selection.json), [two-versus-three selection](performance-replica-selection.json).

## First observed pressure after each phase

The onset convention is **three consecutive one-second samples** with ELU >=0.95, or foreground pool waitingCount >0. Times below are seconds after k6 launch, per replica in app/app2 order (app3 added for the last row). ELU pressure is a busy loop/scheduling observation; nonzero pool waits show a queue. Neither is proof of the first resource to saturate across the entire host. Final runtime profiling is deliberately disabled; do not import earlier loop/pool values into final tests.

| Phase / experiment | First sustained ELU pressure, s | First sustained foreground pool queue, s | Interpretation |
|---|---|---|---|
| Populated baseline | 111.030 / 111.704 | 153.506 / 148.043 | App pressure precedes pool queueing in both replicas |
| Native warm | 141.447 / 153.192 | 158.849 / 158.478 | App pressure precedes pool queueing |
| Native + deferred request | 183.118 / 154.880 | 188.287 / 181.557 | App pressure precedes pool queueing; median ELU below baseline |
| Direct apps, no proxy | 184.801 / 176.404 | 234.073 / 234.144 | App pressure remains despite faster transport |
| Encode minimum1024 | 132.884 / 141.461 | 225.627 / 158.651 | App pressure first; no measured improvement |
| Proxy observer off | 141.813 / 105.770 | 157.181 / 163.797 | App pressure first; no measured improvement |
| Rebuilt control | 186.156 / 211.327 | 219.152 / 251.219 | App pressure first |
| Initial two-second wait | 149.717 / 150.342 | 151.785 / 380.635 | App pressure first; provisional gain not reproduced |
| Narrow notices | 166.667 / 192.791 | 173.770 / 298.534 | App pressure first; candidate rejected |
| SQL boolean course hint | 137.058 / 157.886 | 144.440 / 170.393 | App pressure first; candidate rejected |
| Bounded timetable with overflow | 65.605 / 199.915 | 155.497 / 198.763 | App1 pressure first; app2 pool appears 1.152s earlier than its ELU criterion |
| Paired original-wait control | 165.315 / 163.980 | 181.672 / 187.603 | App pressure first |
| Paired short-wait repeat | 124.733 / 124.171 | 225.322 / 225.611 | App pressure first; worse end-to-end tails |
| Three replicas | 267.375 / not observed / not observed | not observed / 240.365 / not observed | App2 pool criterion appears before app1 ELU criterion; lower loop load still gives worse latency |
| Final load/spike/stress | Not collected | Not collected | Exact first saturation cannot be established from passive CPU samples |

Final peak-window **median CPU, percent of one core**:

| Test | App1 / app2 | Caddy | PostgreSQL | Valkey | Windows k6 median / p95 |
|---|---:|---:|---:|---:|---:|
| Load | 56.36 / 55.80 | 103.36 | 76.64 | 5.24 | 89.59 / 182.87 |
| Spike | 59.78 / 58.44 | 115.48 | 46.51 | 5.70 | 102.18 / 190.72 |
| Stress | 56.12 / 56.11 | 120.27 | 47.28 | 5.87 | 112.72 / 195.10 |

Maximum sampled app memory (usage minus inactive file), app1/app2: load **319,893,504 / 325,398,528 bytes**; spike **333,926,400 / 312,254,464**; stress **323,731,456 / 325,402,624**. These are container working-memory observations, not Node heap or process RSS. All sampled container CPU-throttled-time counters are zero; containers have no explicit CPU/memory quota. Post-test all six containers are healthy, restart count0, OOMKilled false. Saved test-window app/app2 log files contain zero bytes in all three tests: no retained app error lines. A separate final-window scan of all six Docker logs found zero error/timeout/connection-refused/OOM matching lines; Caddy's retained messages were informational admin requests. The scan records counts without request headers or credentials. This does not prove every transient resource wait was absent.

The retained-loop/transport path remains the strongest measured investigation area. Pool queues can follow delayed app completion callbacks; increasing clients is unsupported. Caddy and the shared generator perform substantial CPU work, but no synchronized host scheduler/thermal trace or isolated-generator test establishes their causal share. Final SQL/lock/cache-lock timings are unavailable because their diagnostic collectors are disabled. A successful 13s request is not proof of a 13s SQL query or timeout error.

## Cache cadence and unresolved local limits

Dashboard TTL jitter remains `45 + floor(45 * (0.05 + random * 0.05))`, i.e. **47-49 seconds**: only a two-second interval across identities. Fill start times additionally spread expiry. This is randomized jitter, not a guarantee that all 2500 identities' expiry/refresh work is evenly distributed. Per-family hit/miss/fill/refresh/lock-wait counters are retained in the instrumented runs and final-acceptance phase evidence; they must not be confused with per-key expiry timestamps or a universal request hit rate. No complete per-identity expiry distribution during final acceptance was collected. The original four-concurrent background refresh cap, owner lock/CAS, tracking invalidation and original expiry are preserved. Foreground can still encounter the original 10s lock wait/60s operation timeout; the shorter-wait replacement failed its paired measurement and was removed.

The populated results supersede the guide's assumption that every query is below1ms: student aggregate sampled **1.911ms**, and measured load-window SQL mean execution reaches several milliseconds. SQL remains much shorter than HTTP tails in those samples, but planning/client scheduling/cold bursts and production-volume query costs are separate. No new missing-index explanation is invented.

What cannot be established locally:

- **Exclusive generator/server CPUs:** k6 maskC0 is applied, but WSL affinity assignment was refused. A host administrator/VM setup that actually partitions cores, or another generator machine, is needed to isolate this effect. `.wslconfig processors=4` cannot provide that partition.
- **Whether a bigger host is necessary, or which CPU/RAM spec would pass:** unproven. One shared-host comparison cannot establish a required core count or promise that hardware will fix the spike. An isolated generator and controlled host-resource comparison with the same populated scenarios are needed. No measured RAM exhaustion supports a RAM-upgrade claim.
- **Exact cause of final long tails:** request-correlated arrival/cache/SQL acquire/completion/response traces and host scheduling evidence are missing. Optional instrumentation is available for a separate diagnostic deployment, with its overhead explicitly disclosed.
- **Safe expired serving or SQL-removing membership/profile caches:** require complete mutation/invalidation coverage and agreed freshness/security behavior. Faster hardware does not resolve those correctness questions.

## Deployment, repeat and rollback

The selected deployment is already running. Reproduce the ordinary build/deployment with:

```powershell
docker compose -f docker-compose.yml -f docker-compose.k6.yml build app
docker tag lms-backend-app:latest lms-backend-app2:latest
docker compose -f docker-compose.yml -f docker-compose.k6.yml up -d --no-build app app2 caddy
node scripts/verify-final-performance-runtime.mjs 2
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-final-performance-acceptance.ps1
```

Keep measurement overlays out of final acceptance. If returning from a statement-observer deployment, recreate PostgreSQL using only the ordinary files as well; the preflight rejects enabled statement observation. Token preparation is separate: current pre-issued tokens eventually expire and must be renewed before later repetitions. Do not treat auth-expired runs as performance evidence. This task did not bulk regenerate tokens.

Feature rollback, without rebuilding:

```powershell
$env:HOT_PATH_NATIVE_WARM = '0'
$env:HOT_PATH_LIGHT_REQUEST = '0'
docker compose -f docker-compose.yml -f docker-compose.k6.yml up -d --no-build --no-deps app app2
```

Both features then use the original guarded compiled handlers and ordinary NextRequest construction. Remove these environment overrides to restore defaults. Historical `before-measured-native` images and source backups remain available; the populated fixture manifest records only task-inserted IDs for a separately requested data rollback. No Git directory/commit exists in this workspace; SHA256 source fingerprints in final-acceptance.json identify the reviewed files instead of an invented commit.
