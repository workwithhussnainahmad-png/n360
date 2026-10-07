import fs from 'node:fs';
import path from 'node:path';
const directory = process.argv[2];
if (!directory) throw Error('Pass a run-headroom-diagnostic artifact directory');
const lines = name => fs.readFileSync(path.join(directory, name), 'utf8').trim().split('\n').map(JSON.parse);
const result = { apps: {}, pgbouncer: {}, limitations: 'Snapshot queue maxima may miss short bursts. Duration means are weighted by operation count. Interval percentiles are not combined into a run percentile. Client query duration includes transport and scheduling. GC totals are elapsed pause observations, not CPU samples.' };
for (const name of ['lms-backend-app-1', 'nisaab360-app2']) {
  const rows = lines(`${name}.jsonl`).filter(r => r.type === 'interval');
  const metrics = {};
  for (const row of rows) for (const [key, value] of Object.entries(row.metrics)) {
    const total = metrics[key] ??= { count: 0, totalMs: 0, maxMs: 0 };
    total.count += value.count; total.totalMs += value.count * value.meanMs;
    total.maxMs = Math.max(total.maxMs, value.maxMs);
  }
  for (const metric of Object.values(metrics)) metric.meanMs = metric.totalMs / metric.count;
  result.apps[name] = {
    intervals: rows.length, elapsedMs: rows.reduce((sum, row) => sum + row.elapsedMs, 0),
    maxPoolWaiting: Math.max(...rows.flatMap(row => row.pools.map(pool => pool.waiting))),
    maxInflight: Math.max(...rows.map(row => row.requests.inFlight)),
    gcTotalMs: rows.reduce((sum, row) => sum + Object.values(row.gc).reduce((s, gc) => s + gc.totalMs, 0), 0),
    maxLoopMs: Math.max(...rows.map(row => row.loopMaxMs)), metrics,
    lastCacheCounters: rows.at(-1)?.cache,
  };
}
const pg = lines('pgbouncer.jsonl').map(row => {
  const data = row.output.split('\n');
  const fields = data[0].split(',');
  const values = data.find(line => line.startsWith('app,'))?.split(',');
  return Object.fromEntries(fields.map((field, index) => [field, values?.[index]]));
});
result.pgbouncer = {
  samples: pg.length, maxWaiting: Math.max(...pg.map(row => +row.cl_waiting)),
  maxActiveServers: Math.max(...pg.map(row => +row.sv_active)),
  maxWaitSeconds: Math.max(...pg.map(row => +row.maxwait + +row.maxwait_us / 1e6)),
};
fs.writeFileSync(path.join(directory, 'diagnostic-analysis.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ pgbouncer: result.pgbouncer, apps: Object.fromEntries(Object.entries(result.apps).map(([name, row]) => [name, { ...row, metrics: Object.fromEntries(Object.entries(row.metrics).filter(([key]) => key.startsWith('db_'))), lastCacheCounters: undefined }])) }, null, 2));
