/* Local, opt-in diagnostics. Never records tokens, user IDs, SQL or query values. */
const fs = require('node:fs');
const path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const { performance, monitorEventLoopDelay, createHistogram, PerformanceObserver } = require('node:perf_hooks');
const { Session } = require('node:inspector/promises');

const directory = process.env.PERF_OUTPUT_DIR || '/diagnostics';
// Next's HOSTNAME is the listen address (0.0.0.0), shared by both replicas.
const replica = process.env.PERF_REPLICA || require('node:os').hostname();
const statePath = path.join(directory, `app-${replica}.state.json`);
const allowedPath = /^\/api\/(?:staff|student)\/(?:dashboard|timetable|profile)$/;

function install() {
  const context = new AsyncLocalStorage();
  const loop = monitorEventLoopDelay({ resolution: 20 });
  let active = false;
  let busy = false;
  let session;
  let output;
  let basename;
  let timer;
  let sequence = 0;
  let histograms = new Map();
  let pools = new Set();
  let utilization = performance.eventLoopUtilization();
  let cpu = process.cpuUsage();
  let lastTick = performance.now();
  let gc = {};
  let inFlight = 0;
  let completed = 0;
  const gcObserver = new PerformanceObserver(list => {
    if (!active) return;
    for (const entry of list.getEntries()) {
      const row = gc[entry.detail.kind] ??= { count: 0, totalMs: 0, maxMs: 0 };
      row.count++; row.totalMs += entry.duration; row.maxMs = Math.max(row.maxMs, entry.duration);
    }
  });
  gcObserver.observe({ entryTypes: ['gc'] });
  fs.mkdirSync(directory, { recursive: true });
  const state = (extra) => {
    fs.writeFileSync(`${statePath}.tmp`, JSON.stringify({ pid: process.pid, active, ...extra }));
    fs.renameSync(`${statePath}.tmp`, statePath);
  };
  const write = (data) => output?.write(JSON.stringify({ time: new Date().toISOString(), ...data }) + '\n');
  function record(name, milliseconds) {
    if (!active) return;
    if (!histograms.has(name)) histograms.set(name, createHistogram());
    histograms.get(name).record(Math.max(1, Math.round(milliseconds * 1e6)));
  }
  function complete(phase, started, request) {
    const duration = performance.now() - started;
    record(phase, duration);
    if (request) request.phases[phase] = (request.phases[phase] || 0) + duration;
  }
  globalThis.__lmsPerformance = {
    async measure(phase, operation) {
      if (!active) return operation();
      const started = performance.now();
      const request = context.getStore();
      try { return await operation(); }
      finally { complete(phase, started, request); }
    },
  };

  // Preserve pg's Promise/callback/query-stream signatures and error behavior.
  function wrap(target, method, phase, isPool = false) {
    const original = target[method];
    target[method] = function (...args) {
      if (!active) return original.apply(this, args);
      if (isPool) pools.add(this);
      const started = performance.now();
      const request = context.getStore();
      const poolLabel = isPool ? this.options?.application_name || 'unknown' : undefined;
      let finished = false;
      const done = () => {
        if (!finished) {
          finished = true; complete(phase, started, request);
          if (poolLabel) record(`${phase}:${poolLabel}`, performance.now() - started);
        }
      };
      const observeRelease = (client, release = client?.release) => {
        if (!client || typeof release !== 'function') return release;
        const acquired = performance.now();
        let released = false;
        const measuredRelease = function (...values) {
          if (!released) {
            released = true;
            record(`db_connection_hold:${poolLabel}`, performance.now() - acquired);
          }
          return release.apply(client, values);
        };
        client.release = measuredRelease;
        return measuredRelease;
      };
      const callbackIndex = args.length - 1;
      if (typeof args[callbackIndex] === 'function') {
        const callback = args[callbackIndex];
        args[callbackIndex] = function (...values) {
          done();
          if (isPool && !values[0]) values[2] = observeRelease(values[1], values[2]);
          return callback.apply(this, values);
        };
      } else if (args[0] && typeof args[0].callback === 'function') {
        const callback = args[0].callback;
        args[0] = { ...args[0], callback: function (...values) { done(); return callback.apply(this, values); } };
      }
      try {
        const result = original.apply(this, args);
        if (result?.then) result.then(value => { done(); if (isPool) observeRelease(value); }, done);
        else if (result?.once) { result.once('end', done); result.once('error', done); }
        return result;
      } catch (error) { done(); throw error; }
    };
  }
  const appRequire = require('node:module').createRequire(path.join(process.cwd(), 'package.json'));
  const pg = appRequire('pg');
  wrap(pg.Pool.prototype, 'connect', 'db_pool_wait', true);
  wrap(pg.Client.prototype, 'query', 'db_query');

  // Starts at Node's HTTP request event, before Next dispatches middleware/routes.
  const http = require('node:http');
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (event, ...args) {
    if (event !== 'request' || !active) return emit.call(this, event, ...args);
    const [req, res] = args;
    const pathname = req.url.split('?')[0];
    if (!allowedPath.test(pathname)) return emit.call(this, event, ...args);
    const request = { path: pathname, started: performance.now(), phases: {}, sequence: ++sequence };
    inFlight++;
    res.once('close', () => { inFlight--; });
    const writeHead = res.writeHead;
    res.writeHead = function (...headArgs) {
      request.headersMs = performance.now() - request.started;
      if (!this.headersSent) {
        this.setHeader('x-perf-node-ms', request.headersMs.toFixed(3));
        for (const [name, duration] of Object.entries(request.phases)) this.setHeader(`x-perf-${name.replaceAll('_', '-')}-ms`, duration.toFixed(3));
      }
      return writeHead.apply(this, headArgs);
    };
    res.once('finish', () => {
      if (!active) return;
      const duration = performance.now() - request.started;
      completed++;
      record(`${pathname}:node`, duration);
      if (duration >= 1000 || request.sequence % 100 === 0) write({ type: 'request', path: pathname, status: res.statusCode, nodeMs: duration, headersMs: request.headersMs, phases: request.phases });
    });
    return context.run(request, () => emit.call(this, event, ...args));
  };

  function snapshot() {
    const now = performance.now();
    const cpuDelta = process.cpuUsage(cpu);
    cpu = process.cpuUsage();
    const eventLoop = performance.eventLoopUtilization(utilization);
    utilization = performance.eventLoopUtilization();
    const metrics = {};
    for (const [name, histogram] of histograms) metrics[name] = { count: histogram.count, meanMs: histogram.mean / 1e6, p95Ms: histogram.percentile(95) / 1e6, p99Ms: histogram.percentile(99) / 1e6, maxMs: histogram.max / 1e6 };
    const cache = globalThis[Symbol.for('nisaab360.performance-cache')];
    write({ type: 'interval', elapsedMs: now - lastTick, cpuPercent: (cpuDelta.user + cpuDelta.system) / ((now - lastTick) * 10), memory: process.memoryUsage(), eventLoopUtilization: eventLoop.utilization, loopP95Ms: loop.percentile(95) / 1e6, loopMaxMs: loop.max / 1e6, pools: [...pools].map(pool => ({ name: pool.options?.application_name, max: pool.options?.max, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount })), metrics, gc, requests: { inFlight, completed }, cache: cache ? Object.fromEntries(cache) : null });
    gc = {}; completed = 0;
    lastTick = now;
    histograms.clear();
    loop.reset();
  }
  process.on('SIGUSR2', async () => {
    if (busy) return;
    busy = true;
    try {
      if (!active) {
        basename = `app-${replica}-${Date.now()}`;
        output = fs.createWriteStream(path.join(directory, `${basename}.jsonl`));
        session = new Session();
        session.connect();
        await session.post('Profiler.enable');
        await session.post('Profiler.setSamplingInterval', { interval: 10_000 });
        await session.post('Profiler.start');
        histograms = new Map();
        pools = new Set();
        sequence = 0;
        gc = {}; completed = 0;
        active = true;
        loop.reset(); loop.enable();
        utilization = performance.eventLoopUtilization();
        cpu = process.cpuUsage(); lastTick = performance.now();
        write({ type: 'start', cpuSamplingMicroseconds: 10_000 });
        timer = setInterval(snapshot, 10_000); timer.unref();
        state({ basename, profileWritten: false });
      } else {
        clearInterval(timer);
        snapshot();
        active = false;
        loop.disable();
        const { profile } = await session.post('Profiler.stop');
        session.disconnect();
        fs.writeFileSync(path.join(directory, `${basename}.cpuprofile`), JSON.stringify(profile));
        write({ type: 'stop' });
        await new Promise(resolve => output.end(resolve));
        output = undefined;
        state({ basename, profileWritten: true });
      }
    } catch (error) {
      active = false;
      clearInterval(timer); loop.disable(); session?.disconnect(); output?.end();
      state({ error: error.message });
      console.error('Performance diagnostics failed:', error.message);
    } finally { busy = false; }
  });
  state({ profileWritten: false });
}

async function control(action) {
  if (process.env.PERF_DIAGNOSTICS !== '1') throw new Error('Diagnostics are disabled; deploy .codex/performance/config-archive/docker-compose.diagnostics.yml before capture');
  if (!['start', 'stop'].includes(action)) throw new Error('Expected start or stop');
  const readState = async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    throw new Error(`Diagnostic state file unavailable: ${statePath}`);
  };
  const before = await readState();
  const targetActive = action === 'start';
  if (before.active === targetActive) throw new Error(`Diagnostics already ${action === 'start' ? 'active' : 'stopped'}`);
  process.kill(before.pid, 'SIGUSR2');
  for (let attempt = 0; attempt < 600; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const current = await readState();
    if (current.error) throw new Error(current.error);
    if (current.active === targetActive && (targetActive || current.profileWritten)) {
      console.log(JSON.stringify(current)); return;
    }
  }
  throw new Error('Diagnostic control timed out');
}

module.exports = { install };
if (require.main === module) control(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
else if (process.env.PERF_DIAGNOSTICS === '1' && ['server.js', 'standalone-server.cjs'].includes(path.basename(process.argv[1] || ''))) install();
