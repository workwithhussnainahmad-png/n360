# Saved-results analysis: 2026-10-11

Source: test-results/2026-10-11T09-20-44-834Z. Completed six-run suite; label deployed-7b75333 is user supplied, not independent revision verification. No tests or server commands were run during this analysis.

All 12,589 failed diagnostic observations have status 0. All 664,915 remaining observations have status 200 and error code 0. Setup requests are excluded from diagnostics. No observed 401, 403, 429, 500, 502 or 503 responses. Failure logs show timeouts, unexpected EOF and TCP resets. Failed requests without response headers do not reveal whether they reached the application.

| Run | Transport failures | Peak successful req/s | Peak success p95 upper bound (ms) | Whole-run receiving p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| 01-1000vu-spike | 652 | 176.2 | 3700 | 3699.9 |
| 02-1000vu-load | 411 | 237.9 | 16500 | 8854.6 |
| 03-1000vu-stress | 1328 | 238.0 | 18000 | 1330.3 |
| 04-1500vu-spike | 1185 | 123.7 | 17400 | 10198.3 |
| 05-1500vu-load | 2670 | 241.8 | 21100 | 13926.2 |
| 06-1500vu-stress | 6343 | 137.2 | 26100 | 1670.4 |

Peak percentiles are histogram upper bounds, not exact percentiles. Completion-window assignment includes requests started earlier. HTTP failures and interrupted iterations must not be counted as successful capacity.

The 1500-VU load summary has 2.24% HTTP failures and 32.16-second HTTP p95; stress has 3.39% failures and 25.33-second p95. Successful responses use HTTP/2. The public target traverses the edge; this does not establish the edge as the cause. Body receiving, connection and TLS delays are visible, but there is no correlated generator utilization, origin CPU, pool-wait or origin timing evidence in these results. Missing origin timing is not zero processing time.

Current code inspection: Compose sets both Node keep-alive timeouts to 65 seconds while Caddy upstream keepalive is 60 seconds. There is no repository mismatch here to fix. Dashboard responses already send complete serialized bodies with calculated byte lengths. Fresh authorization remains mandatory. These results do not justify disabling security, enlarging pools, raising timeouts, or declaring the previous cache fixes responsible for a gain/regression.

## Change prepared

The standalone hot-path adapter now emits X-Perf-Node-Ms for handled responses, including its guarded error paths, without the opt-in observer. The existing local k6 diagnostics consume this header into perf_node_ms and perf_outside_node_wait_ms. Timing spans adapter entry through response preparation, including authorization and body materialization; it excludes delivery and pre-dispatch waiting. This is an observability fix, not a proven throughput improvement. Cancelled clients also skip the non-Response error write.

Validation is source/diff review only at the user's request. No build, tests, benchmark, deployment or server configuration changes were performed. After the user deploys, a user-run controlled reproduction should retain these timings. Fast Node timings with slow client timings would direct the next investigation toward proxy/transport/generator behavior; slow Node timings would justify focused origin profiling. Failed requests may still lack timings. 1550-VU capacity remains unverified.
