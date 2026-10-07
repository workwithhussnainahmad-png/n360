import { processNextInstitutionRestore } from '@/lib/institution-restores';
import { gracefulShutdown } from '@/lib/process-lifecycle';

let stopping = false;
let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;
async function tick() {
  running = (async () => {
    try { await processNextInstitutionRestore(); }
    catch { console.error('Institution restore service unavailable; check migration 0061 and DIRECT_URL.'); }
  })();
  await running;
  running = undefined;
  if (!stopping) timer = setTimeout(() => void tick(), 10_000);
}
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  if (timer) clearTimeout(timer);
  if (running) await running;
  await gracefulShutdown(signal);
  process.exit(0);
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
console.info('Institution restore worker started');
void tick();
