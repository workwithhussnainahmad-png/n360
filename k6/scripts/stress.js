/**
 * Stress — ramp until the local (VPS-capped) stack breaks → max concurrent users.
 *
 * Watch `docker stats` in parallel. Uses the same strict gates as load/spike.
 * DURATION controls the peak hold (default five minutes) after the final ramp.
 *
 *   $env:BASE_URL="http://localhost:3000"
 *   k6 run scripts/stress.js
 *
 * More aggressive:
 *   k6 run -e MAX_VUS=500 scripts/stress.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { baseUrl, authHeaders, portalPath, strictThresholds, summaryTrendStats } from '../config.js';
import { loadTokens, pickToken, validateTokenCapacity } from '../lib/tokens.js';
import { recordDiagnostics, configureDiagnostics } from '../lib/diagnostics.js';

import { workload } from '../lib/workload.mjs';

const plan = workload('stress', __ENV);
configureDiagnostics(plan);
const tokens = loadTokens();
validateTokenCapacity(tokens, plan);
const dashTrend = new Trend('dashboard_ms');
const failRate = new Rate('business_fail');

export const options = {
  maxRedirects: 0,
  summaryTrendStats,
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: plan.stages,
      gracefulRampDown: '1m',
    },
  },
  thresholds: {
    ...strictThresholds,
    'dashboard_ms{role:STUDENT}': [], 'dashboard_ms{role:STAFF}': [],
    'http_req_duration{endpoint:dashboard}': [],

  },
};

export function setup() {
  if (!tokens.length) {
    throw new Error('tokens.json empty. Run npm.cmd run k6:tokens first.');
  }
  const h = http.get(`${baseUrl()}/api/health`);
  if (h.status !== 200) throw new Error(`Health failed: ${h.status}`);
}

export default function stress() {
  const url = baseUrl();
  const { token, role } = pickToken(tokens, __VU);
  const headers = authHeaders(token);

  const dash = http.get(`${url}${portalPath(role)}`, { headers, tags: { endpoint: "dashboard", role } });
  dashTrend.add(dash.timings.duration, { role });
  recordDiagnostics(dash, role, 'dashboard');
  failRate.add(dash.status !== 200);

  check(dash, {
    'dashboard 200': (r) => r.status === 200,
    'not 429/502/503': (r) => ![429, 502, 503].includes(r.status),
  });

  // Less think time under stress = harder on VPS
  sleep(plan.thinkSeconds);
}
