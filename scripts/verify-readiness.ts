/** Readiness behavior without database/cache connections or application writes. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { NextRequest } from 'next/server';

async function main() {
  process.env.NEXT_PHASE = 'phase-production-build';
  const { pool, readinessPool } = await import('../src/db');
  const { redis } = await import('../src/lib/redis');
  const { GET: readiness } = await import('../src/app/api/ready/route');
  const GET = () => readiness(new NextRequest('http://localhost/api/ready'), {});
  const originalQuery = readinessPool.query;
  const originalRequestQuery = pool.query;
  const originalPing = redis.ping;
  let probes = 0;
  Object.assign(pool, { query: () => { throw new Error('Request pool is saturated and must never receive a readiness query'); } });
  Object.assign(readinessPool, { query: async () => { probes++; return { rows: [{ '?column?': 1 }] }; } });
  Object.assign(redis, { status: 'ready', ping: async () => 'PONG' });
  try {
    assert.equal(readinessPool.options.max, 1);
    assert.equal(readinessPool.options.connectionTimeoutMillis, 2000);
    const ready = await GET();
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: 'ready', database: 'ready', cache: 'ready' });
    assert.equal(probes, 1, 'Readiness uses its independent bounded pool');
    Object.assign(redis, { ping: async () => { throw new Error('Cache unavailable'); } });
    assert.deepEqual(await (await GET()).json(), { status: 'degraded', database: 'ready', cache: 'degraded' });
    Object.assign(redis, { ping: () => new Promise<string>(() => {}) });
    const started = performance.now();
    const slowCache = await GET();
    assert.equal(slowCache.status, 200);
    assert.equal((await slowCache.json()).cache, 'degraded');
    assert.ok(performance.now() - started < 1500, 'An unresponsive cache must not hang readiness');
    Object.assign(readinessPool, { query: async () => { throw new Error('Database unavailable'); } });
    const unavailable = await GET();
    assert.equal(unavailable.status, 503, 'A genuinely unavailable database still fails readiness');
    assert.equal((await unavailable.json()).database, 'unavailable');
    assert.equal(unavailable.headers.get('cache-control'), 'no-store');
    console.log('Readiness checks passed: independent single-client probe pool, blocked request pool, cache degradation/timeout, real database failure and uncached responses. No HTTP, k6, tokens or external database/cache operations.');
  } finally {
    readinessPool.query = originalQuery;
    pool.query = originalRequestQuery;
    redis.ping = originalPing;
    await Promise.all([pool.end(), readinessPool.end()]);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
