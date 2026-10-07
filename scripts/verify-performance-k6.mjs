/** Offline metric/header regression. Executes no k6 runtime or HTTP requests. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

for (const enabled of [false, true]) {
  const records = [];
  const context = createContext({ __ENV: { PERF_DIAGNOSTICS: String(enabled) } });
  const metrics = new SyntheticModule(['Trend'], function () {
    this.setExport('Trend', class {
      constructor(name) { this.name = name; }
      add(value, tags) { records.push({ name: this.name, value, tags }); }
    });
  }, { context });
  const diagnosticModule = new SourceTextModule(readFileSync(new URL('../k6/lib/diagnostics.js', import.meta.url), 'utf8'), { context });
  await diagnosticModule.link(() => metrics);
  await diagnosticModule.evaluate();
  const response = { headers: {
    'X-Perf-Node-Ms': '80', 'X-Perf-Auth-Ms': '10', 'X-Perf-Handler-Ms': '20',
    'X-Perf-Db-Pool-Wait-Ms': '2', 'X-Perf-Db-Query-Ms': '5', 'X-Perf-Redis-Ms': '3',
  }, timings: { waiting: 100 } };
  diagnosticModule.namespace.recordDiagnostics(response, 'STUDENT', 'dashboard');
  assert.equal(records.length, enabled ? 7 : 0);
  if (enabled) {
    assert.equal(records.find(row => row.name === 'perf_outside_node_wait_ms').value, 20);
    assert.equal(records.find(row => row.name === 'perf_db_pool_wait_ms').value, 2);
    response.timings.waiting = 70;
    diagnosticModule.namespace.recordDiagnostics(response, 'STAFF', 'profile');
    assert.equal(records.at(-1).value, 0);
    const beforeMissing = records.length;
    diagnosticModule.namespace.recordDiagnostics({ headers: {}, timings: { waiting: 2 } }, 'STAFF', 'profile');
    assert.equal(records.length, beforeMissing, 'Missing diagnostic headers must not invent zero timings');
  }
  const beforeProxy = records.length;
  diagnosticModule.namespace.recordDiagnostics({ headers: { 'X-Perf-Proxy-Ms': '90' }, timings: { waiting: 120 } }, 'STAFF', 'dashboard');
  assert.equal(records.length, beforeProxy + 2, 'Proxy measurements work without Node profiling');
  assert.equal(records.at(-2).name, 'proxy_ms');
  assert.equal(records.at(-2).value, 90);
  assert.equal(records.at(-1).name, 'outside_proxy_wait_ms');
  assert.equal(records.at(-1).value, 30);
  diagnosticModule.namespace.recordDiagnostics({ headers: { 'X-Perf-Proxy-Ms': 'invalid' }, timings: { waiting: 120 } }, 'STAFF', 'dashboard');
  assert.equal(records.length, beforeProxy + 2, 'Invalid proxy timing is omitted');
}
console.log('Offline diagnostic metric checks passed: header names, optional metrics, wait-gap calculation, and missing-header handling. No k6 or HTTP executed.');
