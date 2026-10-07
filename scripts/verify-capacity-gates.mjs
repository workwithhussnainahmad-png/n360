// Evaluate scenario configuration offline; no tokens, HTTP or k6 execution.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

for (const scenario of ['load', 'spike', 'stress']) {
  const context = createContext({ __ENV: { TARGET_VUS: '2000', SPIKE_VUS: '2000', MAX_VUS: '2000' } });
  const stub = exports => new SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const config = new SourceTextModule(readFileSync(new URL('../k6/config.js', import.meta.url), 'utf8'), { context });
  const modules = {
    'k6/http': stub({ default: { get() { throw new Error('HTTP forbidden in offline check'); } } }),
    k6: stub({ check() {}, sleep() {} }),
    'k6/metrics': stub({ Rate: class {}, Trend: class {} }),
    '../config.js': config,
    '../lib/tokens.js': stub({ loadTokens: () => [], pickToken() {} }),
    '../lib/diagnostics.js': stub({ recordDiagnostics() {} }),
  };
  const script = new SourceTextModule(readFileSync(new URL(`../k6/scripts/${scenario}.js`, import.meta.url), 'utf8'), { context });
  await script.link(name => {
    assert.ok(modules[name], `Unexpected import ${name}`);
    return modules[name];
  });
  await script.evaluate();
  const options = JSON.parse(JSON.stringify(script.namespace.options));
  assert.deepEqual(options.thresholds, {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<1000', 'p(99)<1000'],
    checks: ['rate==1'], dashboard_ms: ['p(95)<500'], business_fail: ['rate==0'],
  });
  const { stages } = Object.values(options.scenarios)[0];
  const target = 2000;
  assert.equal(Math.max(...stages.map(stage => stage.target)), target);
  assert.ok(stages.some((stage, i) => i > 0 && stage.target === target && stages[i - 1].target === target), 'Peak must have a hold, not just a ramp');
  console.log(`${scenario}: strict gates and ${target}-VU peak hold verified offline`);
}
