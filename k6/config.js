/**
 * Shared helpers for lms-backend k6 tests (local stack).
 * Default BASE_URL is http://localhost:3000
 */

export function baseUrl() {
  // Optional two-replica direct comparison; normal Caddy workloads are unchanged.
  const direct = (__ENV.BASE_URLS || '').split(',').map(value => value.trim()).filter(Boolean);
  const selected = direct.length ? direct[Math.max(0, (__VU || 1) - 1) % direct.length] : __ENV.BASE_URL;
  const url = (selected || 'http://localhost:3000').replace(/\/$/, '');
  return url;
}

export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Request-ID': `k6-${__VU}-${__ITER}`,
  };
}

export function portalPath(role, page = 'dashboard') {
  const portal = { STUDENT: 'student', STAFF: 'staff', INSTITUTION: 'institution' }[role];
  if (!portal) throw new Error(`Unsupported test role: ${role}`);
  return `/api/${portal}/${page}`;
}

/** Default thresholds for “healthy under load”. */
export const defaultThresholds = {
  http_req_failed: ['rate<0.05'],
  http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  checks: ['rate>0.95'],
};

/** Capacity acceptance gates shared by load, spike and stress. */
export const strictThresholds = {
  http_req_failed: ['rate==0'],
  http_req_duration: __ENV.DISABLE_LATENCY_THRESHOLDS === 'true' ? [] : ['p(95)<1000', 'p(99)<2000'],
  checks: ['rate==1'],
  dashboard_ms: __ENV.DISABLE_LATENCY_THRESHOLDS === 'true' ? [] : ['p(95)<500'],
  business_fail: ['rate==0'],
};

// Include the acceptance percentile in saved summaries as well as terminal gates.
export const summaryTrendStats = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];

/** Stricter for smoke. */
export const smokeThresholds = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<1500'],
  checks: ['rate>0.99'],
};
