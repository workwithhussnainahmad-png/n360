/** Complete route-handler checks, no HTTP/load test or application data writes. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Redis } from 'ioredis';
import { NextRequest } from 'next/server';
import { createRequire } from 'node:module';

async function main() {
  process.env.REDIS_URL = 'redis://127.0.0.1:6379/15';
  process.env.API_ALLOWED_ORIGINS = 'https://allowed.example.test';
  const { tokens } = JSON.parse(readFileSync('k6/tokens.json', 'utf8')) as {
    tokens: Array<{ roleHint: string; userId: number; institutionId: number; accessToken: string }>;
  };
  const accounts = ['STAFF', 'STUDENT'].map(role => tokens.find(row => row.roleHint === role)!);
  assert.ok(accounts.every(Boolean));
  const { redis } = await import('../src/lib/redis');
  const { pool, readinessPool } = await import('../src/db');
  const { invalidateUserValidity } = await import('../src/lib/user');
  const { getInstitutionCourseStreamingHint, invalidateInstitutionCourseStreamingHint } = await import('../src/lib/course-streaming');
  const { GET: staff } = await import('../src/app/api/staff/dashboard/route');
  const { GET: student } = await import('../src/app/api/student/dashboard/route');
  const { createNativeWarmRequest } = createRequire(`${process.cwd()}/package.json`)('./scripts/hot-lane-request.cjs');
  const writer = new Redis(process.env.REDIS_URL);
  const keys = new Set<string>();
  const query = pool.query;
  let queries = 0;
  Object.assign(pool, { query: () => { queries++; throw new Error('Warm route attempted SQL'); } });
  async function seed(key: string, value: string) {
    if (!keys.has(key)) assert.equal(await writer.exists(key), 0, 'Do not overwrite an existing DB15 key');
    keys.add(key);
    await writer.setex(key, 45, value);
  }
  async function request(account: typeof accounts[number], allowed = true) {
    const id = crypto.randomUUID();
    const response = await (account.roleHint === 'STAFF' ? staff : student)(
      new NextRequest(`http://localhost/api/${account.roleHint.toLowerCase()}/dashboard`, {
        headers: { authorization: `Bearer ${account.accessToken}`, 'x-request-id': id,
          origin: allowed ? 'https://allowed.example.test' : 'https://denied.example.test' },
      }), {});
    if (response.status === 200) {
      assert.equal(response.headers.get('access-control-allow-origin'), allowed ? 'https://allowed.example.test' : null);
      if (account.roleHint === 'STUDENT') assert.equal(response.headers.get('x-request-id'), id);
    }
    return response;
  }
  try {
    for (const account of accounts) {
      await seed(`auth:user-validity:${account.roleHint}:${account.userId}`, '1');
      const key = account.roleHint === 'STAFF'
        ? `cache:staff:dashboard:v2:${account.institutionId}:${account.userId}`
        : `cache:student:dashboard:${account.userId}:${account.institutionId}`;
      await seed(key, JSON.stringify({ firstName: 'Fixture', timetable: [], assignments: [], announcements: [] }));
      await seed(`cache:courses:enabled:${account.institutionId}`, 'false');
    }
    // Initialize native tracking and both authenticated routes before counting.
    await new Promise(resolve => setTimeout(resolve, 100));
    for (const account of accounts) for (let i = 0; i < 2; i++) {
      const response = await request(account);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).coursesEnabled, false);
    }
    const stream = redis.stream;
    const write = stream.write;
    let writes = 0;
    stream.write = function (this: typeof stream, ...args: Parameters<typeof write>) {
      writes++;
      return write.apply(this, args);
    } as typeof write;
    try {
      for (let i = 0; i < 12; i++) for (const account of accounts) {
        const response = await request(account, i % 2 === 0);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).coursesEnabled, false);
      }
      assert.equal(writes, 0, 'The COMPLETE warm dashboard path must issue zero Valkey writes, including navigation hints');
      assert.equal(queries, 0, 'The complete warm path must issue zero SQL queries');
      for (const account of accounts) {
        const route = account.roleHint === 'STAFF' ? staff : student;
        const native = (route as any)[Symbol.for('nisaab360.native-warm-get')];
        assert.equal(typeof native, 'function');
        for (const origin of ['https://allowed.example.test','https://denied.example.test']) {
          const req = createNativeWarmRequest({url:`/api/${account.roleHint.toLowerCase()}/dashboard`,
            headers: { host:'localhost',authorization: `Bearer ${account.accessToken}`, origin, 'x-user-session':'forged', 'x-request-id':'native-contract' },
          });
          const response = native(req);
          assert.ok(response);
          assert.equal(response.status,200);
          assert.equal(JSON.parse(response.body).coursesEnabled,false);
          assert.equal(req.headers.get('x-user-session'),null);
          assert.equal(response.headers.values['vary'],'Origin');
          assert.equal(response.headers.values['access-control-allow-origin'],origin.includes('allowed') ? origin : undefined);
          if (account.roleHint==='STUDENT') assert.equal(response.headers.values['x-request-id'],'native-contract');
        }
        for (const authorization of ['', 'Bearer forged', `Basic ${account.accessToken}`]) {
          assert.equal(native(new NextRequest('http://localhost/api/staff/dashboard',{headers:{authorization}})),null);
        }
        assert.equal(native(new NextRequest('http://localhost/api/staff/dashboard',{headers:{authorization:`Bearer ${account.accessToken}`,'content-length':'999999999'}})),null);
        const other = account.roleHint === 'STAFF' ? student : staff;
        assert.equal((other as any)[Symbol.for('nisaab360.native-warm-get')](new NextRequest('http://localhost/api/staff/dashboard',{headers:{authorization:`Bearer ${account.accessToken}`}})),null);
      }
      assert.equal(writes,0);
      assert.equal(queries,0);
    } finally { stream.write = write; }

    const { peekVerifiedAccessToken } = await import('../src/lib/auth-edge');
    const realNow = Date.now;
    const expiry = JSON.parse(Buffer.from(accounts[0].accessToken.split('.')[1], 'base64url').toString()).exp;
    try {
      Date.now = () => expiry * 1000 + 1;
      assert.equal(peekVerifiedAccessToken(accounts[0].accessToken), null, 'Memo must reject JWT expiry');
    } finally { Date.now = realNow; }
    assert.equal((await request(accounts[0])).status,200,'Normal path verifies again after memo miss');
    for (const account of accounts) {
      const route = account.roleHint === 'STAFF' ? staff : student;
      const native = (route as any)[Symbol.for('nisaab360.native-warm-get')];
      const req = createNativeWarmRequest({url:`/api/${account.roleHint.toLowerCase()}/dashboard`,headers:{host:'localhost',authorization:`Bearer ${account.accessToken}`}});
      const key = account.roleHint === 'STAFF' ? `cache:staff:dashboard:v2:${account.institutionId}:${account.userId}` : `cache:student:dashboard:${account.userId}:${account.institutionId}`;
      await redis.del(key);
      assert.equal(native(req),null,'Explicit data invalidation must disable native cache hit');
      await seed(key,JSON.stringify({error:'Fixture not found'}));
      assert.equal((await request(account)).status,404);
      assert.equal(native(req),null,'Cached 404 must fall back rather than become 200 or transport 500');
      await redis.del(key);
      await seed(key,JSON.stringify({firstName:'Fixture',timetable:[],assignments:[],announcements:[]}));
      assert.equal((await request(account)).status,200);
    }

    const institutionId = accounts[0].institutionId;
    await writer.setex(`cache:courses:enabled:${institutionId}`, 45, 'true');
    const deadline = Date.now() + 2000;
    while (!await getInstitutionCourseStreamingHint(institutionId)) {
      assert.ok(Date.now() < deadline, 'Remote course-hint update did not invalidate L1');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal((await (await request(accounts[0])).json()).coursesEnabled, true);
    await invalidateInstitutionCourseStreamingHint(institutionId);
    await writer.setex(`cache:courses:enabled:${institutionId}`, 45, 'false');
    assert.equal(await getInstitutionCourseStreamingHint(institutionId), false);

    const account = accounts[0];
    await invalidateUserValidity(account.roleHint as 'STAFF', account.userId);
    assert.equal((staff as any)[Symbol.for('nisaab360.native-warm-get')](new NextRequest('http://localhost/api/staff/dashboard',{headers:{authorization:`Bearer ${account.accessToken}`}})),null,'Invalidation must immediately disable native authorization');
    await writer.setex(`auth:user-validity:${account.roleHint}:${account.userId}`, 45, '0');
    assert.equal((await request(account)).status, 401, 'Cached dashboard and hint must not bypass deactivation');
    assert.equal(queries, 0);
    console.log('Complete warm dashboard checks passed: 24 authenticated route calls, ZERO Valkey socket writes and ZERO SQL queries; fresh CORS/request IDs, cross-process hint update, explicit invalidation and account deactivation. Disposable DB15 fixtures only; no HTTP/k6 or tokens generated.');
  } finally {
    pool.query = query;
    if (keys.size) await writer.del(...keys);
    await Promise.all([redis.quit(), writer.quit(), pool.end(), readinessPool.end()]);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
