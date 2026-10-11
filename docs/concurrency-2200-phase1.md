# 2200-VU tuning: phase 1 inspection

Date: 2026-10-12 (Asia/Karachi). Fresh inspection of current source and saved user-run measurements. No tests, remote commands, application edits, or deployment performed.

## Saved evidence

Strict-limit runs in `test-results/`:

| Workload | Folder | HTTP p95 | Peak successful requests/sec | Maximum sampled host CPU | Minimum available RAM |
| --- | --- | ---: | ---: | ---: | ---: |
| Load | cloud-2026-10-11T21-03-26-146Z | 9.89 ms | 1886 | 69.86% | 4686 MiB |
| Spike | cloud-2026-10-11T21-14-27-239Z | 630.31 ms | 3240 | 99.37% | 4552 MiB |
| Stress | cloud-2026-10-11T21-19-40-537Z | 284.77 ms | 3244 | 99.03% | 4555 MiB |

All reached 2200 VUs; zero HTTP/business failures and no failed response checks. Spike failed only dashboard p95 <500 ms. These use 1500 distinct students with 700 shared-account VU slots, direct origin, mostly cached reads. Source hashes match the preceding no-latency-gates suite. Saved collectors identify revision `8f8a7ce7f7bff21a17fb96a3f894cc77e97256cf`; active runtime configuration was not fetched here.

Host CPU calculation: differences between consecutive `/proc/stat` samples, first eight counters, idle includes idle+iowait. Docker CPU percentages below treat 100% as one core. Maxima are separate observations, not simultaneous values to sum.

## Current source findings

1. **Every dashboard request still queries PostgreSQL for fresh authorization.** `src/lib/auth.ts:getSessionFromRequest` calls `src/lib/user.ts:getFreshStudent`, joining student, institution, and parent institution records to enforce current eligibility. Dashboard cache hits do not eliminate this query. Spike/stress PostgreSQL sampled CPU reached about 69% of one core and PgBouncer about 28-30%. Earlier reasoning that cache hits make database work unimportant was incomplete. Preserve fresh revocation and tenant checks when optimizing this path.

2. **Caddy consumes substantial CPU.** Spike/stress sampled maxima reached about 148-150% (1.5 cores). Current `Caddyfile` enables zstd/gzip, least-connection balancing across two apps, upstream keepalive, and health checks. Compression, proxying, TLS record processing, and scheduling are candidates, not function-level findings. TLS handshake p95 is zero in these summaries; repeated handshakes are not demonstrated as the dominant delay. A profile must establish where Caddy spends CPU before changing configuration.

3. **Both Node replicas are active.** Their sampled maxima were approximately 86-88% each in spike/stress. This does not establish exact request balance, but contradicts an idle second replica. More replicas on an already saturated four-core host are not the first justified change.

4. **Common optimizations already exist.** `src/lib/auth-edge.ts` caches verified JWTs while checking expiry on hits. `src/lib/dashboard-response.ts` reuses serialized JSON. Tracked local dashboard caching and prepared-read registration also exist. Do not propose these as missing features.

5. **Native warm transport falls back to fresh authorization.** `getWarmSessionFromRequest` deliberately returns null. The standalone adapter attempts that shortcut before invoking the ordinary guarded handler, whose response still allocates Response/Headers/stream wrappers. An asynchronous native response path after the same authorization checks is a profiling candidate, not a proven fix. Do not bypass fresh account eligibility checks to enable the shortcut.

6. **Elapsed timing is not CPU attribution.** `scripts/standalone-server.cjs` emits Node timing by default. It includes awaited authorization/database time but excludes pre-dispatch waiting and socket delivery. Spike Node p95 was 321 ms; estimated outside-Node wait p95 was 452 ms. These percentiles cannot be added, and the residual cannot be assigned wholly to Caddy.

7. **Full instrumentation overhead is not established.** Summaries contain Node elapsed time but no auth/handler/database phase metrics. The cloud runner starts read-only host/container samplers. The optional `deployment/compose.diagnostics.yml` plus `scripts/performance-preload.cjs` support detailed collection; the overlay defaults CPU profiling off and collection needs explicit activation. Do not assume that profiler was active during the saved runs.

## Next phase to prepare

- Confirm deployed runtime settings and active instrumentation.
- Capture bounded Caddy and both Node CPU profiles during the same peak, plus authorization/query/pool-wait timing; inspect the authorization query plan.
- Investigate Caddy processing and fresh authorization/response handling first. Preserve tenant isolation, revocation, and response correctness.
- Keep workload, pacing, and account pool constant. The user runs new load tests. Measure profiler overhead and compare each targeted change with the baseline.
- More RAM, larger connection pools, longer cache TTLs, and extra replicas are not justified by these measurements alone.

Phase 1 complete. Exact expensive functions, deployed settings, request distribution, profiling overhead, and a proven performance fix remain unverified.
