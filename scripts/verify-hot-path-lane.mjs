/**
 * Bounded functional checks for the hot-path lane in scripts/standalone-server.cjs.
 *
 * Read-only HTTP against BASE_URL (default the local Caddy at 127.0.0.1:3000)
 * with existing prepared tokens from k6/tokens.json. No k6, no token generation,
 * no writes. Tokens are never printed.
 *
 *   node scripts/verify-hot-path-lane.mjs
 *   BASE_URL=http://127.0.0.1:3000 node scripts/verify-hot-path-lane.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const ROUNDS = Number(process.env.ROUNDS || 4); // least_conn alternates replicas; hit each route several times.
const { tokens } = JSON.parse(readFileSync('k6/tokens.json', 'utf8').replace(/^\uFEFF/, ''));
const tokenFor = (role) => tokens.find((entry) => entry.roleHint === role)?.accessToken;
const SECURITY = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'strict-origin-when-cross-origin', 'permissions-policy': 'camera=(), microphone=(), geolocation=()', 'x-permitted-cross-domain-policies': 'none' };

let checks = 0;
async function call(method, path, { token, origin, accept = 'application/json' } = {}) {
  const headers = { accept };
  if (token) headers.authorization = `Bearer ${token}`;
  if (origin) headers.origin = origin;
  const res = await fetch(base + path, { method, headers, redirect: 'manual' });
  const text = await res.text();
  return { res, text };
}
function expectLaneHeaders(res, path) {
  for (const [name, value] of Object.entries(SECURITY)) assert.equal(res.headers.get(name), value, `${path}: ${name}`);
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET,POST,PUT,PATCH,DELETE,OPTIONS', `${path}: CORS methods`);
  assert.ok(res.headers.get('vary')?.split(',').map((v) => v.trim()).includes('Origin'), `${path}: Vary Origin`);
  assert.equal(res.headers.get('content-type'), 'application/json', `${path}: content-type`);
  checks += 3 + Object.keys(SECURITY).length;
}

async function authenticatedReads(role, paths) {
  const token = tokenFor(role);
  assert.ok(token, `${role} token available in k6/tokens.json`);
  for (const path of paths) {
    let previous;
    for (let round = 0; round < ROUNDS; round++) {
      const origin = round % 2 ? 'https://denied.example.test' : undefined;
      const { res, text } = await call('GET', path, { token, origin });
      assert.equal(res.status, 200, `${path} round ${round}: status ${res.status} ${text.slice(0, 120)}`);
      expectLaneHeaders(res, path);
      // A native client (no Origin) receives `*`; an unlisted Origin receives no grant.
      assert.equal(res.headers.get('access-control-allow-origin'), origin ? null : '*', `${path}: CORS origin handling`);
      const body = JSON.parse(text);
      assert.ok(body && typeof body === 'object' && !('error' in body), `${path}: JSON payload without error`);
      if (previous !== undefined && path.endsWith('/timetable')) assert.equal(text, previous, `${path}: identical cached payload across replicas`);
      previous = text;
      checks += 3;
    }
  }
}

async function main() {
  console.log(`Hot-path lane checks against ${base}`);
  const health = await call('GET', '/api/health');
  assert.equal(health.res.status, 200); checks++;

  await authenticatedReads('STUDENT', ['/api/student/dashboard', '/api/student/timetable', '/api/student/profile']);
  await authenticatedReads('STAFF', ['/api/staff/dashboard', '/api/staff/timetable', '/api/staff/profile']);
  await authenticatedReads('INSTITUTION', ['/api/institution/dashboard', '/api/institution/dashboard/charts', '/api/institution/academics', '/api/institution/timetable']);

  // Student dashboard preserves its per-request headers through the lane.
  const student = tokenFor('STUDENT');
  const dash = await call('GET', '/api/student/dashboard', { token: student });
  assert.match(dash.res.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/, 'x-request-id present');
  assert.ok(['HIT', 'MISS'].includes(dash.res.headers.get('x-cache')), 'x-cache present');
  if (!dash.res.headers.has('content-encoding')) assert.equal(dash.res.headers.get('content-length'), String(Buffer.byteLength(dash.text)), 'content-length matches identity body');
  checks += 3;

  // Query parameters reach the handler (nextUrl.searchParams) and validation still runs.
  const badCampus = await call('GET', '/api/institution/dashboard?campusId=abc', { token: tokenFor('INSTITUTION') });
  assert.equal(badCampus.res.status, 400, 'campusId validation through the lane'); checks++;
  const catalog = await call('GET', '/api/student/profile?include=catalog', { token: student });
  assert.equal(catalog.res.status, 200); assert.ok(Array.isArray(JSON.parse(catalog.text).classes), 'profile catalog query handled'); checks += 2;

  // Authorization is unchanged: no token, garbage token, wrong role, parent without session.
  for (const [path, token, expected] of [
    ['/api/student/dashboard', undefined, 401],
    ['/api/student/dashboard', 'not-a-token', 401],
    ['/api/staff/dashboard', student, 403],
    ['/api/institution/dashboard', student, 403],
    ['/api/parent/portal', undefined, 401],
    ['/api/parent/portal?section=home', student, 401],
  ]) {
    const { res } = await call('GET', path, { token });
    assert.equal(res.status, expected, `${path} without valid ${expected === 403 ? 'role' : 'session'} -> ${expected}`);
    expectLaneHeaders(res, path);
    checks++;
  }

  // Everything that is not a plain GET on a lane path still goes through Next.
  const preflight = await call('OPTIONS', '/api/student/dashboard', { origin: 'https://denied.example.test' });
  assert.equal(preflight.res.status, 204, 'OPTIONS preflight'); checks++;
  const post = await call('POST', '/api/student/dashboard', { token: student });
  assert.equal(post.res.status, 405, 'POST on a GET-only lane route'); checks++;
  const missing = await call('GET', '/api/student/dashboard/extra', { token: student });
  assert.equal(missing.res.status, 404, 'sub-path is not captured by the lane'); checks++;
  const unknown = await call('GET', '/api/does-not-exist');
  assert.equal(unknown.res.status, 404); checks++;
  const page = await call('GET', '/employee-login', { accept: 'text/html' });
  assert.equal(page.res.status, 200); assert.match(page.res.headers.get('content-type') || '', /text\/html/); checks += 2;
  const ready = await call('GET', '/api/ready');
  assert.equal(ready.res.status, 200); checks++;

  console.log(`Hot-path lane checks passed: ${checks} assertions across student/staff/institution reads, CORS/security headers, query handling, authorization, and Next fallbacks. Read-only; no k6 or token generation.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
