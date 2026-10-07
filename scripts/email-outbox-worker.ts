import { processEmailOutboxBatch } from "@/lib/email-outbox";
import { gracefulShutdown } from "@/lib/process-lifecycle";
import { processNextInstitutionRestore } from "@/lib/institution-restores";

const INTERVAL_MS = 10_000;
let stopping = false;
let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;

async function runOnce() {
  try { await processNextInstitutionRestore(); }
  catch { console.error('Institution restore service unavailable; check migration 0061 and DIRECT_URL.'); }
  try {
    const result = await processEmailOutboxBatch();
    if (result.claimed > 0) console.info("Email outbox processed", result);
  } catch (error) {
    console.error("Email outbox processing failed", error);
  }
}

async function schedule() {
  running = runOnce();
  await running;
  running = undefined;
  if (!stopping) timer = setTimeout(() => void schedule(), INTERVAL_MS);
}

async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  if (timer) clearTimeout(timer);
  if (running) await running.catch(() => undefined);
  await gracefulShutdown(signal);
  process.exit(0);
}

process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));

console.info("Local email worker started", { intervalMs: INTERVAL_MS });
void schedule();
