import { Trend } from 'k6/metrics';
import exec from 'k6/execution';
import { responseTags, failureSample } from './diagnostic-policy.mjs';
import { windowAt } from './workload.mjs';

const observations = new Trend('diag_request_ms');
const success = new Trend('diag_success_ms');
const failure = new Trend('diag_failure_ms');
let plan;
let samples = 0;
export function configureDiagnostics(value) { plan = value; }

const enabled = __ENV.PERF_DIAGNOSTICS === 'true';
const phases = ['node', 'auth', 'handler', 'db-pool-wait', 'db-query', 'redis'];
const trends = enabled ? Object.fromEntries(phases.map(phase => [phase, new Trend(`perf_${phase.replaceAll('-', '_')}_ms`)])) : {};
const outsideNode = enabled ? new Trend('perf_outside_node_wait_ms') : null;
// Caddy supplies this local timing without Node profiling or database sampling.
const proxyTrend = new Trend('proxy_ms');
const outsideProxy = new Trend('outside_proxy_wait_ms');

export function recordDiagnostics(response, role, page) {
  const window = plan ? windowAt(plan, (Date.now() - exec.scenario.startTime) / 1000) : 'other';
  const labels = responseTags(response, role, page, window);
  observations.add(response.timings.duration, labels);
  const ok = response.status === 200 && !response.error_code;
  (ok ? success : failure).add(response.timings.duration, { endpoint: labels.endpoint, window });
  // At most 10 sanitized samples per single-generator run, not 10 per VU.
  if (!ok && __VU <= 5 && samples < 2) {
    samples++;
    console.warn(`DIAG_FAILURE ${JSON.stringify(failureSample(response, labels, `k6-${__VU}-${__ITER}`))}`);
  }
  const tags = { role, page };
  const proxyHeader = response.headers['X-Perf-Proxy-Ms'];
  const proxyMs = Number(proxyHeader);
  if (proxyHeader !== undefined && Number.isFinite(proxyMs)) {
    proxyTrend.add(proxyMs, tags);
    outsideProxy.add(Math.max(0, response.timings.waiting - proxyMs), tags);
  }
  if (!enabled) return;
  let nodeMs;
  for (const phase of phases) {
    const header = response.headers[`X-Perf-${phase.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('-')}-Ms`];
    if (header === undefined) continue;
    const duration = Number(header);
    if (!Number.isFinite(duration)) continue;
    trends[phase].add(duration, tags);
    if (phase === 'node') nodeMs = duration;
  }
  // Approximation: includes network/Caddy/pre-HTTP-event waiting, not one named cause.
  if (nodeMs !== undefined) outsideNode.add(Math.max(0, response.timings.waiting - nodeMs), tags);
}
