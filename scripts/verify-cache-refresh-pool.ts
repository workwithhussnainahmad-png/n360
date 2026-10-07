/** Driver-level routing fixture: no database sockets, HTTP, k6 or tokens. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { cacheRefreshContext } from '../src/lib/cache-refresh-context';

async function main() {
  process.env.DB_POOL_MAX = '15'; // Match the Compose request-pool setting.
  const { pool, cacheRefreshPool, readinessPool } = await import('../src/db');
  const connections = [pool, cacheRefreshPool].map(target => target.connect);
  const calls: string[] = [];
  class Client extends EventEmitter {
    constructor(private readonly label: string) { super(); }
    query(...args: unknown[]) {
      calls.push(this.label);
      const callback = args.at(-1) as (error: null, result: { rows: string[] }) => void;
      queueMicrotask(() => callback(null, { rows: [this.label] }));
    }
    release() {}
  }
  try {
    for (const [target, label] of [[pool, 'foreground'], [cacheRefreshPool, 'refresh']] as const) {
      Object.assign(target, { connect: (callback: (error: null, client: Client) => void) => queueMicrotask(() => callback(null, new Client(label))) });
    }
    assert.equal(pool.options.max, 15);
    assert.equal(cacheRefreshPool.options.max, 4);
    assert.equal(cacheRefreshPool.options.connectionTimeoutMillis, 5000);
    assert.equal(cacheRefreshPool.options.query_timeout, 5000);
    const [background, foreground] = await Promise.all([
      cacheRefreshContext.run(true, async () => {
        await pause(10);
        return pool.query({ text: 'fixture', values: [1], rowMode: 'array' });
      }),
      pool.query('fixture', [2]),
    ]);
    assert.deepEqual(background.rows, ['refresh']);
    assert.deepEqual(foreground.rows, ['foreground']);
    await cacheRefreshContext.run(true, () => new Promise<void>((resolve, reject) => {
      pool.query('fixture', (error, result) => {
        if (error) { reject(error); return; }
        assert.deepEqual(result.rows, ['refresh']); resolve();
      });
    }));
    assert.deepEqual((await pool.query('fixture')).rows, ['foreground'], 'Background context cannot leak into the next caller');
    assert.deepEqual(calls.sort(), ['foreground', 'foreground', 'refresh', 'refresh']);
    console.log('Refresh pool fixture passed: independent bounded pool, nested async routing, Promise/config/callback signatures and foreground context isolation. No database, HTTP or k6 traffic.');
  } finally {
    pool.connect = connections[0]; cacheRefreshPool.connect = connections[1];
    await Promise.all([pool.end(), cacheRefreshPool.end(), readinessPool.end()]);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
