/** Isolated API policy/matcher checks; no HTTP, database writes or token issuance. */
import 'next/dist/server/node-environment';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
// This installed build still exports the testing helper under its old name.
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from 'next/experimental/testing/server';

async function main() {
  process.env.NEXT_PHASE = 'phase-production-build';
  process.env.API_ALLOWED_ORIGINS = 'https://allowed.example.test';
  const { config } = await import('../src/proxy');
  const { requireRole } = await import('../src/lib/rbac');
  const { corsPreflight } = await import('../src/lib/cors');
  const { db, pool } = await import('../src/db');
  const { SESSION_HEADER, SESSION_SIG_HEADER } = await import('../src/lib/session-header');
  const originalSelect = db.select;
  Object.assign(db, { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ isActive: true }] }) }) }) });
  const { tokens } = JSON.parse(readFileSync('k6/tokens.json', 'utf8')) as { tokens: Array<{ roleHint: string; accessToken: string }> };
  const staffToken = tokens.find(row => row.roleHint === 'STAFF')!.accessToken;
  try {
    for (const role of ['staff', 'student']) {
      for (const page of ['dashboard', 'timetable', 'profile']) {
        const pathname = `/api/${role}/${page}`;
        for (const suffix of ['', '/', '?catalog=1']) assert.equal(unstable_doesProxyMatch({ config, nextConfig: {}, url: pathname + suffix }), false, pathname + suffix);
        assert.equal(unstable_doesProxyMatch({ config, nextConfig: {}, url: pathname + '/nested' }), true);
        const route = await import(`../src/app/api/${role}/${page}/route`);
        assert.equal(route.OPTIONS, corsPreflight);
        const preflight: NextResponse = route.OPTIONS(new NextRequest('http://localhost' + pathname, { method: 'OPTIONS', headers: { origin: process.env.API_ALLOWED_ORIGINS } }));
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), process.env.API_ALLOWED_ORIGINS);
        assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
      }
    }
    for (const probe of ['health', 'ready']) {
      const pathname = `/api/${probe}`;
      for (const suffix of ['', '/', '?probe=1']) assert.equal(unstable_doesProxyMatch({ config, nextConfig: {}, url: pathname + suffix }), false);
      assert.equal(unstable_doesProxyMatch({ config, nextConfig: {}, url: pathname + '/nested' }), true);
      const route = await import(`../src/app/api/${probe}/route`);
      assert.equal(route.OPTIONS, corsPreflight);
      assert.equal(route.OPTIONS(new NextRequest('http://localhost' + pathname, { method: 'OPTIONS', headers: { origin: process.env.API_ALLOWED_ORIGINS } })).status, 204);
    }
    for (const pathname of ['/api/student/marks', '/api/staff/assignments', '/api/auth/login', '/student/dashboard', '/staff/profile']) assert.equal(unstable_doesProxyMatch({ config, nextConfig: {}, url: pathname }), true, pathname);
    let calls = 0;
    const handler = requireRole(['STAFF'], async request => {
      calls++;
      assert.equal(request.headers.get(SESSION_HEADER), null);
      assert.equal(request.headers.get(SESSION_SIG_HEADER), null);
      return NextResponse.json({ ok: true });
    });
    const request = (headers: Record<string, string>, method = 'GET') => new NextRequest('http://localhost/api/staff/profile', { method, headers });
    const forged = { [SESSION_HEADER]: '{"role":"STAFF"}', [SESSION_SIG_HEADER]: 'forged', origin: 'https://allowed.example.test' };
    const unauthorized = await handler(request(forged), {});
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.headers.get('access-control-allow-origin'), forged.origin);
    const crossRole = requireRole(['STUDENT'], async () => { throw new Error('Must not run'); });
    assert.equal((await crossRole(request({ authorization: `Bearer ${staffToken}`, ...forged }), {})).status, 403);
    const allowed = await handler(request({ authorization: `Bearer ${staffToken}`, ...forged }), {});
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
    const disallowed = await handler(request({ authorization: `Bearer ${staffToken}`, origin: 'https://untrusted.example.test' }), {});
    assert.equal(disallowed.headers.get('access-control-allow-origin'), null);
    assert.equal(disallowed.headers.get('access-control-allow-credentials'), null);
    const native = await handler(request({ authorization: `Bearer ${staffToken}` }), {});
    assert.equal(native.headers.get('access-control-allow-origin'), '*');
    const before = calls;
    const oversized = await handler(request({ authorization: `Bearer ${staffToken}`, 'content-length': '999999999', origin: forged.origin }, 'PATCH'), {});
    assert.equal(oversized.status, 413);
    assert.equal(calls, before);
    for (let i = 0; i < 100; i++) assert.equal((await handler(request({ authorization: `Bearer ${staffToken}` }, 'PATCH'), {})).status, 200);
    const limited = await handler(request({ authorization: `Bearer ${staffToken}`, origin: forged.origin }, 'PATCH'), {});
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('access-control-allow-origin'), forged.origin);
    console.log('API fast-path checks passed: eight exact matcher exclusions, neighboring routes retained, all eight preflights, CORS allowed/denied/native behavior, forged headers, 401/403, body ceiling, and mutation rate limit. No HTTP, database writes, or tokens issued.');
  } finally { db.select = originalSelect; await pool.end(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
