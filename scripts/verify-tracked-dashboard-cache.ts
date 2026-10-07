/** Functional checks on disposable keys only; no HTTP, k6 or token issuance. */
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { Redis } from 'ioredis';
import { TrackedDashboardCache } from '../src/lib/tracked-dashboard-cache';
import { CACHE_ACQUIRE, CACHE_UNLOCK } from '../src/lib/cache-scripts';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, 'Tracking/invalidation did not become ready');
    await pause(10);
  }
}

async function main() {
  // A reserved numeric institution/user pair avoids touching application data.
  // DB 15 keeps these disposable fixtures apart from the application's DB 0.
  const url = 'redis://127.0.0.1:6379/15';
  const options = { enableAutoPipelining: true, maxRetriesPerRequest: 1 };
  const first = new Redis(url, options);
  const second = new Redis(url, options);
  const writer = new Redis(url, options);
  const caches = [new TrackedDashboardCache(first), new TrackedDashboardCache(second)];
  const suffix = `0:${randomInt(1_000_000_000, 2_000_000_000)}`;
  const key = `cache:student:dashboard:${suffix}`;
  const fillKey = `cache:student:dashboard:${suffix}99`;
  const fillLock = `cache:fill-lock:${fillKey}`;
  const staffKey = `cache:staff:dashboard:v2:${suffix}`;
  const timetableKey = `cache:timetable:staff:v2:${suffix}`;
  const otherKey = `codex:verify:tracking:${suffix}`;
  const largeKey = `cache:student:dashboard:0:${randomInt(1_000_000_000, 2_000_000_000)}`;
  const extraKeys = ['cache:dashboard:0:all', 'cache:dashboard:class-dist:0:all',
    'cache:announcements:visible:0:STAFF:0:30', 'cache:student:attendance:0:default', 'cache:student:marks:0:default'];
  const capacityKeys = Array.from({ length: 6000 }, (_, i) => `cache:student:dashboard:${suffix}${i}`);
  let integratedRedis: Redis | undefined;
  try {
    await writer.psetex(key, 20_000, 'one');
    for (const cache of caches) await until(async () => {
      assert.equal(await cache.read(key), 'one');
      return cache.peek(key) === 'one';
    });
    assert.deepEqual(await first.eval(CACHE_ACQUIRE, 2, fillKey, fillLock, 'owner-one', 5000), [null, 1]);
    assert.deepEqual(await second.eval(CACHE_ACQUIRE, 2, fillKey, fillLock, 'owner-two', 5000), [null, 0], 'Only one process owns a cold fill');
    assert.equal(await writer.get(fillLock), 'owner-one');
    assert.equal(caches[0].peek(key), 'one', 'Acquiring a lock must not flush unrelated warm entries');
    assert.equal(caches[1].peek(key), 'one');
    await writer.setex(fillKey, 20, 'filled-by-sibling');
    assert.deepEqual(await first.eval(CACHE_ACQUIRE, 2, fillKey, fillLock, 'owner-two', 5000), ['filled-by-sibling', 0], 'An existing payload wins without acquiring a lock');
    assert.equal(await first.eval(CACHE_UNLOCK, 1, fillLock, 'owner-two'), 0, 'A loser cannot release the owner lock');
    assert.equal(await writer.get(fillLock), 'owner-one');
    await writer.unlink(fillKey, fillLock);
    const stream = first.stream;
    const write = stream.write;
    let writes = 0;
    stream.write = function (this: typeof stream, ...args: Parameters<typeof write>) {
      writes++;
      return write.apply(this, args);
    } as typeof write;
    try {
      for (let i = 0; i < 20; i++) assert.equal(await caches[0].read(key), 'one');
      assert.equal(writes, 0, 'Warm dashboard reads must use zero Valkey socket writes');
    } finally { stream.write = write; }

    await writer.psetex(key, 20_000, 'two');
    await until(() => caches.every(cache => cache.peek(key) === undefined));
    for (const cache of caches) assert.equal(await cache.read(key), 'two');
    await writer.unlink(key);
    await until(() => caches.every(cache => cache.peek(key) === undefined));
    for (const cache of caches) assert.equal(await cache.read(key), null);

    await first.psetex(staffKey, 20_000, 'staff');
    assert.equal(await caches[0].read(staffKey), 'staff');
    await first.psetex(staffKey, 20_000, 'changed here');
    assert.equal(caches[0].peek(staffKey), undefined, 'Own-process writes evict before their promises resolve');
    assert.equal(await caches[0].read(staffKey), 'changed here');

    await writer.psetex(key, 150, 'short');
    await caches[0].read(key);
    await pause(200);
    assert.equal(caches[0].peek(key), undefined);
    assert.equal(await caches[0].read(key), null, 'Local cache cannot extend Redis expiry');

    await writer.set(otherKey, 'auth-like-data', 'EX', 30);
    assert.equal(await caches[0].read(otherKey), 'auth-like-data');
    assert.equal(caches[0].peek(otherKey), undefined, 'Other keys must never enter the dashboard cache');
    await writer.set(otherKey, 'fresh', 'EX', 30);
    assert.equal(await caches[0].read(otherKey), 'fresh');
    await writer.set(largeKey, 'x'.repeat(16_385), 'EX', 30);
    assert.equal((await caches[0].read(largeKey))!.length, 16_385);
    assert.equal(caches[0].peek(largeKey), undefined, 'Large payloads stay out of bounded local storage');

    // Hold a completed read while a second process changes its value. The old
    // reply can satisfy its original reader but must never repopulate L1.
    await writer.psetex(key, 20_000, 'before race');
    await until(() => caches.every(cache => cache.peek(key) === undefined));
    const originalEval = first.eval;
    let captured = false;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    Object.assign(first, { eval: async (...args: unknown[]) => {
      const result = await Reflect.apply(originalEval, first, args);
      captured = true;
      await held;
      return result;
    } });
    try {
      const pending = caches[0].read(key);
      await until(() => captured);
    await writer.psetex(key, 20_000, 'after race');
      // A tracked read of the other key confirms the notification turn ran.
      await caches[1].read(key);
      await pause(30);
      release();
      assert.equal(await pending, 'before race');
      assert.equal(caches[0].peek(key), undefined, 'Invalidation during read prevents stale reinsertion');
    } finally { release(); first.eval = originalEval; }

    // A write to another user must not veto an otherwise valid cache refill.
    await writer.psetex(timetableKey, 20_000, 'timetable');
    await pause(30);
    Object.assign(first, { eval: async (...args: unknown[]) => {
      const result = await Reflect.apply(originalEval, first, args);
      await writer.setex(staffKey, 20, 'unrelated dashboard write');
      await pause(30);
      return result;
    } });
    try {
      assert.equal(await caches[0].read(timetableKey), 'timetable');
      assert.equal(caches[0].peek(timetableKey), 'timetable', 'Unrelated invalidations must not discard completed reads');
    } finally { first.eval = originalEval; }
    await writer.unlink(timetableKey);
    await until(() => caches.every(cache => cache.peek(timetableKey) === undefined));
    assert.equal(await caches[0].read(timetableKey), null, 'Timetable invalidation is tracked too');
    for (const extra of extraKeys) {
      await writer.psetex(extra, 20_000, 'existing read data');
      await pause(20);
      for (const cache of caches) {
        assert.equal(await cache.read(extra), 'existing read data');
        assert.equal(cache.peek(extra), 'existing read data');
      }
      await writer.unlink(extra);
      await until(() => caches.every(cache => cache.peek(extra) === undefined));
    }

    // A larger identity pool must not turn a warm sweep into Redis reads.
    const fixtures = writer.pipeline();
    for (const fixture of capacityKeys) fixtures.setex(fixture, 120, 'capacity fixture');
    const results = await fixtures.exec();
    assert.ok(results?.every(([error]) => !error));
    await pause(100);
    caches[0].clear();
    for (let i = 0; i < capacityKeys.length; i += 100) {
      await Promise.all(capacityKeys.slice(i, i + 100).map(fixture => caches[0].read(fixture)));
    }
    const resident = capacityKeys.filter(fixture => caches[0].peek(fixture) !== undefined).length;
    console.log(`Working-set residency: ${resident}/${capacityKeys.length}`);
    assert.equal(resident, capacityKeys.length, '6,000 small dashboard-related keys must remain resident');
    caches[0].clear();
    // Exercise the independent string budget with maximum-size eligible values.
    const largeFixtures = capacityKeys.slice(0, 2100);
    for (let i = 0; i < largeFixtures.length; i += 100) {
      const batch = writer.pipeline();
      for (const fixture of largeFixtures.slice(i, i + 100)) batch.setex(fixture, 120, 'x'.repeat(16_384));
      assert.ok((await batch.exec())?.every(([error]) => !error));
    }
    await pause(100);
    for (let i = 0; i < largeFixtures.length; i += 100) {
      await Promise.all(largeFixtures.slice(i, i + 100).map(fixture => caches[0].read(fixture)));
    }
    const retainedCharacters = largeFixtures.reduce((total, fixture) => {
      const value = caches[0].peek(fixture);
      return total + (value === undefined ? 0 : fixture.length + value.length);
    }, 0);
    assert.ok(retainedCharacters <= 32 * 1024 * 1024, 'Large values must obey the total string budget');
    assert.ok(retainedCharacters > 31 * 1024 * 1024, 'Budget eviction must retain useful data');
    assert.equal(caches[0].peek(largeFixtures[0]), undefined);
    assert.equal(caches[0].peek(largeFixtures.at(-1)!), 'x'.repeat(16_384));
    caches[0].clear();

    // Disconnect only this test's invalidation client, never application clients.
    const subscriber = (caches[0] as unknown as { subscriber: Redis }).subscriber;
    await caches[0].read(key);
    subscriber.disconnect();
    await until(() => subscriber.status === 'end');
    assert.equal(caches[0].peek(key), undefined, 'Tracking loss immediately disables local reads');
    await writer.psetex(key, 20_000, 'while disconnected');
    assert.equal(await caches[0].read(key), 'while disconnected', 'Tracking loss falls back to normal Redis reads');
    await subscriber.connect();
    await until(async () => { await caches[0].read(key); return caches[0].peek(key) === 'while disconnected'; });
    await writer.del(key);
    await until(() => caches[0].peek(key) === undefined);
    assert.equal(await caches[0].read(key), null, 'Reconnection restores remote invalidation');
    subscriber.emit('messageBuffer', Buffer.from('__redis__:invalidate'), null);
    assert.equal(caches[0].peek(staffKey), undefined, 'Flush notifications clear all local entries');
    process.env.REDIS_URL = url;
    const { redis, getCachedOrFetch } = await import('../src/lib/redis');
    integratedRedis = redis;
    await writer.psetex(key, 20_000, JSON.stringify({ version: 1 }));
    const fetcher = async () => { throw new Error('A warm dashboard must never query the database'); };
    // Allow CLIENT TRACKING setup, then populate through the production helper.
    await pause(100);
    assert.deepEqual(await getCachedOrFetch(key, 45, fetcher), { version: 1 });
    assert.deepEqual(await getCachedOrFetch(key, 45, fetcher), { version: 1 });
    const integratedStream = redis.stream;
    const integratedWrite = integratedStream.write;
    let integratedWrites = 0;
    integratedStream.write = function (this: typeof integratedStream, ...args: Parameters<typeof integratedWrite>) {
      integratedWrites++;
      return integratedWrite.apply(this, args);
    } as typeof integratedWrite;
    try {
      for (let i = 0; i < 20; i++) assert.deepEqual(await getCachedOrFetch(key, 45, fetcher), { version: 1 });
      assert.equal(integratedWrites, 0, 'Production cache helper must bypass network reads on warm dashboards');
    } finally { integratedStream.write = integratedWrite; }
    await writer.multi().del(key).setex(key, 20, JSON.stringify({ version: 2 })).exec();
    await until(async () => (await getCachedOrFetch<{ version: number }>(key, 45, fetcher)).version === 2);
    console.log('Tracked dashboard checks passed: two replicas and production helper, 40 warm reads/zero socket writes, remote update/unlink/pipeline, own writes, original TTL, non-dashboard exclusion, payload limit, read/invalidation race, tracking loss/fallback/reconnect and flush notification. Only disposable DB 15 keys were changed; no k6 or tokens.');
  } finally {
    caches.forEach(cache => cache.stop());
    if (integratedRedis) await integratedRedis.quit();
    await writer.del(key, fillKey, fillLock, staffKey, timetableKey, otherKey, largeKey, ...extraKeys, ...capacityKeys);
    await Promise.all([first.quit(), second.quit(), writer.quit()]);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
