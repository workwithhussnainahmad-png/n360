/** Bounded Redis fixtures across processes; no LMS requests or generated tokens. */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { Redis } from 'ioredis';
import { CACHE_REFRESH, CACHE_STORE, CACHE_UNLOCK } from '../src/lib/cache-scripts';
import { cacheRefreshContext } from '../src/lib/cache-refresh-context';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!await check()) { assert.ok(Date.now() < deadline, 'Fixture timed out'); await pause(10); }
}
async function worker() {
  const { redis, getCachedOrFetch } = await import('../src/lib/redis');
  await redis.ping(); await pause(100);
  process.send?.('ready');
  await new Promise(resolve => process.once('message', resolve));
  const [key, counter] = process.argv.slice(3);
  const value = await getCachedOrFetch(key, 45, async () => {
    await redis.incr(counter); await pause(200); return { version: 1 };
  });
  await redis.quit();
  process.send?.({ value });
}
async function main() {
  const url = 'redis://127.0.0.1:6379/15';
  const writer = new Redis(url, { maxRetriesPerRequest: 1 });
  const key = `cache:student:dashboard:0:${randomInt(1_000_000_000, 2_000_000_000)}`;
  const lock = `cache:fill-lock:${key}`, counter = `codex:coordination:${key}`;
  const children: ReturnType<typeof fork>[] = [];
  const boundedKeys = Array.from({ length: 8 }, (_, i) => key.replace(':0:', `:${i + 1}:`));
  const foregroundKey = `codex:foreground:${key}`;
  let production: Redis | undefined;
  try {
    const completed = [0, 1].map(() => new Promise<unknown>((resolve, reject) => {
      const child = fork(process.argv[1], ['worker', key, counter], {
        execArgv: ['--import', 'tsx'], env: { ...process.env, REDIS_URL: url }, silent: true,
      });
      children.push(child);
      let ready = false;
      child.on('message', message => {
        if (message === 'ready') { ready = true; child.emit('fixture-ready'); }
        else resolve(message);
      });
      child.on('error', reject);
      child.on('exit', code => { if (code !== 0) reject(new Error(`Fixture child exited ${code}`)); });
      child.stderr?.on('data', data => process.stderr.write(data));
      Object.assign(child, { isFixtureReady: () => ready });
    }));
    await until(async () => children.every(child => (child as unknown as { isFixtureReady(): boolean }).isFixtureReady()));
    children.forEach(child => child.send('start'));
    assert.deepEqual(await Promise.all(completed), [{ value: { version: 1 } }, { value: { version: 1 } }]);
    assert.equal(await writer.get(counter), '1', 'Two app processes share one cold fetch');
    assert.equal(await writer.get(lock), null, 'Successful fill releases its lock');
    // A late/expired owner cannot replace another owner or an external write.
    await writer.set(lock, 'new-owner', 'PX', 1000);
    assert.equal(await writer.eval(CACHE_STORE, 2, key, lock, 'old-owner', 45, '{"version":99}'), 0);
    assert.equal(await writer.eval(CACHE_UNLOCK, 1, lock, 'old-owner'), 0);
    assert.equal(await writer.eval(CACHE_STORE, 2, key, lock, 'new-owner', 45, '{"version":99}'), 0, 'Cold fill cannot overwrite an existing value');
    await writer.unlink(lock, key);
    process.env.REDIS_URL = url;
    const { redis, getCachedOrFetch } = await import('../src/lib/redis');
    production = redis;
    await redis.ping(); await pause(100);
    await assert.rejects(getCachedOrFetch(key, 45, async () => { throw new Error('fixture SQL failed'); }), /fixture SQL failed/);
    assert.equal(await writer.get(lock), null, 'A failed fetch releases its lock');
    assert.deepEqual(await getCachedOrFetch(key, 45, async () => ({ version: 1 })), { version: 1 });
    await writer.psetex(key, 2000, '{"version":1}'); await pause(30);
    let release!: () => void, calls = 0;
    const held = new Promise<void>(resolve => { release = resolve; });
    const refresh = async () => { calls++; await held; return { version: 2 }; };
    assert.deepEqual(await getCachedOrFetch(key, 45, refresh), { version: 1 });
    assert.deepEqual(await getCachedOrFetch(key, 45, refresh), { version: 1 }, 'Refresh must return valid cached data without waiting');
    await until(async () => calls === 1);
    for (let i = 0; i < 8; i++) assert.deepEqual(await getCachedOrFetch(key, 45, refresh), { version: 1 });
    assert.equal(calls, 1, 'Background work remains coalesced');
    // An invalidation while refreshing must not resurrect the old payload.
    await writer.unlink(key); release();
    await until(async () => await writer.get(lock) === null);
    assert.equal(await writer.get(key), null, 'Deleted data cannot be recreated by an old refresh');
    await writer.setex(key, 20, '{"version":3}');
    await writer.set(lock, 'owner', 'PX', 1000);
    assert.equal(await writer.eval(CACHE_REFRESH, 2, key, lock, 'owner', 45, '{"version":2}', '{"version":1}'), 0, 'Refresh cannot overwrite a newer value');
    assert.equal(await writer.get(key), '{"version":3}');
    await writer.unlink(lock);
    await writer.psetex(key, 2000, '{"version":3}'); await pause(30);
    assert.deepEqual(await getCachedOrFetch(key, 45, async () => ({ version: 4 })), { version: 3 });
    assert.deepEqual(await getCachedOrFetch(key, 45, async () => ({ version: 4 })), { version: 3 });
    await until(async () => await writer.get(key) === '{"version":4}');
    assert.deepEqual(await getCachedOrFetch(key, 45, async () => { throw new Error('Warm refresh re-fetched'); }), { version: 4 }, 'Successful refresh replaces the local value too');
    await writer.psetex(key, 300, '{"version":4}'); await pause(30);
    let failed = false;
    const failingRefresh = async () => { failed = true; throw new Error('Fixture refresh failure'); };
    assert.deepEqual(await getCachedOrFetch(key, 45, failingRefresh), { version: 4 });
    assert.deepEqual(await getCachedOrFetch(key, 45, failingRefresh), { version: 4 });
    await until(async () => failed && await writer.get(lock) === null);
    assert.equal(await writer.get(key), '{"version":4}', 'Failure does not overwrite still-valid data');
    await pause(350);
    assert.deepEqual(await getCachedOrFetch(key, 45, async () => ({ version: 5 })), { version: 5 }, 'Failed refresh cannot extend the old expiry');
    // Eight simultaneous candidates must reserve only four refresh slots,
    // including when all calls arrive before any fetcher microtask runs.
    await until(async () => await writer.get(lock) === null);
    for (const boundedKey of boundedKeys) await writer.psetex(boundedKey, 8_000, '{"version":1}');
    await pause(30);
    for (const boundedKey of boundedKeys) await getCachedOrFetch(boundedKey, 45, async () => { throw new Error('Expected seeded cache'); });
    let finish!: () => void, concurrent = 0;
    const barrier = new Promise<void>(resolve => { finish = resolve; });
    const boundedRefresh = async () => {
      assert.equal(cacheRefreshContext.getStore(), true, 'Nested refresh queries use the background context');
      concurrent++; await barrier; return { version: 2 };
    };
    const warm = await Promise.all(boundedKeys.map(boundedKey => getCachedOrFetch(boundedKey, 45, boundedRefresh)));
    assert.ok(warm.every(value => value.version === 1), 'Reads return valid data while refresh is occupied');
    await until(async () => concurrent === 4);
    assert.equal(concurrent, 4, 'A same-tick burst cannot exceed four refreshes');
    assert.deepEqual(await getCachedOrFetch(foregroundKey, 45, async () => {
      assert.equal(cacheRefreshContext.getStore(), undefined, 'Foreground misses never inherit background routing');
      return { fresh: true };
    }), { fresh: true }, 'Foreground work is not blocked by four held refreshes');
    finish();
    await until(async () => (await Promise.all(boundedKeys.slice(0, 4).map(boundedKey => writer.get(`cache:fill-lock:${boundedKey}`)))).every(value => value === null));
    console.log('Cache coordination passed: distributed fills, ownership/expiry/invalidation races, same-tick four-refresh limit, background context and foreground progress. Only disposable DB 15 keys; no HTTP, k6 or tokens.');
  } finally {
    children.forEach(child => child.kill());
    if (production) await production.quit();
    await writer.del(key, lock, counter, foregroundKey, ...boundedKeys, ...boundedKeys.map(boundedKey => `cache:fill-lock:${boundedKey}`)); await writer.quit();
  }
}
void (process.argv[2] === 'worker' ? worker() : main()).catch(error => { console.error(error); process.exitCode = 1; });
