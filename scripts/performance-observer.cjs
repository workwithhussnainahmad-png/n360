'use strict';
// Opt-in low-frequency counters, without V8 CPU profiling or per-request logs.
if (process.env.PERFORMANCE_OBSERVER === '1') {
  const fs = require('node:fs');
  const path = require('node:path');
  const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
  // Compiled route bundles can initialize distinct db modules. Capture the
  // actual pg-pool instances at acquisition instead of one overwritten export.
  const observedPools = new Set();
  const Pool = require('pg-pool');
  const connect = Pool.prototype.connect;
  Pool.prototype.connect = function (...args) {
    observedPools.add(this);
    return connect.apply(this, args);
  };
  function poolSnapshot() {
    const snapshot = {};
    for (const pool of observedPools) {
      const label = pool.options.application_name === 'nisaab360_cache_refresh' ? 'refresh'
        : pool.options.application_name === 'nisaab360_readiness' ? 'readiness' : 'foreground';
      const count = snapshot[label] ??= { total:0, idle:0, waiting:0, instances:0, configuredMax:0 };
      count.total += pool.totalCount; count.idle += pool.idleCount;
      count.waiting += pool.waitingCount; count.instances++;
      count.configuredMax += pool.options.max;
    }
    return snapshot;
  }
  const directory = process.env.PERFORMANCE_OBSERVER_DIR || '/performance-observer';
  fs.mkdirSync(directory, { recursive: true });
  const output = fs.createWriteStream(path.join(directory, `${process.env.HOSTNAME || 'app'}-${process.pid}.jsonl`), { flags: 'a' });
  output.on('error', (error) => console.error('Performance observer output error:', error.message));
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  let previousElu = performance.eventLoopUtilization();
  let previousCpu = process.cpuUsage();
  let previousTime = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const currentElu = performance.eventLoopUtilization();
    const elapsed = now - previousTime;
    const cpu = process.cpuUsage();
    const cache = globalThis[Symbol.for('nisaab360.performance-cache')];
    const memory = process.memoryUsage();
    const row = {
      time: new Date().toISOString(), pid: process.pid, intervalMs: elapsed,
      elu: performance.eventLoopUtilization(currentElu, previousElu).utilization,
      cpuPercent: ((cpu.user - previousCpu.user + cpu.system - previousCpu.system) / (elapsed * 1000)) * 100,
      lagMs: { p50: lag.percentile(50) / 1e6, p95: lag.percentile(95) / 1e6, p99: lag.percentile(99) / 1e6, max: lag.max / 1e6 },
      memory,
      pools: poolSnapshot(),
      cache: cache ? Object.fromEntries(cache) : null,
    };
    // If the sink is backed up, skip this sample rather than accumulate buffers.
    if (output.writableLength < 1024 * 1024 && !output.destroyed) output.write(JSON.stringify(row) + '\n');
    previousTime = now; previousElu = currentElu; previousCpu = cpu; lag.reset();
  }, 1000);
  timer.unref();
}
