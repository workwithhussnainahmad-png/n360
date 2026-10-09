/** Adapter contract checks; no HTTP, database, tokens or k6. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NextRequest } from 'next/server';
import { dashboardResponse, timetableResponse } from '../src/lib/dashboard-response';

const source = readFileSync('scripts/standalone-server.cjs', 'utf8');
const adapter = source.slice(source.indexOf('async function handleLane('), source.indexOf('async function loadLane('));
assert.ok(adapter.length > 0);
const settings = { env: { HOT_PATH_JSON_BODY: '1' } };
const handle = runInNewContext(`(${adapter})`, {
  NextRequest, Response, Headers, Buffer, process: settings, console,
  NATIVE_WARM_ENABLED: false, LIGHT_REQUEST_ENABLED: false,
  createHotLaneRequest: (req: {url:string}) => new NextRequest("http://localhost" + req.url),
});
async function send(response: Response) {
  const result = { status: 0, headers: {} as Record<string, string | string[]>, body: null as string | Buffer | null };
  await handle({ headers: { host: 'localhost' }, url: '/api/student/dashboard' }, {
    destroyed: false,
    writeHead(status: number, headers: typeof result.headers) { result.status = status; result.headers = headers; },
    end(body: typeof result.body) { result.body = body; },
  }, { handler: async () => response, headers: { 'x-content-type-options': 'nosniff' } });
  return result;
}

async function main() {
  const payload = { firstName: 'علی 🎓', timetable: [] };
  const optimized = dashboardResponse(payload, true);
  optimized.headers.append('set-cookie', 'one=1; HttpOnly');
  optimized.headers.append('set-cookie', 'two=2; HttpOnly');
  optimized.headers.set('x-request-id', 'first');
  optimized.arrayBuffer = async () => { throw new Error('Serialized body must avoid a stream read'); };
  const direct = await send(optimized);
  assert.equal(typeof direct.body, 'string');
  assert.equal(direct.status, 200);
  assert.equal(direct.headers['content-length'], String(Buffer.byteLength(direct.body!)));
  assert.equal(direct.headers['x-request-id'], 'first');
  assert.deepEqual(Array.from(direct.headers['set-cookie']), ['one=1; HttpOnly', 'two=2; HttpOnly']);
  assert.equal(direct.headers['x-content-type-options'], 'nosniff');

  settings.env.HOT_PATH_JSON_BODY = '0';
  const fallback = await send(dashboardResponse(payload, true));
  assert.ok(Buffer.isBuffer(fallback.body));
  assert.equal(fallback.body.toString(), direct.body);
  assert.equal(fallback.headers['content-length'], direct.headers['content-length']);
  settings.env.HOT_PATH_JSON_BODY = '1';
  const table = await send(timetableResponse([{ subjectName: 'ریاضی' }]));
  assert.equal(table.headers['content-length'], String(Buffer.byteLength(table.body!)));
  const missing = await send(dashboardResponse({ error: 'Student not found' }, true));
  assert.equal(missing.status, 404);
  assert.deepEqual(JSON.parse(String(missing.body)), { error: 'Student not found' });
  const bytes = Buffer.from([0, 255, 128, 42]);
  assert.deepEqual((await send(new Response(bytes))).body, bytes, 'Unmarked binary responses retain their bytes');
  const consumed = dashboardResponse(payload, true);
  await consumed.text();
  await assert.rejects(send(consumed), TypeError, 'Consumed streams must not be resurrected by cached metadata');
  const locked = dashboardResponse(payload, true);
  locked.body!.getReader();
  await assert.rejects(send(locked), TypeError, 'Locked streams retain ordinary Response handling');
  console.log('Serialized lane checks passed: direct/fallback equality, UTF-8 length, cookies, headers, 404s, binary fallback and consumed/locked streams.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
