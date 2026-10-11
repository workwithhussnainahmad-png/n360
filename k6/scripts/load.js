/**
 * Load — steady concurrent portal browsing (dashboard-heavy).
 * Select STUDENT, STAFF, or INSTITUTION with TEST_ROLE.
 *
 *   $env:BASE_URL="http://localhost:3000"
 *   .\prepare-tokens.ps1
 *   k6 run scripts/load.js
 *
 * Optional:
 *   k6 run -e TARGET_VUS=100 -e DURATION=5m scripts/load.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { baseUrl, authHeaders, portalPath, strictThresholds, summaryTrendStats } from '../config.js';
import { loadTokens, pickToken, validateTokenCapacity } from '../lib/tokens.js';
import { recordDiagnostics, configureDiagnostics } from '../lib/diagnostics.js';

import { workload } from '../lib/workload.mjs';

const plan = workload('load', __ENV);
configureDiagnostics(plan);
const tokens = loadTokens();
validateTokenCapacity(tokens, plan);
const dashTrend = new Trend('dashboard_ms');
const timetableTrend = new Trend('timetable_ms');
const secondaryTrend = new Trend('secondary_ms');
const failRate = new Rate('business_fail');

const targetVus = plan.vus;

export const options = {
  maxRedirects: 0,
  summaryTrendStats,
  scenarios: {
    portal_browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: plan.stages,
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    ...strictThresholds,
    'dashboard_ms{role:STUDENT}': [], 'dashboard_ms{role:STAFF}': [],
    'http_req_duration{endpoint:dashboard}': [],
    'http_req_duration{endpoint:timetable}': [], 'http_req_duration{endpoint:profile}': [],
  },
};

export function setup() {
  if (!tokens.length) {
    throw new Error('tokens.json empty. Run npm.cmd run k6:tokens first.');
  }
  const h = http.get(`${baseUrl()}/api/health`);
  if (h.status !== 200) throw new Error(`Health failed: ${h.status}`);
  console.log(`Load test against ${baseUrl()} with ${tokens.length} tokens, target VUs=${targetVus}`);
}

export default function load() {
  const url = baseUrl();
  const { token, role } = pickToken(tokens, __VU);
  const headers = authHeaders(token);

  // Hot path: single aggregate dashboard (post-optimization)
  const dash = http.get(`${url}${portalPath(role)}`, { headers, tags: { endpoint: "dashboard", role } });
  recordDiagnostics(dash, role, 'dashboard');
  dashTrend.add(dash.timings.duration, { role });
  const dashOk = check(dash, {
    'dashboard 200': (r) => r.status === 200,
  });
  failRate.add(!dashOk);

  // Occasional secondary screens (lazy-fetch pattern)
  if (__ITER % 5 === 0) {
    const timetable = http.get(`${url}${portalPath(role, 'timetable')}`, { headers, tags: { endpoint: 'timetable', role } });
    recordDiagnostics(timetable, role, 'timetable');
    timetableTrend.add(timetable.timings.duration, { role });
    check(timetable, { 'timetable 200': (r) => r.status === 200 });
  }
  if (__ENV.INCLUDE_UNREAD === 'true' && __ITER % 7 === 0) {
    const unread = http.get(`${url}/api/me/notifications/unread-count`, { headers, tags: { endpoint: 'unread', role } });
    recordDiagnostics(unread, role, 'unread');
    check(unread, { 'unread 200': (r) => r.status === 200 });
  }
  if (__ITER % 11 === 0) {
    const page = role === 'INSTITUTION' ? 'academics' : 'profile';
    const profile = http.get(`${url}${portalPath(role, page)}`, { headers, tags: { endpoint: page, role } });
    recordDiagnostics(profile, role, page);
    secondaryTrend.add(profile.timings.duration, { role });
    check(profile, { 'secondary page 200': (r) => r.status === 200 });
  }

  // Think time — real users don't hammer every 0ms
  sleep(plan.thinkSeconds);
}
