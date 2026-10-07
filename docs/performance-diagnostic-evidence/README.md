# Diagnostic evidence bundle

Read [the report](../server-performance-diagnostic-report.md) first. This directory contains diagnosis artifacts, not application fixes.

The capture scripts restrict database access to the existing local PostgreSQL connection and use SELECT/EXPLAIN. They do not run k6, mutate application records, enable profiling, restart services or change runtime settings. They can warm database/application caches and increment statistics.

Reproduction order from the repository root, PowerShell:

```powershell
node --env-file=.env --import tsx docs/performance-diagnostic-evidence/capture-queries.ts
node --env-file=.env docs/performance-diagnostic-evidence/capture-runtime.mjs
node docs/performance-diagnostic-evidence/capture-details.mjs
node --import tsx docs/performance-diagnostic-evidence/compile-conditional-sql.ts
node docs/performance-diagnostic-evidence/capture-network.mjs
```

The scripts overwrite their diagnostic artifacts. The current report describes the recorded October 1 snapshot, so later recaptures need their own interpretation. `capture-details.mjs` regenerates exact-queries.md; the conditional SQL compiler appends its branches afterwards. The source probe disables Redis **in its own short-lived process** and redirects its pool queries to a read-only direct connection; its counts represent cold/fallback paths. Normal production cache-hit counts and test-time query latency cannot be inferred from that probe. Its concurrent SELECTs shared a single client; driver-side wait is included in elapsedMs, which is not a SQL execution measurement.

`capture-network.mjs` reads the user-provided attachment and saved historical analyzer output; it does not rerun the older tests. `windows-host.json` was captured separately with Get-CimInstance. No secrets or bearer tokens are intentionally stored; supplied terminal text is JWT-redacted and runtime environment inspection uses an allowlist.
