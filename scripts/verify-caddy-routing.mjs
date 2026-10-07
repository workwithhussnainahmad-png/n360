/** Isolated proxy load-selection/failure checks. Never targets the LMS. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const name = `codex-routing-${process.pid}`;
const file = resolve('.codex', `${name}.Caddyfile`);
const servers = [];
let ready = true, writes = 0, requests = 0;
const probes = [0, 0];
let heldReplica;
let releaseHeld;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
try {
  for (let replica = 0; replica < 2; replica++) {
    const server = createServer((req, res) => {
      if (req.url === '/api/ready') {
        probes[replica]++;
        res.writeHead(ready ? 200 : 503); res.end(); return;
      }
      if (req.method === 'PATCH') { writes++; req.socket.destroy(); return; }
      if (req.url === '/hold') {
        heldReplica = replica;
        releaseHeld = () => { res.end(JSON.stringify({ replica })); };
        return;
      }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ replica }));
    });
    servers.push(server);
    await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  }
  let config = readFileSync('Caddyfile.k6', 'utf8');
  for (let i = 0; i < servers.length; i++) config = config.replaceAll(`${i ? 'app2' : 'app'}:3000`, `host.docker.internal:${servers[i].address().port}`);
  // Shorten probe intervals only in this isolated fixture, to reproduce the
  // recorded brief simultaneous outage without a long-running test.
  config = config.replace('health_interval 10s', 'health_interval 100ms').replace('health_timeout 10s', 'health_timeout 50ms');
  writeFileSync(file, config);
  docker(['run', '-d', '--rm', '--name', name, '-p', '127.0.0.1::3000', '-v', `${file}:/etc/caddy/Caddyfile:ro`, 'caddy:2-alpine']);
  const port = docker(['port', name, '3000/tcp']).split(':').at(-1);
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  while (!probes.every(Boolean)) {
    assert.ok(Date.now() < deadline, 'Fixture Caddy did not start probing'); await pause(25);
  }
  async function request(token, method = 'GET') {
    requests++;
    return fetch(base + '/fixture', { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(5000) });
  }
  const chosen = new Set();
  for (let i = 0; i < 8; i++) {
    const first = await request(`fixture-${i}`); assert.equal(first.status, 200);
    const replica = (await first.json()).replica; chosen.add(replica);
  }
  assert.equal(chosen.size, 2, 'Bearer traffic must reach both replicas');
  // The SAME token must move to the free replica while one is busy. Header
  // hashing failed this property and left all pool timeouts on app2.
  const held = fetch(base + '/hold', { headers: { Authorization: 'Bearer fixture-busy' }, signal: AbortSignal.timeout(5000) });
  while (heldReplica === undefined) await pause(10);
  try {
    const free = await request('fixture-busy');
    assert.equal(free.status, 200);
    assert.notEqual((await free.json()).replica, heldReplica, 'Busy replica must not retain bearer traffic');
  } finally { releaseHeld(); await held; }
  for (let i = 0; i < 2; i++) assert.equal((await request()).status, 200, 'Headerless fallback works');
  const before = [...probes]; ready = false;
  while (!probes.every((count, i) => count >= before[i] + 3)) await pause(25);
  // Both upstreams have failed multiple probes. Recovery must yield a normal
  // response, rather than the 503 burst seen in the user's ordinary test.
  const recovery = setTimeout(() => { ready = true; }, 200);
  try { assert.equal((await request('fixture-recovery')).status, 200, 'Brief all-upstream ejection must retry selection'); }
  finally { clearTimeout(recovery); ready = true; }
  const failedMutation = await request('fixture-0', 'PATCH');
  assert.equal(failedMutation.status, 502);
  assert.equal(writes, 1, 'A mutation reaching an upstream must never be replayed');
  assert.equal((await request('fixture-0')).status, 200, 'Unavailable preferred replica must fail over');
  console.log(`Caddy routing passed: ${requests + 1} bounded mock requests; busy-replica avoidance with the same bearer, both replicas, headerless requests, brief total-probe failure recovery and no mutation replay. No LMS requests, k6 or tokens generated.`);
} finally {
  spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  try { unlinkSync(file); } catch {}
}
