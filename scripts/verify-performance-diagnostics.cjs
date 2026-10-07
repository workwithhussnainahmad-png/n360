/** Isolated diagnostic regression: two local requests, mocked DB/cache, no k6/tokens. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const pg = require('pg');
const Redis = require('ioredis');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-diagnostics-'));
process.env.PERF_OUTPUT_DIR = directory;
process.env.PERF_REPLICA = 'regression';
const client = Object.create(pg.Client.prototype);
let releases = 0;
const prepareRelease = () => { client.release = () => { releases++; }; return client; };
pg.Pool.prototype.connect = function (callback) {
  if (callback) { setTimeout(() => { prepareRelease(); callback(null, client, client.release); }, 5); return; }
  return delay(5).then(prepareRelease);
};
pg.Client.prototype.query = function (...args) {
  const callback = args.at(-1);
  if (typeof callback === 'function') { setTimeout(() => callback(null, { rows: [] }), 5); return; }
  return delay(5).then(() => ({ rows: [] }));
};
Redis.prototype.sendCommand = function (command) {
  return command.name === 'fail' ? Promise.reject(new Error('fixture failure')) : delay(5).then(() => 'fixture');
};
require('./performance-preload.cjs').install();
const sendCommand = Redis.prototype.sendCommand;
Redis.prototype.sendCommand = function (...args) {
  return globalThis.__lmsPerformance.measure('redis', () => sendCommand.apply(this, args));
};
const pool = new pg.Pool();
const redis = Object.create(Redis.prototype);
let rejected = false;
const server = http.createServer(async (_req, res) => {
  await globalThis.__lmsPerformance.measure('auth', async () => {
    await new Promise((resolve, reject) => pool.connect((error, value, release) => {
      if (error) return reject(error);
      assert.equal(value.release, release, 'Callback and client release share the same checkout');
      resolve(value);
    }));
    await client.query('secret fixture SQL must never be logged', ['secret-query-value']);
    client.release();
    await redis.sendCommand({ name: 'get', args: ['secret-token-key'] });
  });
  await globalThis.__lmsPerformance.measure('handler', async () => {
    await delay(1005); // Exercise the slow-request record with secret-bearing inputs.
    await pool.connect();
    await new Promise((resolve, reject) => client.query('secret SQL', (error, value) => error ? reject(error) : resolve(value)));
    client.release();
    await redis.sendCommand({ name: 'fail' }).catch(() => { rejected = true; });
  });
  res.setHeader('content-type', 'application/json');
  res.end('{"ok":true}');
});

async function waitForState(active) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = JSON.parse(fs.readFileSync(path.join(directory, 'app-regression.state.json'), 'utf8'));
    if (state.error) throw new Error(state.error);
    if (state.active === active && (active || state.profileWritten)) return state;
    await delay(20);
  }
  throw new Error('State did not transition');
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    process.emit('SIGUSR2');
    await waitForState(true);
    const url = `http://127.0.0.1:${server.address().port}/api/student/dashboard?secret-query-string`;
    const response = await fetch(url, { headers: { authorization: 'Bearer secret-access-token', cookie: 'secret-cookie' } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    for (const phase of ['node', 'auth', 'handler', 'db-pool-wait', 'db-query', 'redis']) assert.ok(Number(response.headers.get(`x-perf-${phase}-ms`)) > 0, phase);
    assert.equal(rejected, true, 'Rejected cache operations preserve error behavior');
    process.emit('SIGUSR2');
    const state = await waitForState(false);
    const records = fs.readFileSync(path.join(directory, `${state.basename}.jsonl`), 'utf8');
    assert.doesNotMatch(records, /secret|Bearer|SQL/);
    const parsed = records.trim().split('\n').map(JSON.parse);
    assert.equal(parsed.find(row => row.type === 'request').path, '/api/student/dashboard');
    const interval = parsed.find(row => row.type === 'interval');
    assert.equal(releases, 2, 'Instrumentation preserves callback and Promise releases');
    assert.equal(interval.metrics['db_connection_hold:unknown'].count, 2);
    assert.equal(interval.requests.completed, 1);
    assert.equal(typeof interval.gc, 'object');
    for (const phase of ['auth', 'handler', 'db_pool_wait', 'db_query', 'redis', '/api/student/dashboard:node']) assert.ok(interval.metrics[phase].count > 0, phase);
    const profile = JSON.parse(fs.readFileSync(path.join(directory, `${state.basename}.cpuprofile`), 'utf8'));
    assert.ok(profile.nodes.length > 0);
    const inactive = await fetch(url);
    assert.equal(inactive.headers.get('x-perf-node-ms'), null, 'Diagnostics stop after the profiling window');
    await inactive.text();
    console.log('Diagnostic verification passed: native CPU profile, HTTP/auth/handler/DB/pool/Redis timings, callback/Promise/error behavior, secret-free records, and inactive-window behavior. No k6, token generation, or external database/cache calls.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
    // Verified absolute temporary directory created above; remove only this fixture.
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
