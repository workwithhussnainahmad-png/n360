import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const tests = [1000, 1200, 1500, 2000].flatMap(vus => [
  { name: `${vus}vu-load`, scenario: 'load', args: ['-e', `TARGET_VUS=${vus}`, '-e', 'DURATION=5m'] },
  { name: `${vus}vu-load-long`, scenario: 'load', args: ['-e', `TARGET_VUS=${vus}`, '-e', 'DURATION=30m'] },
  { name: `${vus}vu-stress`, scenario: 'stress', args: ['-e', `MAX_VUS=${vus}`, '-e', 'DURATION=5m'] },
  { name: `${vus}vu-spike`, scenario: 'spike', args: ['-e', `SPIKE_VUS=${vus}`] },
]);

function assertNoK6(run) {
  const result = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'if (Get-Process -Name k6 -ErrorAction SilentlyContinue) { exit 1 }'],
  { windowsHide: true, stdio: 'pipe' });
  assert.ok(!result.error && result.status === 0, 'Another k6 test is running, or its process check failed. Suite stopped.');
}

export async function checkReady(baseUrl, request = fetch) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/ready`;
  let response;
  try {
    response = await request(url, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw new Error(`Cannot reach ${url} (${error.cause?.code || error.message}).\nRun npm start in another terminal and wait for "Ready", then run this script again.\nIf the app uses another address, set BASE_URL to that address. No tests ran and shutdown was not scheduled.`);
  }
  assert.equal(response.status, 200,
    `Application readiness check returned HTTP ${response.status} at ${url}. Check the application, database and cache before retrying. No tests ran and shutdown was not scheduled.`);
}

export function runTests({ outputDir, env, run = spawnSync, shutdown = true }) {
  for (const [index, test] of tests.entries()) {
    assertNoK6(run);
    const filename = path.join(outputDir, `${test.name}.txt`);
    console.log(`[${index + 1}/${tests.length}] ${test.name} -> ${filename}`);
    const fd = openSync(filename, 'wx');
    let result;
    try {
      writeSync(fd, `Test: ${test.name}\nRole: ${env.TEST_ROLE}\nTarget: ${env.BASE_URL}\nStarted: ${new Date().toISOString()}\n\n`);
      // Blocking execution: the next test cannot start until this process exits.
      result = run(process.execPath, ['k6/run.mjs', test.scenario, '--quiet', '--no-color', ...test.args], {
        cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd],
      });
      writeSync(fd, `\nFinished: ${new Date().toISOString()}\nExit code: ${result.status}\n${result.error ? `Error: ${result.error.message}\n` : ''}`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    // k6 returns 99 for completed tests whose thresholds failed. Keep those results.
    assert.ok(!result.error && [0, 99].includes(result.status),
      `${test.name} could not complete (exit ${result.status}). See ${filename}. Shutdown was not scheduled.`);
  }

  console.log(`All ${tests.length} results saved in ${outputDir}`);
  if (shutdown) {
    const result = run('shutdown.exe', ['/s', '/f', '/t', '60'], { stdio: 'inherit', windowsHide: true });
    assert.ok(!result.error && result.status === 0, 'Results saved, but Windows could not schedule shutdown.');
    console.log('Forced shutdown in 60 seconds. To cancel: shutdown /a');
  }
}

async function main() {
  const flags = process.argv.slice(2);
  assert.ok(flags.every(flag => ['--dry-run', '--no-shutdown'].includes(flag)), 'Options: --dry-run, --no-shutdown');
  if (flags.includes('--dry-run')) {
    for (const test of tests) console.log(`${test.name}.txt: ${test.scenario} ${test.args.join(' ')}`);
    console.log(`Total: ${tests.length} sequential tests; about 4h 25m 20s plus overhead.`);
    console.log(flags.includes('--no-shutdown') ? 'Shutdown disabled.' : 'After all results: shutdown.exe /s /f /t 60');
    return;
  }
  assert.equal(process.platform, 'win32', 'This automation requires Windows.');
  const env = { ...process.env, TEST_ROLE: 'MIXED', BASE_URL: process.env.BASE_URL || 'http://127.0.0.1:3000' };
  env.BASE_URL = env.BASE_URL.replace('host.docker.internal', '127.0.0.1');
  const resultsRoot = path.join(root, 'test-results');
  mkdirSync(resultsRoot, { recursive: true });
  const lock = path.join(resultsRoot, 'suite.lock');
  assert.ok(!existsSync(lock), `A suite is already running. If an earlier run crashed, remove ${lock} after checking no k6 process is running.`);
  const lockFd = openSync(lock, 'wx');
  closeSync(lockFd);
  try {
    assertNoK6(spawnSync);
    const preview = spawnSync(process.execPath, ['k6/run.mjs', 'load', '--dry-run'], { cwd: root, env, encoding: 'utf8', windowsHide: true });
    assert.equal(preview.status, 0, `Token/launcher check failed:\n${preview.stderr || preview.error?.message}`);
    const { command } = JSON.parse(preview.stdout);
    const version = spawnSync(command, ['version'], { stdio: 'pipe', windowsHide: true });
    assert.ok(!version.error && version.status === 0, 'Native k6 is unavailable.');
    const { tokens } = JSON.parse(readFileSync(path.join(root, 'k6/tokens.json'), 'utf8'));
    assert.ok(tokens.filter(token => ['STUDENT', 'STAFF'].includes(token.roleHint))
      .every(token => Date.parse(token.expiresAt) > Date.now() + 5 * 60 * 60 * 1000),
    'Tokens must remain valid for at least 5 hours. Run npm.cmd run k6:tokens first.');
    await checkReady(env.BASE_URL);
    const outputDir = path.join(resultsRoot, new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(outputDir);
    console.log(`Results: ${outputDir}`);
    runTests({ outputDir, env, shutdown: !flags.includes('--no-shutdown') });
  } finally {
    unlinkSync(lock);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
