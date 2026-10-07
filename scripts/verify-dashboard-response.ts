/** Isolated serialization/invalidation checks; no HTTP, DB writes or token issuance. */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

async function main() {
  process.env.NEXT_PHASE = 'phase-production-build';
  process.env.API_ALLOWED_ORIGINS = 'https://allowed.example.test';
  const { redis, getCachedOrFetch } = await import('../src/lib/redis');
  const { decodeDashboardPayload, dashboardResponse, timetableResponse } = await import('../src/lib/dashboard-response');
  const { applyCorsHeaders } = await import('../src/lib/cors');
  const store = new Map<string, string>();
  let reads = 0, fetches = 0, parses = 0, serializations = 0;
  const payload = { firstName: 'Fixture', timetable: [], assignments: [], announcements: [] };
  const json = JSON.stringify(payload);
  const expected = JSON.stringify({ ...payload, coursesEnabled: false });
  store.set('fixture', json);
  Object.assign(redis, {
    status: 'ready',
    get: async (key: string) => { reads++; return store.get(key) ?? null; },
    setex: async (key: string, _ttl: number, value: string) => { store.set(key, value); },
  });
  const fetcher = async () => { fetches++; return { ...payload, firstName: 'Updated' }; };
  const parse = JSON.parse, stringify = JSON.stringify;
  JSON.parse = (...args: Parameters<typeof JSON.parse>) => { parses++; return parse(...args); };
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => { serializations++; return stringify(...args); }) as typeof JSON.stringify;
  try {
    for (let i = 0; i < 10; i++) {
      const cached = await getCachedOrFetch('fixture', 45, fetcher, decodeDashboardPayload);
      const headers = new Headers({ 'x-request-id': String(i) });
      const response = dashboardResponse(cached, false, headers);
      assert.equal(Reflect.get(response, Symbol.for('nisaab360.serialized-json')), expected);
      const allowed = i % 2 === 0;
      applyCorsHeaders(new NextRequest('http://localhost/api/student/dashboard', {
        headers: { origin: allowed ? 'https://allowed.example.test' : 'https://denied.example.test' },
      }), response);
      assert.equal(response.headers.get('x-request-id'), String(i));
      assert.equal(response.headers.get('access-control-allow-origin'), allowed ? 'https://allowed.example.test' : null);
      assert.equal(await response.text(), expected, 'Every Response must have an independent readable stream');
      assert.equal(headers.get('content-type'), null, 'Caller headers must not be mutated');
    }
    assert.equal(reads, 10, 'Each request must still observe Redis invalidation/expiry');
    assert.equal(fetches, 0);
    assert.equal(parses, 1, 'Identical warm JSON should be decoded only once');
    assert.equal(serializations, 1, 'Identical warm payload should be serialized only once');
    const old = await getCachedOrFetch('fixture', 45, fetcher, decodeDashboardPayload);
    const toggled = await dashboardResponse(old, true).text();
    assert.equal(parse(toggled).coursesEnabled, true, 'Course hint updates must not reuse the wrong variant');
    store.delete('fixture');
    const updated = await getCachedOrFetch('fixture', 45, fetcher, decodeDashboardPayload);
    assert.equal(parse(await dashboardResponse(updated, false).text()).firstName, 'Updated');
    assert.equal(fetches, 1, 'Invalidated Redis data must fetch immediately despite the decode memo');
    store.set('fixture', stringify({ ...payload, firstName: 'Remote update' }));
    const remote = await getCachedOrFetch('fixture', 45, fetcher, decodeDashboardPayload);
    assert.equal(parse(await dashboardResponse(remote, false).text()).firstName, 'Remote update');
    assert.equal(fetches, 1, 'Changed Redis values must replace decoded data without a database fetch');
    const notFound = dashboardResponse(decodeDashboardPayload('{"error":"Student not found"}'), true);
    assert.equal(notFound.status, 404);
    assert.deepEqual(parse(await notFound.text()), { error: 'Student not found' });
    const timetable = decodeDashboardPayload<object>('[{"dayOfWeek":1,"subjectName":"Math"}]');
    const beforeTimetable = serializations;
    const firstTimetable = timetableResponse(timetable);
    firstTimetable.headers.set('x-request-id', 'first');
    const secondTimetable = timetableResponse(timetable);
    assert.equal(secondTimetable.headers.get('x-request-id'), null);
    assert.equal(await firstTimetable.text(), await secondTimetable.text());
    assert.equal(serializations, beforeTimetable + 1, 'Warm timetables reuse encoding, never response streams or headers');
  } finally { JSON.parse = parse; JSON.stringify = stringify; }
  const retained = decodeDashboardPayload(json);
  for (let i = 0; i < 4097; i++) decodeDashboardPayload(stringify({ firstName: `Eviction${i}` }));
  assert.notEqual(decodeDashboardPayload(json), retained, 'Bounded decode memo must evict old values');
  const large = stringify({ content: 'x'.repeat(17000) });
  assert.notEqual(decodeDashboardPayload(large), decodeDashboardPayload(large), 'Large bodies must not enter the decode memo');
  const unicode = dashboardResponse({ firstName: 'علی 🎓' }, true);
  const serialized = Reflect.get(unicode, Symbol.for('nisaab360.serialized-json')) as string;
  assert.equal(await unicode.text(), serialized, 'Direct JSON and stream paths must preserve Unicode identically');
  const encode = TextEncoder.prototype.encode;
  let encodes = 0;
  TextEncoder.prototype.encode = function (...args: Parameters<typeof encode>) {
    encodes++; return encode.apply(this, args);
  };
  try {
    const lazy = dashboardResponse(payload, false);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(encodes, 0, 'Unconsumed transport bodies must not schedule UTF-8 encoding');
    assert.equal(await lazy.clone().text(), expected, 'Response.clone must retain the complete body');
    assert.equal(await lazy.text(), expected);
    const timetable = [{ dayOfWeek: 1, subjectName: 'Math' }];
    const first = timetableResponse(timetable), second = timetableResponse(timetable);
    const reader = first.body!.getReader();
    const chunk = await reader.read();
    chunk.value![0] = 0;
    assert.equal(await second.text(), JSON.stringify({ timetable }), 'A reader cannot corrupt another cached body');
    reader.releaseLock();
    assert.equal(first.bodyUsed, true);
  } finally { TextEncoder.prototype.encode = encode; }
  console.log('Dashboard response checks passed: one decode/encode for ten warm requests, ten Redis reads, fresh streams/CORS/headers, invalidation, course hints, 404s and bounded retention. No HTTP, DB writes or tokens.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
