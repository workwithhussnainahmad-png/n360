# First CPU profile findings

Analyzed 2026-10-12 (Asia/Karachi). Evidence: `test-results/cloud-2026-10-11T23-40-15-001Z`. No new test, deployment, or performance fix performed during analysis.

## Capture and workload

All three collectors exited 0. Caddy's gzip protobuf decoded successfully. Both Node profiles contain approximately 2899 samples spanning 30.4 seconds, with requested 10-ms sampling. Capture occurred during the five-minute 2200-VU stress peak. Accounts: 1500 distinct students shared across 2200 VUs.

Stress passed every configured threshold: 1,633,524 requests, zero HTTP failures, all response checks passed. HTTP p95 294.67 ms, p99 406.73 ms; peak successful throughput 3221.17 requests/sec. The immediately preceding unprofiled stress run (`cloud-2026-10-11T23-17-50-402Z`) had p95 287.08 ms, p99 379.42 ms, 1,635,854 requests. This is approximately 2.6% higher p95 and 0.14% fewer requests; one run pair cannot isolate profiler overhead from normal variation. No application performance change had been deployed.

## Sample attribution

Node percentages below are time-delta-weighted leaf samples including idle, not percentages of total host CPU. They omit descendants when counting a function's own samples; broad groups are descriptive, not an exhaustive breakdown.

| Leaf sample group | App | App2 |
| --- | ---: | ---: |
| Native writev/writeUtf8String | 19.11% | 16.22% |
| PostgreSQL client/protocol/pool/type files | 7.65% | 7.86% |
| NextRequest / _Request constructors | 3.49% | 2.60% |
| Garbage collector | 2.53% | 2.64% |
| Idle | 8.55% | 8.89% |

Other samples are distributed across application, framework, HTTP handling, callbacks, and runtime work. Network-write samples can include both response writes and database socket writes; they are not all response serialization. `pg/lib/result.js:addFields` alone appears at about 2.3-2.5% leaf time. Both replicas show broadly similar costs.

Caddy recorded 36.85 CPU-seconds during roughly 30 seconds of capture (multithreaded process). Approximate inclusive stack categories: TLS 11.91%, GC-related stacks 13.19%; categories may overlap. Native syscall leaf time is about 17%. No samples matched gzip/flate or klauspost compression implementation stacks in this capture. The `encode.ServeHTTP` wrapper has about 32% inclusive time, but includes downstream proxy work and must not be called 32% compression cost. HTTP/2 handling, reverse proxy, socket I/O, allocation and runtime scheduling are substantial parts of the profile.

## Implications for phase 3

- Compression is not supported as the first optimization target by this workload's profile. Do not disable it based on the wrapper's cumulative percentage.
- Fresh authorization incurs database-client processing even for cached dashboards. Optimize query/driver handling only while preserving immediate eligibility, revocation and tenant checks; profile evidence does not justify caching away those checks.
- Inspect the authenticated response path for avoidable Request/Response/Headers/stream allocations and repeated socket writes. The current synchronous native-warm shortcut cannot authorize asynchronously and returns null. An async native path after the same authorization guard is a candidate, not yet a proven improvement.
- Both app processes do meaningful work; adding replicas to the same CPU-saturated host is not established as beneficial.
- First inspect the exact deployed bundle/source mappings for the sampled request constructors and database handling. Select one bounded implementation change, then compare the same workload after the user deploys it.
- No single sampled function explains the entire throughput ceiling. PostgreSQL server query execution, pool wait, per-request phase latency and exact instrumentation overhead remain unmeasured at function level.

Method: Node sample IDs resolved to call frames and weighted by timeDeltas. Caddy pprof protobuf sample cpu/nanosecond values resolved through location/function/string tables; cumulative categories count each sample once per category. Profile files remain excluded from Git.
