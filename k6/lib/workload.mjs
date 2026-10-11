// Shared by k6 and the Node runner: the manifest describes the executed stages.
export function seconds(value) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(String(value));
  if (!match) throw new Error('Duration must use ms, s, m or h');
  return Number(match[1]) * ({ ms: 0.001, s: 1, m: 60, h: 3600 }[match[2]]);
}

export function workload(type, env = {}) {
  const keys = { load: 'TARGET_VUS', stress: 'MAX_VUS', spike: 'SPIKE_VUS' };
  if (!keys[type]) throw new Error('Unknown workload');
  const vus = Number(env[keys[type]] || ({ load: 50, stress: 300, spike: 150 }[type]));
  const thinkSeconds = Number(env.THINK_SEC ?? ({ load: 1.5, stress: 0.5, spike: 0.3 }[type]));
  const scale = Number(env.STAGE_SCALE ?? 1);
  if (!Number.isSafeInteger(vus) || vus < 1 || vus > 10000) throw new Error('VUs must be 1..10000');
  if (!Number.isFinite(thinkSeconds) || thinkSeconds < 0 || thinkSeconds > 60) throw new Error('Invalid think time');
  if (!Number.isFinite(scale) || scale <= 0 || scale > 10) throw new Error('Invalid stage scale');
  const hold = seconds(env.DURATION || '5m');
  if (hold <= 0 || hold > 3600) throw new Error('Hold must be positive and at most 1h');
  const raw = type === 'load'
    ? [[60, Math.ceil(vus / 5)], [120, vus], [hold, vus], [60, 0]]
    : type === 'spike'
      ? [[30, Math.min(20, vus)], [10, vus], [60, vus], [10, Math.min(20, vus)], [60, Math.min(20, vus)], [30, 0]]
      : [[60, Math.min(vus, 20)], ...[50, 100, 150, 200, 300].map(n => [120, Math.min(vus, n)]), [120, vus], [hold, vus], [120, 0]];
  let elapsed = 0;
  const peakIndex = type === 'stress' ? 7 : 2;
  const windows = raw.map(([duration], index) => {
    const startSeconds = elapsed;
    elapsed += Math.max(0.001, Math.round(duration * scale * 1000) / 1000);
    return { name: index < peakIndex ? 'ramp' : index === peakIndex ? 'peak' : 'recovery', startSeconds, endSeconds: elapsed };
  });
  return { type, vus, thinkSeconds, scale, totalSeconds: elapsed, windows,
    stages: raw.map(([, target], i) => ({ duration: `${Math.round((windows[i].endSeconds - windows[i].startSeconds) * 1000)}ms`, target })) };
}

export function windowAt(plan, elapsedSeconds) {
  return plan.windows.find(w => elapsedSeconds >= w.startSeconds && elapsedSeconds < w.endSeconds)?.name || 'drain';
}
