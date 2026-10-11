/**
 * Spike — sudden burst of concurrent portal users, then calm.
 * Checks whether the local stack recovers (errors drop, latency returns).
 *
 *   $env:BASE_URL="http://localhost:3000"
 *   k6 run scripts/spike.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { baseUrl, authHeaders, portalPath, strictThresholds, summaryTrendStats } from '../config.js';
import { loadTokens, pickToken, validateTokenCapacity } from '../lib/tokens.js';
import { recordDiagnostics, configureDiagnostics } from '../lib/diagnostics.js';

import { workload } from '../lib/workload.mjs';

const plan = workload('spike', __ENV);
configureDiagnostics(plan);
const tokens = loadTokens();
validateTokenCapacity(tokens, plan);
const dashTrend = new Trend('dashboard_ms');
const failRate = new Rate('business_fail');

export const options = {
  maxRedirects: 0,
  summaryTrendStats,
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: plan.stages,
    },
  },
  thresholds: {
    ...strictThresholds,
    'dashboard_ms{role:STUDENT}': [], 'dashboard_ms{role:STAFF}': [],
    'http_req_duration{endpoint:dashboard}': [],

  },
};

export function setup() {
  if (!tokens.length) throw new Error('tokens.json empty. Run npm.cmd run k6:tokens first.');
}

export default function spike() {
  const { token, role } = pickToken(tokens, __VU);
  const dash = http.get(`${baseUrl()}${portalPath(role)}`, {
    headers: authHeaders(token), tags: { endpoint: "dashboard", role },
  });
  dashTrend.add(dash.timings.duration, { role });
  recordDiagnostics(dash, role, 'dashboard');
  const ok = check(dash, { 'dashboard 200': (r) => r.status === 200 });
  failRate.add(!ok);
  sleep(plan.thinkSeconds);
}
