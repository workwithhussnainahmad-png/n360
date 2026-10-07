/** Bounded functional checks only; no k6, tokens or application writes. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const file of ['Caddyfile', 'Caddyfile.k6']) {
  const config = readFileSync(file, 'utf8');
  const transports = [...config.matchAll(/transport http\s*\{([^}]+)\}/g)];
  assert.equal(transports.length, file === 'Caddyfile' ? 2 : 1);
  for (const [, transport] of transports) {
    assert.match(transport, /keepalive 60s/);
    assert.match(transport, /keepalive_idle_conns 1024/);
    assert.match(transport, /keepalive_idle_conns_per_host 512/);
  }
}

const compose = ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.k6.yml'];
// Two real readiness requests per replica, separated by six idle seconds.
// This fails under the former five-second server timeout.
const check = `
const assert = require('node:assert/strict');
const http = require('node:http');
assert.equal(process.env.KEEP_ALIVE_TIMEOUT, '65000');
assert.equal(process.env.DB_POOL_MAX, '15');
assert.notEqual(process.env.PERF_DIAGNOSTICS, '1');
const agent = new http.Agent({keepAlive:true,maxSockets:1});
function request(){return new Promise((resolve,reject)=>{
 const req=http.get('http://127.0.0.1:3000/api/ready',{agent},res=>{
  assert.equal(res.statusCode,200);
  assert.match(res.headers['keep-alive'],/timeout=65/);
  const socket=res.socket;res.resume();res.on('end',()=>resolve(socket));
 });req.on('error',reject);req.setTimeout(10000,()=>req.destroy(new Error('Timed out')));
});}
(async()=>{try{
 const first=await request();await new Promise(resolve=>setTimeout(resolve,6000));
 assert.equal(first.destroyed,false,'Idle connection closed before proxy timeout');
 assert.equal(await request(),first,'Connection was not reused');
 console.log('65-second server timeout and connection reuse verified');
}finally{agent.destroy();}})().catch(error=>{console.error(error);process.exitCode=1;});
`;
for (const service of ['app', 'app2']) {
  const result = spawnSync('docker', [...compose, 'exec', '-T', '-e', 'NODE_OPTIONS=', service, 'node', '-'], {
    input: check, encoding: 'utf8', windowsHide: true, timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${service}: ${result.stderr}`);
  console.log(`${service}: ${result.stdout.trim()}`);
}
const response = await fetch('http://localhost:3000/api/health', { signal: AbortSignal.timeout(10_000) });
assert.equal(response.status, 200);
const proxyMs = response.headers.get('x-perf-proxy-ms');
assert.ok(proxyMs !== null && Number.isFinite(Number(proxyMs)), 'Caddy upstream timing missing');
await response.text();
console.log('Local proxy timing verified. Five functional requests; no load test.');
