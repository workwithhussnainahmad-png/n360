# Phase 2: CPU capture prepared

Date: 2026-10-12, Asia/Karachi. Preparation complete; user-run evidence pending.

## Read-only production inspection

- Both app containers run Node v24.21.0 with `scripts/standalone-server.cjs`, 1024-MB V8 heap settings, DB_POOL_MAX=15, prepared reads enabled, and the hot-path lane enabled.
- Neither app has the optional diagnostics preload enabled. Their Docker image IDs differ; this alone does not establish different application code. Preserve both identities in the existing collector's metadata.
- Active Caddy configuration confirms gzip/zstd, app:3000 and app2:3000, least_conn, 60-second upstream idle timeout, 1024 total/512 per-host idle connections. Configuration SHA256: `6dea774bbfafdec6a0473884ce600f442804f21eaa74985fa23a2781bf3a6463`.
- Caddy's loopback admin profiling endpoint is available. No endpoint was exposed or configuration changed.
- Read-only EXPLAIN for the current fresh-student authorization SQL selected indexed nested-loop joins: students_id_institution_unique, institutions_status_created_idx, institutions_pkey. Estimated total cost 7.23 and one row. This is not runtime timing or proof about pooled generic prepared plans. No EXPLAIN ANALYZE or load test ran.

## User command

```powershell
.\run-cloud-profile.ps1
```

Runs one existing 2200-VU stress workload on the cloud generator, directly to origin, with 1500 shared student accounts and normal latency/error reporting. Allow approximately 22-25 minutes. The ordinary `run-cloud-test.ps1` still runs all three tests and continues on threshold failures.

Twenty seconds after the estimated start of the five-minute peak, the worker emits a capture marker. The local runner concurrently starts 30-second Caddy and both Node CPU captures through existing SSH access. The marker uses first workload response timing, so it is approximate. Each capture records its actual start/end timestamps; the processes are not perfectly synchronized.

Profiles download beneath the run's `test-results/cloud-.../profiles/` directory, alongside ordinary summaries and resource samples:

- app.cpuprofile, app2.cpuprofile: Node function CPU samples at 10-ms sampling intervals.
- caddy.pb.gz: Caddy CPU profile.
- capture.json and per-profile logs: status and capture windows.

Node capture temporarily activates the container-local inspector via SIGUSR1, installs an in-process 30-second stop timer, and closes the inspector connection/listener after setup. No app restart, deployment, heap snapshot, or public debug port is required. Capture refuses a pre-existing inspector session. If startup fails after activation, inspect the capture log and container loopback inspector state before retrying. The app-owned stop timer survives an SSH disconnect after successful setup; local downloads still require connectivity. Temporary Node profile files remain under /tmp inside the containers for recovery.

Capture failures are reported independently and do not fail the load test. Inspect capture.json before treating profiles as usable; the k6 pass label does not certify profiling success. Ordinary connection/monitor/execution failures retain their existing handling.

## Validation and remaining work

- JavaScript and PowerShell syntax checks passed; source reviewed.
- No benchmark, profiling activation, remote file installation, container restart, or application deployment was performed during preparation.
- First real capture remains unverified until the user runs the command. Profiling adds overhead: compare with the saved unprofiled 2200-VU stress baseline, without attributing all run-to-run change to profiling.
- Detailed request-phase/pool-wait instrumentation is intentionally not enabled here because the deployed apps lack the preload; enabling it would require a separate controlled runtime change. CPU profiles and the query plan are the first evidence step, not a claim that all awaited database time will be explained.

References: [Node inspector API](https://nodejs.org/api/inspector.html), [Caddy profiling](https://caddyserver.com/docs/profiling).
