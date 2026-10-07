// Offline checks only: k6 and Windows shutdown are replaced with a stub.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkReady, runTests, tests } from './run-test-suite.mjs';

await checkReady('http://example.invalid/', async url => {
  assert.equal(url, 'http://example.invalid/api/ready');
  return { status: 200 };
});
await assert.rejects(checkReady('http://example.invalid', async () => {
  throw new Error('fetch failed', { cause: { code: 'ECONNREFUSED' } });
}), /ECONNREFUSED[\s\S]*npm start[\s\S]*No tests ran/);
await assert.rejects(checkReady('http://example.invalid', async () => ({ status: 503 })), /HTTP 503/);

assert.equal(tests.length, 16);
assert.equal(new Set(tests.map(test => test.name)).size, 16);
for (const failure of [null, 'fatal', 'busy']) {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'lms-suite-check-'));
  let completed = 0;
  let shutdowns = 0;
  const run = (command, args, options) => {
    if (command === 'powershell.exe') return { status: failure === 'busy' ? 1 : 0 };
    if (command === 'shutdown.exe') {
      shutdowns++;
      assert.deepEqual(args, ['/s', '/f', '/t', '60']);
      assert.equal(completed, 16);
      assert.equal(readdirSync(outputDir).length, 16);
      for (const file of readdirSync(outputDir)) {
        assert.match(readFileSync(path.join(outputDir, file), 'utf8'), /Finished:.*\nExit code: (0|99)/);
      }
      return { status: 0 };
    }
    assert.equal(command, process.execPath);
    assert.equal(args[1], tests[completed].scenario);
    if (completed) {
      const previous = readFileSync(path.join(outputDir, `${tests[completed - 1].name}.txt`), 'utf8');
      assert.match(previous, /Finished:/, 'Previous result must be finalized before the next test');
    }
    writeSync(options.stdio[1], 'Simulated k6 summary\n');
    completed++;
    return { status: failure === 'fatal' ? 1 : completed % 2 ? 99 : 0 };
  };
  try {
    const execute = () => runTests({ outputDir, env: { TEST_ROLE: 'MIXED', BASE_URL: 'http://example.invalid' }, run });
    if (failure) {
      assert.throws(execute, failure === 'busy' ? /Another k6/ : /could not complete/);
      assert.equal(shutdowns, 0);
      assert.equal(completed, failure === 'busy' ? 0 : 1);
    } else {
      execute();
      assert.equal(completed, 16);
      assert.equal(shutdowns, 1);
    }
  } finally {
    for (const file of readdirSync(outputDir)) unlinkSync(path.join(outputDir, file));
    rmdirSync(outputDir);
  }
}
console.log('PASS: 16 separate results, ordered execution, threshold failures continue, fatal/busy failures prevent shutdown.');
