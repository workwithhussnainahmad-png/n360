// Bounded preflight for the two-replica capacity target. Never runs k6 or logs tokens.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 20000 });
const names = ['lms-backend-app-1', 'nisaab360-app2', 'lms-backend-caddy-1'];
const containers = JSON.parse(docker('inspect', ...names));
const apps = containers.slice(0, 2);
for (const container of containers) {
  assert.equal(container.State.Status, 'running', `${container.Name}: running`);
  assert.equal(container.State.Health?.Status, 'healthy', `${container.Name}: healthy`);
  assert.equal(container.State.OOMKilled, false);
}
assert.equal(apps[0].Image, apps[1].Image, 'Both replicas must use the same candidate image');
const selectedEnvironment = container => Object.fromEntries(container.Config.Env
  .filter(value => /^(NODE_OPTIONS|DB_POOL_MAX|HOT_PATH_LANE|HOT_PATH_JSON_BODY|PERF_DIAGNOSTICS|KEEP_ALIVE_TIMEOUT)=/.test(value))
  .map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
for (const app of apps) {
  const environment = selectedEnvironment(app);
  assert.ok(environment.PERF_DIAGNOSTICS !== '1', 'Capacity acceptance must run with profiling disabled');
  assert.ok(!environment.NODE_OPTIONS?.includes('performance-preload'), 'Diagnostic preloader must be disabled');
  assert.ok(environment.HOT_PATH_LANE !== '0');
  assert.deepEqual(app.Config.Cmd, ['node', 'scripts/standalone-server.cjs']);
}
const proxyPorts = containers[2].NetworkSettings.Ports['3000/tcp'];
assert.ok(proxyPorts?.some(port => port.HostPort === '3000'), 'Port 3000 must publish Caddy');
const base = 'http://127.0.0.1:3000';
const ready = await fetch(base + '/api/ready', { signal: AbortSignal.timeout(15000) });
assert.equal(ready.status, 200);
await ready.arrayBuffer();
const tokenFile = readFileSync('k6/tokens.json');
const { tokens } = JSON.parse(tokenFile.toString('utf8').replace(/^\uFEFF/, ''));
const account = tokens.find(token => token.roleHint === 'STAFF');
assert.ok(account && Date.parse(account.expiresAt) > Date.now() + 60000, 'Current prepared staff token required');
const response = await fetch(base + '/api/staff/dashboard', { headers: { authorization: `Bearer ${account.accessToken}` }, signal: AbortSignal.timeout(15000) });
assert.equal(response.status, 200);
assert.ok(response.headers.has('x-perf-proxy-ms'), 'Live requests must traverse the configured Caddy path');
assert.equal(response.headers.get('x-perf-node-ms'), null, 'Profile timing headers must be absent');
assert.ok((await response.json()).firstName, 'Authenticated dashboard contract');
const [cpus, memory] = docker('info', '--format', '{{.NCPU}}|{{.MemTotal}}').trim().split('|').map(Number);
const snapshot = {
  capturedAt: new Date().toISOString(), base, proxyVerified: true, cpus, memory,
  apps: apps.map(app => ({ name: app.Name, image: app.Image, command: app.Config.Cmd,
    health: app.State.Health.Status, restartCount: app.RestartCount, environment: selectedEnvironment(app),
    node: docker('exec', app.Id, 'node', '--version').trim(),
    buildId: docker('exec', app.Id, 'cat', '/app/.next/BUILD_ID').trim() })),
  tokenCount: tokens.filter(token => ['STAFF', 'STUDENT'].includes(token.roleHint)).length,
  tokenFileSha256: createHash('sha256').update(tokenFile).digest('hex'),
  scripts: Object.fromEntries(['k6/config.js', 'k6/scripts/load.js', 'k6/scripts/stress.js', 'k6/scripts/spike.js']
    .map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])),
};
writeFileSync('.codex/latest-capacity-environment.json', JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Capacity preflight passed: Caddy → two healthy identical replicas, profiling off, ${cpus} Docker CPUs, ${(memory / 1073741824).toFixed(2)} GiB, ${snapshot.tokenCount} MIXED tokens. Snapshot: .codex/latest-capacity-environment.json`);
