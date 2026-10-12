# 1,550-VU capacity work — phased TODO

Created: 2026-10-11 (Asia/Karachi)

## Follow-up: 2200-VU CPU tuning (2026-10-12)

This is the new three-phase tuning follow-up, separate from the original phases below.

- [x] Phase 1: inspect current proxy/auth/cache/response code and saved 2200-VU measurements. Findings: [fresh inspection report](concurrency-2200-phase1.md). No tests or server changes.
- [x] Phase 2 preparation: confirmed runtime settings, inspected authorization query plan, and prepared bounded Node/Caddy CPU capture. [Instructions and limitations](concurrency-2200-phase2.md).
- [x] Phase 2 initial evidence: user-run CPU profiles captured successfully; analyzed both Node profiles and Caddy. [Findings](concurrency-2200-profile-findings.md). Compared with the unprofiled baseline; exact overhead and detailed request-phase/pool-wait timing remain unresolved.
- [ ] Phase 3: implement measured fixes, review publication scope, and compare the same user-run workload after deployment.
  - [x] Prepared the student dashboard authenticated native response candidate; static checks and source review complete. [Change and rollback notes](concurrency-2200-native-response.md).
  - [ ] Deploy candidate, verify runtime correctness, and compare unchanged 2200-VU workloads before accepting the optimization.

Key correction: dashboard cache hits still perform fresh database authorization. Caddy, Node, and database work all compete for CPU; exact expensive functions remain to be profiled.

Target: reliable operation on the deployed 4-core, 8 GB server. Validate normal browsing, spike, and stress separately; a browsing pass does not prove an aggressive spike pass.

## Current status

- Phase 0: COMPLETE - fresh analysis of current source and supplied test artifacts.
- Phase 1: COMPLETE locally - diagnostic tooling remains outside this code-fix commit.
- Phase 2: AWAITING VALIDATION - historical failure categories remain unproven; no further tests authorized.
- Phase 3: IMPLEMENTED / UNDEPLOYED - targeted source fixes below; capacity improvement is not yet measured.
- Phases 4-6: NOT STARTED.
- User direction (2026-10-11): analyze saved results and current code, fix code, and push only intended files. Do not run tests or deploy.
- Earlier diagnostic session ran short remote probes and temporarily enabled observers. Both replicas were restored to their original images/configuration and healthy before the user stopped testing. Those runs do not establish 1550-VU capacity.
- Next action: user deploys the normal-server timing fix, then runs a controlled reproduction; analyze saved application-versus-client timing before choosing a transport or origin fix.

## Working rules and credit control

- Work on one phase per requested session, then stop with a handoff and update this file.
- Inspect the relevant current implementation before editing. This tracker records progress; it does not replace fresh inspection or prove that historical findings still apply.
- Read applicable AGENTS.md instructions and installed Next.js guides before code changes.
- Keep each phase narrowly scoped. Use short diagnostic runs first; avoid repeating the full six-run suite until the relevant cause has changed.
- Change one performance variable at a time and retain only measured improvements.
- Preserve authentication, immediate account checks, tenant isolation, and data correctness. Do not relax acceptance thresholds to claim capacity.
- Never log tokens, cookies, passwords, or student data. Sample and sanitize failure details; avoid per-request log floods.
- Record implementation, local validation, deployment, and server validation separately. A code fix is not a measured capacity gain.
- Existing user edits to AGENTS.md, README.md, and docs/operational-capacity.md are outside this plan; do not overwrite them.
- If a phase needs a deployment or server run, prepare the concrete changes/commands first and identify any missing access or authorization. Do not assume local work is deployed.
- Skip optional optimization phases when evidence shows they are unnecessary; record the reason.

## Phase 0 — Establish the baseline [COMPLETE]

- [x] Read all six summaries and raw stdout/stderr logs in `test-results/2026-10-09T22-51-26-881Z/`.
- [x] Verify saved workload script hashes match current k6 scripts.
- [x] Inspect current dashboard, authentication, cache, database pool, custom server, and deployment paths.
- [x] Separate demonstrated failures from unproven bottleneck theories.

Historical test evidence, not new validation:

| Workload | VUs | Whole-run requests/sec | HTTP failures | HTTP p95 | HTTP p99 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Load | 1000 | 605 | 2.16% | 96 ms | 146 ms |
| Load | 1500 | 904 | 1.96% | 118 ms | 206 ms |
| Spike | 1000 | 280 | 71.51% | 1729 ms | 30285 ms |
| Spike | 1500 | 278 | 79.62% | 2767 ms | 31157 ms |
| Stress | 1000 | 438 | 30.59% | 730 ms | 2711 ms |
| Stress | 1500 | 396 | 52.30% | 1674 ms | 30585 ms |

- The 1500-VU load run passed latency thresholds but had 9604 dashboard failures; timetable and profile checks had zero failures. Failed HTTP statuses/bodies were not retained.
- The 1500-VU stress log contained 5723 HTTP/2 GOAWAY warnings and 1522 TCP remote resets. These explain only part of its 248801 failed dashboard checks.
- Both stress runs recorded zero failures of the `not 429/502/503` check. This does not rule out other HTTP errors or transport failures.
- Spike uses a hardcoded 0.3-second sleep despite the runner supplying THINK_SEC=1.5. Stress uses 0.5 seconds; load uses 1.5 seconds and occasional secondary requests.
- Historical whole-run averages include ramps and failures. They are not peak successful capacity.
- No saved server CPU/RSS/pool-wait measurements establish a hardware bottleneck.

### Phase 0 verification checkpoint — 2026-10-11

Rechecked at the user's explicit request using current files and the original artifacts, without reading prior project reviews. All six current workload/helper SHA-256 hashes match the manifest. Recomputed request rates, failure rates, percentiles, per-endpoint checks, and GOAWAY/reset counts from all six summaries and raw logs; the baseline above remains accurate.

Current source inspection confirms:

- `src/lib/auth.ts`: authenticated requests still check fresh account state; `getWarmSessionFromRequest()` returns null.
- `src/db/index.ts`: each app process has default foreground/refresh/readiness pool maxima of 15/4/1.
- `src/lib/redis.ts`: cache fills deduplicate by key; background refresh concurrency is four per process. These do not constitute a global distinct-key foreground concurrency limit.
- `scripts/standalone-server.cjs`: selected GET routes dispatch directly to their guarded handlers, with optional native warm callbacks.
- `docker-compose.yml`: two app services, 1 GB old-space ceilings, and PgBouncer defaults of 25 normal plus 5 reserve connections. These are repository defaults, not verified live settings.
- `k6/scripts/spike.js`: 0.3-second sleep remains hardcoded; load/stress read THINK_SEC.

Validation method: read-only Node aggregation of `summary.json`, `stdout.log`, and `stderr.log`, SHA-256 comparison against `manifest.json`, and targeted current-source inspection with `rg`/`Get-Content`. No new benchmark, application change, or deployment occurred.

Phase 0 conclusion: baseline established; root cause remains unproven because failed HTTP response details and correlated server resource measurements are missing. Phase 1 is the next work item, not part of this checkpoint.

## Phase 1 — Make failures observable [COMPLETE - LOCAL VALIDATION]

Scope: local changes only; prepare a small, reviewable diagnostic test.

- [x] Add counters by endpoint, HTTP status, and transport error code, with bounded cardinality.
- [x] Capture a small sanitized failure sample with request ID, protocol, and useful response headers; do not dump full headers or bodies.
- [x] Record successful-response latency separately from failed-response latency.
- [x] Make spike think time configurable while preserving/documenting the original 0.3-second workload for comparison.
- [x] Include effective pacing, token count, workload stages, and script hashes in each run manifest.
- [x] Report peak-hold and recovery windows separately; include successful requests/sec.
- [x] Preflight sufficient distinct valid accounts for 1550 VUs, rather than silently recycling the existing 1500-account pool.
- [x] Extend existing diagnostics where possible; prepare opt-in origin CPU/RSS, event-loop delay, pool-wait, DB-query, and cache measurements.
- [x] Locally validate instrumentation and token/body redaction without launching a production load test.

Done when: the next small run can distinguish application HTTP failures, edge responses, and transport errors, and the actual workload is explicit.

### Phase 1 completion - 2026-10-11

- Added shared workload definitions, configurable spike pacing, stable request correlation IDs, bounded sanitized failure samples, success/failure trends, and status/error-code reports. Redirect responses are now visible rather than followed.
- Runner supports a single selected workload and short diagnostic mode; records effective stages/pacing/token count and source/tool hashes. Streaming aggregation retains bounded outcome counts and approximate latency histograms instead of raw per-request output.
- Reports separate ramp/peak/recovery/drain windows, successful requests/sec, protocol counts, and cache HIT/MISS/unknown counts. Reports use response completion windows; setup probes are excluded.
- Token preflight rejects insufficient, duplicate, malformed, or expired identities and requires full-run expiry headroom. A 1500-account pool cannot run a 1550-VU capacity test. Server authorization remains authoritative.
- Prepared `deployment/compose.diagnostics.yml` using the existing observer, with CPU profiling disabled initially, bounded origin request samples, and CPU/RSS/event-loop/pool/query/cache measurements. Not deployed.
- Made only required k6/observer source files Git-trackable; tokens, binaries, user lists, and captured evidence remain ignored.
- Instructions and limitations: [k6/PHASE1.md](../k6/PHASE1.md).

Validation completed:

1. `node k6/verify-phase1.mjs` - PASS using real k6 against a disposable loopback fixture: all three workload scripts, injected 403/500 responses, TCP failures, redirects, window accounting, sanitized samples, origin capture, and insufficient/duplicate/expired account rejection. No LMS or database requests.
2. `node --check k6/server-suite.mjs` and `node --check scripts/performance-preload.cjs` - PASS.
3. `docker compose -f docker-compose.yml -f deployment/compose.diagnostics.yml config --no-interpolate --quiet` - PASS; configuration validation only.
4. Runner dry runs for a 50-VU short load and 1550-VU configurable spike - PASS. Unknown flags rejected before SSH/HTTP.
5. `git diff --check` - PASS; credential/binary/user-list ignore rules verified.

New local fixture artifacts were temporary and removed; no production evidence was generated. Existing server test results remain historical and unchanged. Origin database timing under real traffic and actual deployed settings still need Phase 2 validation.

## Phase 2 - Locate the failing layer [AWAITING VALIDATION; TESTING STOPPED]

Dependency: Phase 1 diagnostic changes available on the appropriate test/generator and server paths.

- [ ] Record deployed revision/image and effective non-secret runtime settings.
- [ ] Run a short controlled reproduction and capture status/error distribution plus correlated origin logs.
- [ ] Compare the public hostname path with direct-origin Caddy access, preserving Host/SNI and TLS verification.
- [ ] If connection failures persist, compare HTTP/2 and HTTP/1.1 diagnostically.
- [ ] Monitor generator CPU/network; use another generator if its limits could distort results.
- [ ] Correlate failures with app CPU/RSS, event-loop delay, DB queues, cache misses, and edge events when available.
- [ ] Identify the dashboard failure category and whether it matches the stress/spike failures.
- [ ] Write a brief evidence-based diagnosis with links to the new run artifacts; label unresolved hypotheses.

Done when: the failing layer and response category are established well enough to choose a targeted fix. If access prevents diagnosis, record exactly what evidence is missing rather than guessing.

## Phase 3 - Fix demonstrated reliability failures [IMPLEMENTED / UNDEPLOYED; PARTIAL]

Dependency: Phase 2 diagnosis. Do not implement every possible fix below.

- [ ] Fix the demonstrated dashboard cause: handler/query/cache defect, invalid fixture/data, or edge rejection, as supported by evidence.
- [ ] Address proven transport/edge configuration defects if present; keep public security protections scoped and intact.
- [ ] Add focused regression coverage for the actual defect.
- [ ] Run relevant local checks and prepare deployment/rollback instructions.
- [ ] Record deployment separately, then repeat the same short reproduction.
- [ ] Confirm that failures disappeared or decreased for the intended reason; retain remaining failure counts.

Done when: identified failures are fixed and the same reproduction verifies the result. A local test alone does not complete server validation.

## Phase 4 — Optimize measured application bottlenecks [NOT STARTED; CONDITIONAL]

Only needed if origin measurements show insufficient capacity after Phase 3.

- [ ] Profile the dominant cost before selecting changes.
- [ ] If justified, use the optimized response path after fresh asynchronous authorization, preserving all guards.
- [ ] If justified, reuse request-scoped authorization data and remove duplicate work.
- [ ] If justified, bound concurrent distinct-key cache fills and request queue waiting; review deadlines and cancellation.
- [ ] If justified, reduce dashboard query/serialization cost using observed query plans and realistic data.
- [ ] Account for the 30-second dashboard cache policy cap when assessing TTL behavior; preserve invalidation and freshness requirements.
- [ ] Verify security/correctness and measure each candidate against the same workload.
- [ ] Revert candidates that do not improve successful throughput or tail latency.

Done when: each retained optimization has measured benefit and no correctness regression, or the phase is explicitly skipped with evidence.

## Phase 5 — Tune the shared 4-core/8 GB host [NOT STARTED; CONDITIONAL]

- [ ] Retain two app replicas and existing pools as the comparison baseline.
- [ ] Measure total container RSS, CPU, disk latency, PostgreSQL activity, and Valkey pressure under the target workload.
- [ ] Change pool sizes, refresh concurrency, or memory settings only where measurements justify it, one variable at a time.
- [ ] Isolate/schedule heavy background work if contention is observed.
- [ ] Verify readiness and recovery behavior under pressure.
- [ ] Record chosen settings, evidence, and rollback values. Do not count overload rejections as successful capacity.

Done when: selected settings improve the measured outcome within host resources, or no tuning is justified and the phase is skipped.

## Phase 6 — Prove 1550-VU capacity and hand off [NOT STARTED]

- [ ] Prepare at least 1550 distinct valid accounts and a monitored external generator.
- [ ] Run a short smoke/ramp before full acceptance runs.
- [ ] Validate 1550-VU browsing, explicitly paced spike, and aggressive stress separately.
- [ ] Include warm-cache, cold-cache, and recovery observations; report each separately.
- [ ] Preserve existing strict gates: zero HTTP/business failures, all checks passing, HTTP p95 < 1000 ms, HTTP p99 < 2000 ms, dashboard p95 < 500 ms.
- [ ] Apply gates to peak windows as well as whole-run summaries so ramps cannot hide overload.
- [ ] Add a sustained hold long enough to observe repeated cache expiry and memory behavior.
- [ ] Record peak successful requests/sec, errors, resource use, recovery, deployed revision, settings, and test artifacts.
- [ ] Report the highest verified capacity for each workload. If 1550 fails, record the limiting resource and keep the target incomplete.

Done when: all requested workload targets pass and evidence is saved. Passing browsing alone must be reported as a partial result.

## Session handoff log

Update after each work session. Use NOT STARTED, IN PROGRESS, IMPLEMENTED/UNDEPLOYED, AWAITING VALIDATION, COMPLETE, or SKIPPED WITH REASON.

| Date | Phase | Work completed | Validation/evidence | Remaining / next action |
| --- | --- | --- | --- | --- |
| 2026-10-11 | 0 / planning | Fresh source/artifact analysis; created this tracker | Existing six-run artifacts only; no new load test | Start Phase 1 local diagnostic instrumentation |
| 2026-10-11 | 0 / verification | Rechecked all six artifacts, script hashes, and relevant current source; added verification checkpoint | Baseline metrics and error counts reproduced; all six hashes match; documentation-only update | Phase 0 COMPLETE; Phase 1 NOT STARTED |
| 2026-10-11 | 1 | Implemented diagnostic tooling, workload reports, distinct-account preflight, and optional observer overlay | Real-k6 loopback verifier, syntax checks, Compose validation, runner dry runs passed | Phase 1 COMPLETE locally; Phase 2 NOT STARTED; no deployment/server load |

For future sessions also record changed files, exact test commands, new artifact locations, deployment state, and unresolved questions. Do not mark unchecked work complete based on plans or historical tests.

### Code-only correction and publication - 2026-10-11

Freshly inspected the saved six-run comparison, current dashboard/response/authentication guards, cache implementation/policy, and standalone HTTP adapter. Historical 1500-VU load had 1.96% HTTP failures, spike 79.62%, and stress 52.30%. The saved aggregate results cannot identify every failed HTTP response category.

Source defects corrected:

- Cache deduplication previously released its entry when the caller's 60-second timeout fired, even if the underlying fetch continued. Retain the entry until that work settles, preventing repeated requests from starting overlapping same-key fills. Explicit invalidation still replaces the entry; old work cannot remove its replacement. Requests continue to fail after the deadline while the original work remains pending; this is not cancellation or a global queue limit.
- Cache TTL jitter previously added 5-10% after the freshness policy cap. Jitter now shortens expiry, preserving the policy ceiling while spreading expirations. This correctness fix may increase refresh frequency slightly.

Changed application file: src/lib/redis.ts. This tracker accompanies it. Authentication, tenant checks, pool sizes, and resource limits retain their current behavior.

Validation: source/diff review only in this code-fix session. No tests, build, benchmark, or deployment run, per user direction. These fixes are not proof of 1550-VU capacity, nor a claim that all historical failures are resolved. Phase 3 server verification and Phase 6 acceptance remain incomplete.

Publication scope: only the cache implementation and this tracker. Existing edits to AGENTS.md, README.md, docs/operational-capacity.md, .gitignore, and untracked diagnostic tooling are excluded. Tokens, test-results, local scratch files, binaries, and server captures remain excluded.

### Latest user-run suite analysis - 2026-10-11

- Read all six diagnostic reports and summaries plus failure logs from `test-results/2026-10-11T09-20-44-834Z`.
- All 12,589 recorded failures are status-0 transport failures; no application HTTP error category was reproduced. Long body-receive and handshake delays are visible. Origin resource exhaustion is not demonstrated.
- Findings and per-run peak results: [latest results analysis](concurrency-latest-results.md).
- Fixed absent default hot-path processing timing in `scripts/standalone-server.cjs`; the existing k6 consumer can now record Node processing time without the opt-in observer. Added a closed-response guard to the non-Response error branch.
- Source/diff review only. No tests, build, remote commands, or deployment performed. This is an observability fix; transport failure remediation and 1550-VU acceptance remain incomplete.
- Publication includes only the standalone server and the two analysis/tracker documents; diagnostic tooling, credentials, result artifacts, and unrelated user edits are excluded.

### Monitored direct-origin evidence - 2026-10-11

Saved analysis: `test-results/2026-10-11T13-15-18-345Z/analysis.md`. All 2184 recorded failures are transport failures. Node p95 3.323 ms; sampled host CPU below 23%, available RAM above 5 GiB. Caddy namespace gained 10473 retransmissions and 6351 TCP timeout events while app namespaces gained none. Network events rise with k6 failures; exact faulty link/device remains unresolved. Startup-only PC CPU saturation must not be treated as sustained generator saturation. No tests or deployment performed during analysis; capacity target remains incomplete.

### Cloud generator load validation - 2026-10-11

User-run evidence: `test-results/cloud-2026-10-11T18-00-01-765Z`. Direct-origin 1500-VU browsing passed all configured gates: 527402 HTTP requests, zero HTTP/business failures, all checks passed, HTTP p95 4.971 ms and p99 9.925 ms, dashboard p95 4.956 ms. Five-minute peak: 1287.28 successful requests/sec, zero failures, successful p95 upper bound 6 ms and p99 10 ms. Application host sampled CPU peaked at 52.73%, available RAM remained above 5018 MiB. This establishes this browsing workload at 1500 VUs on direct origin, not 1550, spike/stress, Cloudflare-path or cold-cache acceptance. The generator/network change strongly implicates the previous external test paths in prior failures, without identifying an individual faulty device. No code change, deployment or new test was made during this analysis.
