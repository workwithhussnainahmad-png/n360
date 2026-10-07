// Offline analysis only: no traffic, process launches, credentials or data changes.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const read = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
const quantile = (values, p) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
};
const result = { diagnostics: [], suite: [], environment: {}, checkpointHashes: [] };
for (const name of readdirSync('.codex/performance').filter(n => n.startsWith('run-'))) {
  const dir = join('.codex/performance', name);
  if (!existsSync(join(dir, 'run.json'))) continue;
  const run = JSON.parse(read(join(dir, 'run.json')));
  if (run.verificationOnly) continue;
  const output = { directory: dir, ...run, replicasMeasured: [] };
  for (const replica of ['app', 'app2']) {
    if (!existsSync(join(dir, replica + '.jsonl'))) continue;
    const rows = read(join(dir, replica + '.jsonl')).trim().split(/\r?\n/).map(JSON.parse);
    const intervals = rows.filter(r => r.type === 'interval');
    const peak = intervals.filter(r => Date.parse(r.time) >= Date.parse(run.startedAt) + 190000 && Date.parse(r.time) <= Date.parse(run.startedAt) + 480000);
    const metrics = {};
    for (const key of ['db_pool_wait', 'db_query', 'redis']) {
      const values = peak.map(r => r.metrics[key]).filter(Boolean);
      const count = values.reduce((s, v) => s + v.count, 0);
      metrics[key] = { count, weightedMeanMs: count ? values.reduce((s, v) => s + v.count * v.meanMs, 0) / count : null };
    }
    const profile = JSON.parse(read(join(dir, replica + '.cpuprofile')));
    const nodes = new Map(profile.nodes.map(n => [n.id, n]));
    const self = new Map(); let total = 0;
    for (let i = 0; i < profile.samples.length; i++) {
      const frame = nodes.get(profile.samples[i]).callFrame;
      const key = frame.functionName + ' ' + frame.url;
      const weight = profile.timeDeltas[i]; total += weight;
      self.set(key, (self.get(key) || 0) + weight);
    }
    output.replicasMeasured.push({ replica, peakIntervals: peak.length,
      cpuMedianPercent: quantile(peak.map(r => r.cpuPercent), .5),
      eluMedian: quantile(peak.map(r => r.eventLoopUtilization), .5),
      loopP95MedianMs: quantile(peak.map(r => r.loopP95Ms), .5),
      loopMaxMs: Math.max(...peak.map(r => r.loopMaxMs)),
      poolWaitingMax: Math.max(...peak.flatMap(r => r.pools.map(p => p.waiting))),
      rssMaxMiB: Math.max(...intervals.map(r => r.memory.rss)) / 1048576, metrics,
      profileSelfTop: [...self].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([frame, weight]) => ({ frame, percentOfSampleTime: weight / total * 100 })) });
  }
  const stats = read(join(dir, 'docker-stats.jsonl')).trim().split(/\r?\n/).map(JSON.parse);
  output.resourceSamples = [...new Set(stats.map(r => r.Name))].map(name => {
    const rows = stats.filter(r => r.Name === name);
    return { name, samples: rows.length, cpuMedian: quantile(rows.map(r => parseFloat(r.CPUPerc)), .5), cpuP95: quantile(rows.map(r => parseFloat(r.CPUPerc)), .95), memoryLimit: rows[0].MemUsage.split(' / ')[1] };
  });
  const lines = read(join(dir, 'pgbouncer.txt')).split(/\r?\n/);
  let headers = []; const pools = [], statsRows = [];
  for (const line of lines) {
    if (line.includes('cl_active') || line.includes('total_xact_count')) headers = line.split('|').map(s => s.trim());
    else if (/^\s+app\s+\|/.test(line)) {
      const row = Object.fromEntries(line.split('|').map((v, i) => [headers[i], v.trim()]));
      (headers.includes('cl_active') ? pools : statsRows).push(row);
    }
  }
  output.pgbouncer = { samples: pools.length, maxClientWaiting: Math.max(...pools.map(r => +r.cl_waiting)), maxServerActive: Math.max(...pools.map(r => +r.sv_active)), medianIntervalAvgQueryMs: quantile(statsRows.map(r => +r.avg_query_time / 1000), .5), maxIntervalAvgWaitMs: Math.max(...statsRows.map(r => +r.avg_wait_time / 1000)) };
  result.diagnostics.push(output);
}
for (const dir of readdirSync('test-results')) {
  if (!existsSync(join('test-results', dir, '1000vu-load.txt'))) continue;
  for (const name of readdirSync(join('test-results', dir)).filter(n => n.endsWith('.txt'))) {
    const text = read(join('test-results', dir, name));
    result.suite.push({ file: join('test-results', dir, name), start: text.match(/Started: (.+)/)?.[1], finish: text.match(/Finished: (.+)/)?.[1], launcher: text.match(/(?:load|stress|spike): native k6[^\r\n]+/)?.[0], http: text.split(/\r?\n/).find(l => l.trim().startsWith('http_req_duration.'))?.trim(), rate: text.split(/\r?\n/).find(l => l.trim().startsWith('http_reqs.'))?.trim(), proxyMetricPresent: /proxy_ms/.test(text), diagnosticsPresent: /perf_node_ms/.test(text), failures: text.split(/\r?\n/).find(l => l.trim().startsWith('http_req_failed.'))?.trim() });
  }
}
for (const line of read('.env').split(/\r?\n/)) {
  const match = line.match(/^(DATABASE_URL|DIRECT_URL|REDIS_URL|NODE_OPTIONS|DB_POOL_MAX|HOT_PATH_LANE|HOT_PATH_JSON_BODY|PORT|HOSTNAME|KEEP_ALIVE_TIMEOUT|PERF_DIAGNOSTICS)=(.*)$/);
  if (!match) continue;
  let value = match[2].replace(/^['"]|['"]$/g, '');
  if (match[1].endsWith('URL')) {
    try { const u = new URL(value); value = `${u.protocol}//${u.hostname}:${u.port}${u.pathname}${u.search}`; }
    catch { value = '(unparsed, redacted)'; }
  }
  result.environment[match[1]] = value;
}
const checkpoint = JSON.parse(read('.codex/capacity-serialized-checkpoint.json'));
for (const file of checkpoint.files) result.checkpointHashes.push({ path: file.path, matches: createHash('sha256').update(readFileSync(file.path)).digest('hex') === file.sha256.toLowerCase() });
const tokens = JSON.parse(read('k6/tokens.json')).tokens;
result.tokenInventory = Object.fromEntries([...new Set(tokens.map(t => t.roleHint))].map(role => [role, tokens.filter(t => t.roleHint === role).length]));
writeFileSync('docs/performance-discrepancy-evidence.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ environment: result.environment, checkpointHashes: result.checkpointHashes, tokenInventory: result.tokenInventory, suiteRuns: result.suite.length, suiteWithProxyMetric: result.suite.filter(r => r.proxyMetricPresent).length, diagnostics: result.diagnostics.map(({ directory, replicasMeasured, pgbouncer, resourceSamples }) => ({ directory, replicasMeasured: replicasMeasured.map(({ profileSelfTop, ...r }) => r), pgbouncer, resourceSamples })) }, null, 2));
