# Student dashboard response candidate

Date: 2026-10-12. First performance candidate after CPU profiling; improvement is not yet measured.

## Change

Only `/api/student/dashboard` opts into an asynchronous standalone native response callback. The shared RBAC guard runs first: session-header stripping, body-size rejection, token verification, fresh PostgreSQL account/institution checks, campus resolution, role/password/graduate/permission checks, and API CORS policy remain on the request path. The ordinary exported Next GET still returns a standard Response.

After authorization, a warm local dashboard/cache-hint hit returns the existing serialized JSON in an internal envelope, avoiding per-hit Response/Headers/ReadableStream construction. Cache misses continue into the original handler with the already-validated session. Non-success responses retain the ordinary error mapping and standard response transport.

For the audited bearer dashboard request, the lightweight request adapter lazily constructs the same RequestCookies implementation used by the installed NextRequest. Reading the campus cookie therefore does not force construction of a full Fetch Request/NextRequest. Cookie-authenticated requests still construct NextRequest. Other properties retain the existing lazy fallback. The native writer retains static security headers, CORS, request ID, timing and byte-length calculation; it writes only validated 200/string envelopes.

No JWT/auth liveness caching, query changes, pool changes, cache TTL changes, Caddy changes, or migrations are included. Native behavior remains gated by `HOT_PATH_NATIVE_WARM=1`; setting that runtime variable to `0` for both app containers restores ordinary guarded response handling.

## Validation and limitations

Installed Next route-handler, NextRequest and self-hosting docs and the RequestCookies implementation were inspected before editing. Node syntax checks, TypeScript no-emit checking, and diff review passed. No runtime tests, build, benchmark or deployment was run, following the user's no-tests instruction. Runtime correctness and performance acceptance remain pending; static checks alone do not establish either.

## Publication and deployment

Candidate branch: `perf/student-dashboard-native-response`.

- Before-change source tag: `before-dashboard-native-2026-10-12` (parent includes profiling tools but unchanged application).
- Candidate tag: `dashboard-native-candidate-2026-10-12`.

This branch includes an application source change. Pulling main alone will not deploy it. Fetch the candidate branch and rebuild/redeploy both application containers using the established deployment process, preferably from the same built artifact. Keep the previous application image references for rollback. No database migration is required by this change.

After deploying and checking normal dashboard/authentication behavior, run the unchanged `run-cloud-test.ps1` on the Windows PC for the 2200-VU load/spike/stress comparison. Keep account pool, pacing and latency thresholds constant; the sequence continues on threshold failures. Compare p95/p99, successful throughput, CPU and errors. Baseline strict runs: 9.9/630/285 ms HTTP p95 for load/spike/stress, zero failures.

If behavior regresses, restore the previous app images or disable HOT_PATH_NATIVE_WARM for both apps and recreate them through the same deployment configuration. A Git tag alone does not change a running container.
