/** Isolated regression checks: no HTTP traffic, database writes, or token issuance. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

async function main() {
  process.env.NEXT_PHASE = 'phase-production-build';
  const { redis, getCachedOrFetch, getRawCachedOrFetch, clearInFlightCacheFetches } = await import('../src/lib/redis');
  const { db, pool } = await import('../src/db');
  const { getInstitutionCourseStreamingHint, invalidateInstitutionCourseStreamingHint, isInstitutionCourseStreamingConfigured } = await import('../src/lib/course-streaming');
  const { verifyUserExists, invalidateUserValidity } = await import('../src/lib/user');
  const { verifyAccessToken } = await import('../src/lib/auth-edge');
  const store = new Map<string, string>();
  let reads = 0, writes = 0, queries = 0, signatures = 0;
  let provider: string | null = null;
  let active = true;
  let waitForWrite: (key: string) => Promise<void> = async () => {};
  const originalSelect = db.select;
  const originalVerify = crypto.subtle.verify.bind(crypto.subtle);
  const originalNow = Date.now;
  Object.assign(redis, {
    status: 'ready',
    get: async (key: string) => { reads++; return store.get(key) ?? null; },
    setex: async (key: string, _ttl: number, value: string) => { writes++; await waitForWrite(key); store.set(key, value); },
    del: async (key: string) => Number(store.delete(key)),
  });
  Object.assign(db, { select: () => {
    queries++;
    const where = () => ({ limit: async () => active ? [{ provider, credentials: provider ? 'v1.fixture' : null,
      isActive: active, academicStatus: 'ACTIVE', graduatedAccessAllowed: false }] : [] });
    return { from: () => ({ where, innerJoin: () => ({ where }) }) };
  } });
  crypto.subtle.verify = async (...args: Parameters<SubtleCrypto['verify']>) => {
    signatures++;
    return originalVerify(...args);
  };
  try {
    for (const raw of [false, true]) {
      const key = raw ? 'raw-race' : 'json-race';
      let started!: () => void, release!: () => void;
      const writeStarted = new Promise<void>(resolve => { started = resolve; });
      const pendingWrite = new Promise<void>(resolve => { release = resolve; });
      waitForWrite = async incoming => { if (incoming === key) { started(); await pendingWrite; } };
      let fetches = 0;
      const request = () => raw
        ? getRawCachedOrFetch(key, 45, async () => { fetches++; return 'value'; })
        : getCachedOrFetch(key, 45, async () => { fetches++; return { value: 'value' }; });
      const before = { reads, writes };
      const first = request();
      await writeStarted;
      const second = request();
      release();
      const results = await Promise.all([first, second]);
      assert.deepEqual(results[0], results[1]);
      assert.equal(fetches, 1, 'A pending cache write must not allow a second database fetch');
      assert.equal(reads - before.reads, 1);
      assert.equal(writes - before.writes, 1);
      const hits = reads;
      await Promise.all(Array.from({ length: 20 }, request));
      assert.equal(reads - hits, 1, 'Concurrent cache hits should share one Redis read');
      assert.equal(fetches, 1);
    }
    waitForWrite = async () => {};
    await assert.rejects(getCachedOrFetch('retry', 45, async () => { throw new Error('fetch failed'); }), /fetch failed/);
    assert.equal(await getCachedOrFetch('retry', 45, async () => false), false);
    assert.equal(await getCachedOrFetch('retry', 45, async () => true), false, 'False is a cached value');
    const beforeHint = queries;
    const hints = await Promise.all(Array.from({ length: 20 }, () => getInstitutionCourseStreamingHint(2)));
    assert.ok(hints.every(value => value === false));
    assert.equal(queries - beforeHint, 1, 'One institution configuration lookup, shared across users');
    provider = 'MUX';
    assert.equal(await getInstitutionCourseStreamingHint(3), true);
    assert.equal(await getInstitutionCourseStreamingHint(2), false, 'Hints must remain tenant-scoped');
    assert.equal(await isInstitutionCourseStreamingConfigured(2), true, 'Course access still checks fresh database state');
    await invalidateInstitutionCourseStreamingHint(2);
    assert.equal(await getInstitutionCourseStreamingHint(2), true);
    provider = null;
    await invalidateInstitutionCourseStreamingHint(2);
    assert.equal(await getInstitutionCourseStreamingHint(2), false);

    const { tokens } = JSON.parse(readFileSync('k6/tokens.json', 'utf8')) as { tokens: Array<{ roleHint: 'STAFF' | 'STUDENT' | 'INSTITUTION'; userId: number; institutionId: number; accessToken: string }> };
    const accounts = tokens.filter(row => row.roleHint === 'STAFF' || row.roleHint === 'STUDENT');
    assert.equal(accounts.length, 2500, 'Generate the expanded fixture tokens before this regression check');
    for (const account of accounts) {
      assert.equal((await verifyAccessToken(account.accessToken))?.userId, account.userId);
      assert.equal(await verifyUserExists(account.roleHint, account.userId), true);
    }
    const warm = { signatures, reads };
    for (const account of accounts) {
      await verifyAccessToken(account.accessToken);
      await verifyUserExists(account.roleHint, account.userId);
    }
    assert.equal(signatures, warm.signatures, 'The 2,500-token pool must not evict recently verified tokens');
    assert.equal(reads, warm.reads, 'The 2,500-account pool must not evict recent validity checks');
    const account = accounts[0];
    Date.now = () => originalNow() + 31_000;
    for (const row of accounts) {
      assert.equal((await verifyAccessToken(row.accessToken))?.userId, row.userId);
    }
    await verifyUserExists(account.roleHint, account.userId);
    assert.equal(signatures, warm.signatures, 'An unchanged verified JWT must not repeat signature work every 30 seconds');
    assert.equal(reads, warm.reads + 1, 'Validity still uses the original 30-second local TTL');
    Date.now = originalNow;
    active = false;
    await invalidateUserValidity(account.roleHint, account.userId);
    assert.equal(await verifyUserExists(account.roleHint, account.userId), false, 'Account revocation must still reject access');
    const { getSessionFromRequest } = await import('../src/lib/auth');
    assert.equal(await getSessionFromRequest(new NextRequest('http://localhost/api/staff/dashboard', {
      headers: { authorization: `Bearer ${account.accessToken}` },
    })), null, 'A memoized signature must not bypass deactivation in the real session guard');
    assert.equal(await verifyAccessToken('forged-token'), null);
    const parts = account.accessToken.split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { exp: number };
    const alteredPayload = Buffer.from(JSON.stringify({ ...claims, userId: -1 })).toString('base64url');
    assert.equal(await verifyAccessToken(`${parts[0]}.${alteredPayload}.${parts[2]}`), null, 'A changed token must never reuse a verified signature');
    Date.now = () => claims.exp * 1000 - 1;
    assert.equal((await verifyAccessToken(account.accessToken))?.userId, account.userId, 'JWT remains valid immediately before expiry');
    Date.now = () => claims.exp * 1000;
    assert.equal(await verifyAccessToken(account.accessToken), null, 'Cached JWT must be rejected at the exact expiry boundary');
    Date.now = originalNow;
    active = true;

    const staffAccount = accounts.find(row => row.roleHint === 'STAFF')!;
    const studentAccount = accounts.find(row => row.roleHint === 'STUDENT')!;
    for (const row of [staffAccount, studentAccount]) {
      await invalidateUserValidity(row.roleHint, row.userId);
      await verifyUserExists(row.roleHint, row.userId);
      const key = row.roleHint === 'STAFF' ? `cache:staff:dashboard:v2:${row.institutionId}:${row.userId}`
        : `cache:student:dashboard:${row.userId}:${row.institutionId}`;
      store.set(key, JSON.stringify({ firstName: 'Fixture', timetable: [], assignments: [], announcements: [] }));
    }
    const { GET: staffDashboard } = await import('../src/app/api/staff/dashboard/route');
    const { GET: studentDashboard } = await import('../src/app/api/student/dashboard/route');
    const beforeDashboards = queries;
    for (const row of [staffAccount, studentAccount]) {
      const handler = row.roleHint === 'STAFF' ? staffDashboard : studentDashboard;
      const response = await handler(new NextRequest(`http://localhost/api/${row.roleHint.toLowerCase()}/dashboard`, {
        headers: { authorization: `Bearer ${row.accessToken}` },
      }), {});
      assert.equal(response.status, 200);
      assert.equal((await response.json()).coursesEnabled, false);
    }
    assert.equal(queries, beforeDashboards, 'Warm staff/student dashboards must not issue database queries');
    // Cold SQL and route behavior are exercised against PGlite in verify-dashboard-data.ts.
    console.log('Dashboard regression checks passed: shared cache operations, tenant hints/invalidation, fresh course gates, 2,000-account memo reuse, TTL/revocation, and zero-query warm dashboards. No HTTP, database writes, or tokens issued.');
  } finally {
    Date.now = originalNow;
    crypto.subtle.verify = originalVerify;
    db.select = originalSelect;
    clearInFlightCacheFetches();
    await pool.end();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
