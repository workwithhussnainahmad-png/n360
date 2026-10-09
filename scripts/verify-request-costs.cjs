const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(file, mocks, globals = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: name => { if (!(name in mocks)) throw Error('Unexpected dependency: ' + name); return mocks[name]; }, console, Date, Promise, Map, Set, URL, AbortController, DOMException, setTimeout, clearTimeout, ...globals }, { filename: file });
  return loaded.exports;
}
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
async function session() {
  const pending = [], timers = new Map(), events = new Map(); let nextTimer = 0, effect;
  let exp = Date.now() + 60_000;
  const document = { get cookie() { return 'session_exp=' + exp; }, visibilityState: 'visible', documentElement: { dataset: {} }, addEventListener: (key, callback) => events.set(key, callback), removeEventListener: key => events.delete(key) };
  const window = { addEventListener: (key, callback) => events.set(key, callback), removeEventListener: key => events.delete(key) };
  const globals = { document, window, navigator: { onLine: true }, setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; }, clearTimeout: key => timers.delete(key), fetch: url => url === '/api/auth/refresh' ? new Promise(resolve => pending.push(resolve)) : Promise.resolve(new Response('{}', { status: pending.length ? 401 : 200, headers: { 'content-type': 'application/json' } })) };
  const refresh = load('src/lib/session-refresh.ts', {}, globals);
  const watcher = load('src/components/SessionWatcher.tsx', { react: { useEffect: callback => { effect = callback; } }, 'next/navigation': { usePathname: () => '/student/fees' }, '@/lib/session-refresh': refresh }, globals);
  watcher.default(); const cleanup = effect();
  assert.equal(pending.length, 1); events.get('focus')(); events.get('visibilitychange')();
  const retryRequests = new Map();
  globals.fetch = url => url === '/api/auth/refresh' ? new Promise(resolve => pending.push(resolve)) : Promise.resolve(new Response('{}', { status: retryRequests.has(url) ? 200 : (retryRequests.set(url, true), 401), headers: { 'content-type': 'application/json' } }));
  const client = load('src/lib/api-client.ts', { './session-refresh': refresh, './validation-errors': { apiErrorMessage: () => 'Error' } }, globals);
  const a = client.api.get('/api/fixture/a'), b = client.api.get('/api/fixture/b');
  await flush(); assert.equal(pending.length, 1, 'watcher/focus/visibility and two 401s share one refresh');
  cleanup(); assert.equal(timers.size, 1, 'only the refresh timeout survives watcher cleanup');
  exp = Date.now() + 3_600_000; pending.shift()(new Response('{}')); await Promise.all([a, b]); await flush();
  assert.equal(timers.size, 0, 'completion after cleanup cannot schedule a watcher timer');
  exp = Date.now() + 60_000; watcher.default(); const cleanup2 = effect();
  assert.equal(pending.length, 1); pending.shift()(new Response('{}')); await flush();
  assert.equal(timers.size, 1); assert.ok([...timers.values()][0].delay >= 59_000, 'unchanged cookie cannot create an immediate loop');
  document.visibilityState = 'hidden'; const scheduled = [...timers.values()][0]; timers.clear(); scheduled.callback(); await flush(); assert.equal(pending.length, 0, 'hidden timer does not refresh'); cleanup2();
  console.log('PASS: shared refresh across watcher/401/focus/visibility, no work after cleanup, unchanged-cookie backoff and hidden-tab suppression');
}
async function qr() {
  const pending = []; let active = 0, peak = 0, calls = 0, key = 'first';
  const service = load('src/lib/student-id-card-qr.ts', { qrcode: { toDataURL: url => { calls++; active++; peak = Math.max(peak, active); return new Promise(resolve => pending.push(() => { active--; resolve(url); })); } }, './student-verification-token': { createStudentVerificationToken: (id, tenant, created) => key + ':' + id + ':' + tenant + ':' + created.getTime() } }, { process: { env: { NEXT_PUBLIC_APP_DOMAIN: 'example.test' } } });
  const student = { id: 1, institutionId: 1, createdAt: new Date('2026-01-01') };
  const tasks = Array.from({ length: 12 }, (_, i) => service.studentIdCardQr({ ...student, id: i + 1 }, 'localhost:3000'));
  const same = service.studentIdCardQr(student, 'localhost:3000');
  await flush(); assert.equal(calls, 2); assert.equal(peak, 2);
  while (pending.length) { pending.shift()(); await flush(); }
  const results = await Promise.all(tasks); assert.equal(await same, results[0]); assert.equal(calls, 12);
  assert.equal(await service.studentIdCardQr(student, 'localhost:3000'), results[0]); assert.equal(calls, 12);
  key = 'second'; const rotated = service.studentIdCardQr(student, 'localhost:3000'); await flush(); pending.shift()(); assert.notEqual(await rotated, results[0]);
  assert.ok(results[0].startsWith('http://localhost:3000/verify/student?'));
  const saturated = Array.from({ length: 140 }, (_, i) => service.studentIdCardQr({ ...student, id: i + 500 })).map(task => task.then(() => true, error => { assert.ok(error instanceof service.QrCapacityError); return false; }));
  await flush(); while (pending.length) { pending.shift()(); await flush(); }
  assert.equal((await Promise.all(saturated)).filter(Boolean).length, 130, 'two running encodes and at most 128 queued');
  console.log('PASS: QR encode concurrency <=2, bounded queue, identical in-flight/cache reuse, key rotation and localhost origin');
}
async function delay() {
  const { abortableDelay } = load('src/lib/abortable-delay.ts', {});
  const controller = new AbortController(); const task = abortableDelay(60_000, controller.signal); controller.abort();
  await assert.rejects(task, { name: 'AbortError' });
  const { positiveInteger, pagination } = load('src/lib/pagination.ts', {});
  for (const value of ['-1', 'Infinity', '1.2', 'abc']) assert.equal(positiveInteger(value, 50, 100), 50);
  assert.equal(positiveInteger('1000000', 50, 100), 100); assert.equal(pagination(9999, 101).page, 3);
  console.log('PASS: waits abort promptly; pagination bounds and last-page clamp');
}
async function uploadPolling() {
  const file = 'src/app/(staff)/staff/courses/page.tsx';
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let upload;
  function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'uploadVideo') upload = node; ts.forEachChild(node, visit); }
  visit(source); assert.ok(upload);
  // Evaluate the actual nested upload function with provider/browser spies.
  const code = ts.transpileModule('export ' + upload.getText(source), { fileName: 'upload.ts', compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let ticks = 0, creates = 0, statuses = 0, abortAt = Infinity, readyAt = Infinity;
  const delays = [], controller = new AbortController(), uploadedVideo = { current: null };
  const loaded = { exports: {} };
  const globals = { module: loaded, exports: loaded.exports, reads: { begin: () => controller.signal }, setMessage: () => {}, uploadedVideo,
    Date: class extends Date { static now() { return ticks; } }, document: { visibilityState: 'visible' }, navigator: { onLine: true }, DOMException,
    XMLHttpRequest: class { status = 200; upload = {}; open() {} setRequestHeader() {} send() { this.onload(); } abort() {} },
    abortableDelay: async (ms, signal) => { assert.ok(ms <= 30_000); delays.push(ms); ticks += ms; if (statuses >= abortAt) controller.abort(); if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); },
    fetch: async (url, options) => {
      assert.equal(options.signal, controller.signal);
      if (options.method === 'POST') { creates++; return Response.json({ uploadId: 'fixture', uploadMethod: 'PUT', uploadUrl: 'http://provider.test', headers: {} }); }
      statuses++; return Response.json(statuses >= readyAt ? { status: 'READY', videoUrl: 'http://provider.test/video' } : { status: 'PROCESSING' });
    },
  };
  vm.runInNewContext(code, globals);
  const fixture = { type: 'video/mp4', size: 100 };
  await assert.rejects(() => loaded.exports.uploadVideo(fixture, 'Video'), /longer than expected/);
  assert.equal(creates, 1); assert.ok(statuses < 25, 'ten minutes of processing needs fewer than 25 provider checks');
  assert.deepEqual(delays.slice(0, 4), [5000, 7500, 11250, 16875]);
  readyAt = statuses + 1;
  assert.equal(await loaded.exports.uploadVideo(fixture, 'Video'), 'http://provider.test/video');
  assert.equal(creates, 1, 'processing retry retains uploaded file and does not create a second provider upload');
  readyAt = Infinity; abortAt = statuses + 2;
  const before = statuses;
  await assert.rejects(() => loaded.exports.uploadVideo(fixture, 'Video'), { name: 'AbortError' });
  assert.equal(statuses, before + 2, 'cancelled wait performs no later status request');
  console.log('PASS: actual video function backs off to 30s, <25 provider polls/10min, reuses completed upload on retry and stops after cancellation');
}
(async () => { await session(); await qr(); await delay(); await uploadPolling(); })().catch(error => { console.error(error); process.exitCode = 1; });
