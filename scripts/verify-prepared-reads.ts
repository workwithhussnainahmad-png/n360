/** Driver contract fixtures: no database, services, tokens or HTTP. */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPreparedReadRegistry } from '../src/db/prepared-queries';
import { cacheRefreshContext } from '../src/lib/cache-refresh-context';

async function main() {
  const prepare = createPreparedReadRegistry(true);
  const disabled = createPreparedReadRegistry(false);
  const types = { getTypeParser: () => (value: string) => value };
  const config = Object.freeze({ text: 'select $1::int as value', rowMode: 'array', types });
  const values = [101];
  const callback = () => {};
  const args = [config, values, callback];
  assert.equal(disabled(args), args);
  const named = prepare(args);
  assert.match((named[0] as { name: string }).name, /^lms_read_[a-f0-9]{48}$/);
  assert.equal(named[1], values); assert.equal(named[2], callback);
  assert.equal((named[0] as typeof config).types, types);
  assert.equal((named[0] as typeof config).rowMode, 'array');
  assert.equal('name' in config, false);
  assert.equal((prepare(['select $1::int as value', [202]])[0] as { name: string }).name, (named[0] as { name: string }).name);
  const callbackConfig = { text: 'select $1::int as value', values: [303], callback };
  assert.equal((prepare([callbackConfig])[0] as typeof callbackConfig).callback, callback);
  for (const input of [
    ['select 1'], ['select $1', []], [{ text: 'select $1', name: 'explicit', values: [1] }],
    [{ text: 'select $1', submit() {}, values: [1] }], ['update students set name=$1', ['value']],
    ['select $1; select 2', [1]], ['with data as (select $1) select * from data', [1]],
    [`select $1 /*${'x'.repeat(32768)}*/`, [1]],
  ]) assert.equal(prepare(input), input, 'Unsupported/explicit queries retain their exact contract');
  const bounded = createPreparedReadRegistry(true);
  for (let i = 0; i < 128; i++) assert.ok((bounded([`select $1::int as value_${i}`, [i]])[0] as { name: string }).name);
  const overflow = ['select $1::int as overflow', [1]];
  assert.equal(bounded(overflow), overflow, 'New shapes fall back after the fixed admission bound');
  assert.ok((bounded(['select $1::int as value_0', [999]])[0] as { name: string }).name, 'Previously admitted shapes remain reusable');

  process.env.DB_PREPARED_STATEMENTS = '1';
  const { pool, cacheRefreshPool, readinessPool } = await import('../src/db');
  const originals = [pool.connect, cacheRefreshPool.connect];
  const seen: Array<{ pool: string; name: string; values: unknown[]; rowMode: string }> = [];
  class Client extends EventEmitter {
    constructor(private readonly label: string) { super(); }
    query(query: { name: string; rowMode: string; values?: unknown[] }, supplied: unknown[] | ((error: Error | null, result?: unknown) => void), done?: (error: Error | null, result?: unknown) => void) {
      const bound = Array.isArray(supplied) ? supplied : query.values!;
      const complete = typeof supplied === 'function' ? supplied : done!;
      seen.push({ pool: this.label, name: query.name, values: bound, rowMode: query.rowMode });
      queueMicrotask(() => bound[0] === -1 ? complete(new Error('query failure')) : complete(null, { rows: [bound[0]] }));
    }
    release() {}
  }
  try {
    for (const [target, label] of [[pool, 'foreground'], [cacheRefreshPool, 'refresh']] as const) {
      Object.assign(target, { connect: (cb: (error: null, client: Client) => void) => queueMicrotask(() => cb(null, new Client(label))) });
    }
    assert.deepEqual((await pool.query(config, [11])).rows, [11]);
    assert.deepEqual((await cacheRefreshContext.run(true, () => pool.query(config, [22]))).rows, [22]);
    await new Promise<void>((resolve, reject) => pool.query({ ...config, values: [33] }, (error: Error, result: { rows: unknown[] }) => {
      if (error) return reject(error); assert.deepEqual(result.rows, [33]); resolve();
    }));
    await assert.rejects(pool.query(config, [-1]), /query failure/);
    assert.deepEqual(seen.map(row => row.pool), ['foreground', 'refresh', 'foreground', 'foreground']);
    assert.equal(new Set(seen.map(row => row.name)).size, 1);
    assert.ok(seen.every(row => row.rowMode === 'array'));
    console.log('Prepared read contracts passed: bounded SQL-only registry, parameter freshness, parser/rowMode/callback/error preservation, foreground/refresh routing and disabled fallback.');
  } finally {
    pool.connect = originals[0]; cacheRefreshPool.connect = originals[1];
    await Promise.all([pool.end(), cacheRefreshPool.end(), readinessPool.end()]);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
