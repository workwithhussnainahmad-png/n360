/** Local functional Redis check. Uses only disposable, expiring verification keys. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

async function main() {
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  const { redis, getCachedOrFetch } = await import('../src/lib/redis');
  const key = `codex:verify:batching:${randomUUID()}`;
  const countKey = `${key}:count`;
  try {
    if (redis.status !== 'ready') await once(redis, 'ready');
    assert.equal(redis.options.enableAutoPipelining, true);
    const stream = redis.stream;
    const originalWrite = stream.write;
    let writes = 0;
    stream.write = function (this: typeof stream, ...args: Parameters<typeof originalWrite>) {
      writes++;
      return originalWrite.apply(this, args);
    } as typeof originalWrite;
    try {
      const results = await Promise.all([
        redis.setex(key, 60, 'first'), redis.get(key), redis.del(key), redis.get(key),
      ]);
      assert.deepEqual(results, ['OK', 'first', 1, null], 'Batched cache operations must keep FIFO ordering');
      assert.equal(writes, 1, 'Four concurrent commands should use one socket write');
    } finally { stream.write = originalWrite; }

    const transaction = await redis.multi().incr(countKey).expire(countKey, 60, 'NX').exec();
    assert.deepEqual(transaction, [[null, 1], [null, 1]], 'Rate-limit transaction semantics changed');
    let fetched = 0;
    const fetcher = async () => { fetched++; return { version: fetched }; };
    assert.deepEqual(await getCachedOrFetch(key, 60, fetcher), { version: 1 });
    assert.deepEqual(await getCachedOrFetch(key, 60, fetcher), { version: 1 });
    await redis.del(key);
    assert.deepEqual(await getCachedOrFetch(key, 60, fetcher), { version: 2 });
    console.log('Redis batching passed: four commands/one write, FIFO, transactions and cache invalidation. No k6, tokens or application keys.');
  } finally {
    await redis.del(key, countKey);
    await redis.quit();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
