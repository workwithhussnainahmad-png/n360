// Run the unchanged 1,000-VU load scenario with optional diagnostic deployment.
// Requires ordinary k6 + statement-observer + diagnostics + headroom overlays.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const label = process.argv[2] || 'headroom1000-diagnostic';
if (!/^[a-z0-9-]+$/i.test(label)) throw Error('Use an alphanumeric experiment label');
const directory = path.resolve('docs/performance-1000vu-2026-10-02', `${new Date().toISOString().replaceAll(':', '-')}-${label}`);
fs.mkdirSync(directory, { recursive: true });
const names = ['lms-backend-app-1', 'nisaab360-app2'];
const docker = async (...args) => (await exec('docker', args, { windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
const errors = error => fs.appendFileSync(path.join(directory, 'collection-errors.txt'), error.message + '\n');
const started = [];
let sampler, profileTimer, sampling = Promise.resolve(), profiling = Promise.resolve(), busy = false;
try {
  for (const name of names) {
    await docker('exec', '-e', 'NODE_OPTIONS=', name, 'node', '/diagnostics-tools/performance-preload.cjs', 'start');
    started.push(name);
  }
  const sample = async () => {
    const time = new Date().toISOString();
    const output = await docker('exec', 'lms-backend-pgbouncer-1', 'sh', '-c', 'PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 6432 -U "$DB_USER" -d pgbouncer --csv -c "SHOW POOLS;" -c "SHOW STATS;"');
    fs.appendFileSync(path.join(directory, 'pgbouncer.jsonl'), JSON.stringify({ time, output }) + '\n');
  };
  await sample();
  sampler = setInterval(() => {
    if (busy) return;
    busy = true;
    sampling = sample().catch(errors).finally(() => { busy = false; });
  }, 10000);
  profileTimer = setTimeout(() => {
    profiling = (async () => {
      const startedAt = new Date().toISOString();
      await docker('exec', 'lms-backend-caddy-1', 'wget', '-q', '-O', '/tmp/headroom-cpu.pb.gz', 'http://127.0.0.1:2019/debug/pprof/profile?seconds=30');
      await docker('cp', 'lms-backend-caddy-1:/tmp/headroom-cpu.pb.gz', path.join(directory, 'caddy-cpu.pb.gz'));
      fs.writeFileSync(path.join(directory, 'caddy-profile-window.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString() }));
    })().catch(errors);
  }, 210000);
  console.log(`Diagnostic artifacts: ${directory}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/run-performance-experiment.ps1', '-Label', label, '-Vus', '1000', '-Hold', '5m', '-AffinityMask', 'FF', '-SkipCaddyArchive'], {
      windowsHide: true, env: { ...process.env, PERF_DIAGNOSTICS: 'true' },
    });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
      process.stdout.write(data); fs.appendFileSync(path.join(directory, 'runner.txt'), data);
    });
    child.on('error', reject); child.on('exit', resolve);
  });
  if (code !== 0) throw Error(`Experiment runner exited ${code}`);
} finally {
  clearInterval(sampler); clearTimeout(profileTimer);
  await sampling; await profiling;
  for (const name of started) {
    try {
      const state = JSON.parse(await docker('exec', '-e', 'NODE_OPTIONS=', name, 'node', '/diagnostics-tools/performance-preload.cjs', 'stop'));
      for (const ext of ['jsonl', 'cpuprofile']) await docker('cp', `${name}:/diagnostics/${state.basename}.${ext}`, path.join(directory, `${name}.${ext}`));
    } catch (error) { errors(error); }
  }
  console.log(`Diagnostic collection finished: ${directory}`);
}
