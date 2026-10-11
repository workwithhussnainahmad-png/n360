// Stream aggregation: never retain request bodies, URLs, identity tags or raw samples.
function histogram() { return { count: 0, totalMs: 0, maxMs: 0, bins: new Map() }; }
function add(h, value) {
  if (!Number.isFinite(value) || value < 0) return;
  const bucket = value <= 1000 ? Math.ceil(value) : Math.min(3600000, Math.ceil(value / 100) * 100);
  h.count++; h.totalMs += value; h.maxMs = Math.max(h.maxMs, value);
  h.bins.set(bucket, (h.bins.get(bucket) || 0) + 1);
}
function summarize(h) {
  const entries = [...h.bins].sort((a, b) => a[0] - b[0]);
  const percentile = fraction => { let n = 0; for (const [bound, count] of entries) { n += count; if (n >= Math.ceil(h.count * fraction)) return bound === 3600000 ? Math.max(bound, h.maxMs) : bound; } return null; };
  return { count: h.count, meanMs: h.count ? h.totalMs / h.count : null, maxMs: h.count ? h.maxMs : null, p95UpperBoundMs: percentile(.95), p99UpperBoundMs: percentile(.99) };
}
export function createReport(plan) {
  const groups = new Map();
  const windows = Object.fromEntries(['ramp', 'peak', 'recovery', 'drain', 'other'].map(name => [name, { success: histogram(), failure: histogram(), protocols: {}, cache: {} }]));
  let rejected = 0;
  return {
    ingest(point) {
      if (point.type !== 'Point' || point.metric !== 'diag_request_ms') return;
      const t = point.data?.tags || {};
      if (!windows[t.window] || !['dashboard', 'timetable', 'profile', 'academics', 'unread', 'other'].includes(t.endpoint)
        || !/^(?:0|[1-5]\d\d|other)$/.test(t.status) || !/^(?:\d{1,4}|other)$/.test(t.error_code)) { rejected++; return; }
      const key = JSON.stringify([t.window, t.endpoint, t.status, t.error_code]);
      // Defensive cap; ordinary runs only use a small fraction of these combinations.
      if (!groups.has(key) && groups.size >= 4096) { rejected++; return; }
      if (!groups.has(key)) groups.set(key, { window: t.window, endpoint: t.endpoint, status: t.status, errorCode: t.error_code, count: 0 });
      groups.get(key).count++;
      const protocol = ['HTTP/1.0', 'HTTP/1.1', 'HTTP/2.0'].includes(t.protocol) ? t.protocol : 'other';
      const cache = ['HIT', 'MISS'].includes(t.cache) ? t.cache : 'unknown';
      windows[t.window].protocols[protocol] = (windows[t.window].protocols[protocol] || 0) + 1;
      windows[t.window].cache[cache] = (windows[t.window].cache[cache] || 0) + 1;
      add(windows[t.window][t.status === '200' && t.error_code === '0' ? 'success' : 'failure'], point.data.value);
    },
    finish() {
      return { workload: plan, windowAssignment: 'response completion time relative to scenario start; drain excluded from scheduled rates',
        histogramPrecision: '1ms through 1000ms, 100ms thereafter; percentiles approximate upper bounds', rejectedPoints: rejected,
        outcomes: [...groups.values()], windows: Object.fromEntries(Object.entries(windows).map(([name, h]) => {
          const durationSeconds = plan.windows.filter(w => w.name === name).reduce((sum, w) => sum + w.endSeconds - w.startSeconds, 0);
          const count = h.success.count + h.failure.count;
          return [name, { durationSeconds, requests: count, failures: h.failure.count, failureRate: count ? h.failure.count / count : null, protocols: h.protocols, cache: h.cache,
            successfulRequestsPerSecond: durationSeconds ? h.success.count / durationSeconds : null,
            successLatency: summarize(h.success), failureLatency: summarize(h.failure) }];
        })) };
    },
  };
}
