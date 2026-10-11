// Only bounded enums/numbers become metric tags. Never persist arbitrary bodies/headers.
export function responseTags(response, role, endpoint, window) {
  const status = Number(response.status);
  const error = Number(response.error_code || 0);
  return {
    role: ['STUDENT', 'STAFF', 'INSTITUTION'].includes(role) ? role : 'other',
    endpoint: ['dashboard', 'timetable', 'profile', 'academics', 'unread'].includes(endpoint) ? endpoint : 'other',
    window: ['ramp', 'peak', 'recovery', 'drain'].includes(window) ? window : 'other',
    status: String(Number.isInteger(status) && (status === 0 || status >= 100 && status <= 599) ? status : 'other'),
    error_code: String(Number.isInteger(error) && error >= 0 && error <= 1999 ? error : 'other'),
    protocol: ['HTTP/1.0', 'HTTP/1.1', 'HTTP/2.0'].includes(response.proto) ? response.proto : 'other',
    cache: ['HIT', 'MISS'].includes(response.headers?.['X-Cache']) ? response.headers['X-Cache'] : 'unknown',
  };
}

export function failureSample(response, tags, requestId) {
  const headers = response.headers || {};
  const contentType = String(headers['Content-Type'] || '').split(';')[0].trim().toLowerCase();
  let bodyClass = contentType === 'text/html' ? 'html' : 'other';
  // Parse only small bodies and emit fixed labels, never response text/JSON values.
  if (contentType === 'application/json' && typeof response.body === 'string' && response.body.length <= 4096) {
    bodyClass = 'json';
    try {
      const error = JSON.parse(response.body)?.error;
      const known = { 'Unauthorized': 'unauthorized', 'Forbidden': 'forbidden', 'PASSWORD_CHANGE_REQUIRED': 'password-change', 'Student not found': 'student-missing', 'Internal Server Error': 'internal-error' };
      if (typeof error === 'string' && Object.hasOwn(known, error)) bodyClass = known[error];
    } catch { bodyClass = 'invalid-json'; }
  }
  const safeId = value => /^k6-\d{1,8}-\d{1,12}$/.test(value || '') || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '') ? value : undefined;
  return { ...tags, requestId: safeId(requestId), responseRequestId: safeId(headers['X-Request-Id']),
    cfRay: /^[0-9a-f]{16}-[A-Z]{3}$/i.test(headers['Cf-Ray'] || '') ? headers['Cf-Ray'] : undefined,
    edgeChallenge: headers['Cf-Mitigated'] === 'challenge', bodyClass,
    durationMs: Number.isFinite(response.timings?.duration) ? response.timings.duration : null };
}
