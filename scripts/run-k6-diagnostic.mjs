/** User-run only: records the existing load scenario and its diagnostics. */
import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const runtime = join(root, '.codex', 'performance', 'runtime');
const compose = ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.k6.yml', '-f', '.codex/performance/config-archive/docker-compose.diagnostics.yml'];
const services = ['app', 'app2'];
const verifyOnly = process.argv.includes('--verify-collection');
const targetVus = Number(process.env.TARGET_VUS || 500);
if (!Number.isSafeInteger(targetVus) || targetVus < 1) throw new Error('TARGET_VUS must be a positive integer.');
const startedAt = new Date().toISOString();
const runDirectory = join(root, '.codex', 'performance', `run-${startedAt.replaceAll(':', '-')}`);

function command(executable, args, outputFile, echo = false) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, args, { cwd: root, env: process.env, windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; if (outputFile) appendFileSync(outputFile, chunk); if (echo) process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { output += chunk; if (outputFile) appendFileSync(outputFile, chunk); if (echo) process.stderr.write(chunk); });
    child.on('error', reject);
    child.on('close', code => resolveResult({ code, output }));
  });
}
async function docker(args, outputFile) {
  const result = await command('docker', args, outputFile);
  if (result.code !== 0) {
    appendFileSync(join(runDirectory, 'collection-errors.txt'), `${args.filter(arg => arg !== '').join(' ')}\n${result.output}\n`);
    throw new Error(`Docker command failed. Check ${join(runDirectory, 'collection-errors.txt')}.`);
  }
  return result.output;
}
async function collectSnapshot() {
  const time = new Date().toISOString();
  await Promise.all([
    docker(['stats', '--no-stream', '--format', '{{json .}}']).then(output => {
      for (const line of output.trim().split(/\r?\n/).filter(Boolean)) appendFileSync(join(runDirectory, 'docker-stats.jsonl'), JSON.stringify({ time, ...JSON.parse(line) }) + '\n');
    }),
    docker([...compose, 'exec', '-T', 'postgres', 'psql', '-U', process.env.POSTGRES_USER || 'app', '-d', process.env.POSTGRES_DB || 'app', '-At', '-c', "select json_build_object('type','database','backends',numbackends,'commits',xact_commit,'rollbacks',xact_rollback,'blocksRead',blks_read,'blocksHit',blks_hit,'tempBytes',temp_bytes,'deadlocks',deadlocks) from pg_stat_database where datname=current_database(); select json_build_object('type','wait','state',state,'waitType',wait_event_type,'waitEvent',wait_event,'count',count(*)) from pg_stat_activity where datname=current_database() group by state,wait_event_type,wait_event;"]).then(output => {
      for (const line of output.trim().split(/\r?\n/).filter(Boolean)) appendFileSync(join(runDirectory, 'postgres.jsonl'), JSON.stringify({ time, ...JSON.parse(line) }) + '\n');
    }),
    docker([...compose, 'exec', '-T', 'pgbouncer', 'sh', '-c', 'PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -p 6432 -U "$DB_USER" -d pgbouncer -c "SHOW POOLS;" -c "SHOW STATS;"']).then(output => appendFileSync(join(runDirectory, 'pgbouncer.txt'), `${time}\n${output}\n`)),
  ]);
}

async function main() {
  mkdirSync(runDirectory, { recursive: true });
  process.env.TEST_ROLE = 'MIXED';
  process.env.BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
  // Validates current tokens and runner arguments without starting k6.
  const preparation = await command(process.execPath, ['k6/run.mjs', 'load', '--dry-run', '-e', `TARGET_VUS=${targetVus}`, '-e', 'DURATION=5m', '-e', 'PERF_DIAGNOSTICS=true'], join(runDirectory, 'preparation.txt'));
  if (preparation.code !== 0) throw new Error('Token/runner preparation failed. Run the dry-run command to see the cause.');
  for (const service of services) {
    const status = JSON.parse(await docker([...compose, 'ps', '--format', 'json', service]));
    if (status.Health !== 'healthy') throw new Error(`${service} is not healthy; start the diagnostic stack first.`);
  }
  const started = [];
  let timer;
  let sampling = Promise.resolve();
  let collecting = false;
  try {
    for (const service of services) {
      await docker([...compose, 'exec', '-T', '-e', 'NODE_OPTIONS=', service, 'node', '/diagnostics-tools/performance-preload.cjs', 'start']);
      started.push(service);
    }
    await collectSnapshot();
    timer = setInterval(() => {
      if (collecting) return;
      collecting = true;
      sampling = collectSnapshot().catch(error => appendFileSync(join(runDirectory, 'collection-errors.txt'), error.message + '\n')).finally(() => { collecting = false; });
    }, 10_000);
    console.log(`Diagnostics: ${runDirectory}`);
    let result;
    if (verifyOnly) {
      const { tokens } = JSON.parse(readFileSync(join(root, 'k6', 'tokens.json'), 'utf8'));
      for (const role of ['STAFF', 'STUDENT']) {
        const account = tokens.find(row => row.roleHint === role);
        for (const page of ['dashboard', 'profile']) {
          const response = await fetch(`http://localhost:3000/api/${role.toLowerCase()}/${page}`, { headers: { authorization: `Bearer ${account.accessToken}` }, signal: AbortSignal.timeout(15_000) });
          if (response.status !== 200 || response.headers.get('x-perf-node-ms') === null || response.headers.get('x-perf-auth-ms') === null || response.headers.get('x-perf-handler-ms') === null) throw new Error('Live diagnostic response headers missing or route failed');
          const operationHeader = page === 'dashboard' ? 'x-perf-redis-ms' : 'x-perf-db-query-ms';
          if (response.headers.get(operationHeader) === null) throw new Error(`Missing live operation timing: ${operationHeader}`);
          await response.text();
        }
      }
      console.log('Four functional diagnostic requests passed. No k6 executed.');
      result = { code: 0 };
    } else {
      console.log(`Running MIXED ${targetVus} VUs, 5-minute hold plus original ramps. Thresholds unchanged.`);
      result = await command(process.execPath, ['k6/run.mjs', 'load', '-e', `TARGET_VUS=${targetVus}`, '-e', 'DURATION=5m', '-e', 'PERF_DIAGNOSTICS=true'], join(runDirectory, 'k6-result.txt'), true);
    }
    writeFileSync(join(runDirectory, 'run.json'), JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), verificationOnly: verifyOnly, vus: verifyOnly ? 0 : targetVus, hold: verifyOnly ? null : '5m', role: 'MIXED', replicas: 2, generator: 'native', k6ExitCode: verifyOnly ? null : result.code }, null, 2));
    process.exitCode = result.code;
  } finally {
    clearInterval(timer);
    await sampling;
    for (const service of started) {
      try {
        const state = JSON.parse(await docker([...compose, 'exec', '-T', '-e', 'NODE_OPTIONS=', service, 'node', '/diagnostics-tools/performance-preload.cjs', 'stop']));
        for (const extension of ['jsonl', 'cpuprofile']) copyFileSync(join(runtime, `${state.basename}.${extension}`), join(runDirectory, `${service}.${extension}`));
      } catch (error) { appendFileSync(join(runDirectory, 'collection-errors.txt'), `${service}: ${error.message}\n`); }
    }
    await docker([...compose, 'logs', '--no-color', '--since', startedAt, 'app', 'app2', 'caddy'], join(runDirectory, 'containers.txt'));
    console.log(`\nFinished. Diagnostic files: ${runDirectory}`);
    if (!verifyOnly) console.log('A nonzero k6 exit does not skip diagnostic collection.');
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
