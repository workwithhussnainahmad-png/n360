import { checkExpoPushReceipts, pruneResolvedPushTickets } from "@/lib/notifications";
import { pruneExpiredRefreshTokens } from "@/lib/token-maintenance";
import { gracefulShutdown } from "@/lib/process-lifecycle";
import { enqueueScheduledInstitutionBackups, processNextInstitutionBackup } from "@/lib/institution-backups";
import { processEmailOutboxBatch } from "@/lib/email-outbox";

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 10_000;
const intervalFromEnvironment = Number.parseInt(process.env.PUSH_RECEIPT_INTERVAL_MS ?? "", 10);
const intervalMs = Number.isFinite(intervalFromEnvironment) && intervalFromEnvironment >= MIN_INTERVAL_MS
  ? intervalFromEnvironment
  : DEFAULT_INTERVAL_MS;

let stopping = false;
let timer: NodeJS.Timeout | undefined;
let runInFlight: Promise<void> | undefined;
let lastTokenPruneHour: number | undefined;
let lastTicketPruneHour: number | undefined;
let lastInstitutionBackupScheduleHour: number | undefined;

/**
 * Run a maintenance task at most once per wall-clock hour.
 *
 * Each task carries its own guard so one failing task neither blocks the others nor
 * makes them re-run every interval: on failure the hour is left unset, so only that
 * task retries on the next tick.
 */
async function runHourly(
  name: string,
  lastHour: number | undefined,
  currentHour: number,
  task: () => Promise<{ deleted: number } | undefined>,
): Promise<number | undefined> {
  if (lastHour === currentHour) return lastHour;
  try {
    const result = await task();
    if (result && result.deleted > 0) console.info(`${name} completed`, result);
    return currentHour;
  } catch (error) {
    console.error(`${name} failed`, error);
    return lastHour;
  }
}

async function runOnce() {
  const currentHour = Math.floor(Date.now() / 3_600_000);
  try {
    const result = await processEmailOutboxBatch();
    if (result.claimed > 0) console.info("Email outbox processed", result);
  } catch (error) {
    console.error("Email outbox processing failed", error);
  }
  if (lastInstitutionBackupScheduleHour !== currentHour) {
    try {
      await enqueueScheduledInstitutionBackups();
      lastInstitutionBackupScheduleHour = currentHour;
    } catch (error) {
      console.error('Institution backup scheduling failed', error);
    }
  }

  try {
    const completed: number[] = [];
    // Sequential processing keeps database pressure bounded while allowing a
    // larger tenant fleet to finish its daily queue promptly.
    for (let index = 0; index < 5; index += 1) {
      const result = await processNextInstitutionBackup();
      if (result.processed === 0) break;
      if (result.backupId) completed.push(result.backupId);
    }
    if (completed.length > 0) console.info('Institution backups completed', { backupIds: completed });
  } catch (error) {
    console.error('Institution backup processing failed', error);
  }

  try {
    const result = await checkExpoPushReceipts();
    console.info("Push receipt worker completed", result);
  } catch (error) {
    console.error("Push receipt worker failed", error);
  }

  lastTokenPruneHour = await runHourly(
    "Refresh token prune",
    lastTokenPruneHour,
    currentHour,
    pruneExpiredRefreshTokens,
  );

  lastTicketPruneHour = await runHourly(
    "Push ticket prune",
    lastTicketPruneHour,
    currentHour,
    pruneResolvedPushTickets,
  );

}

async function scheduleNextRun() {
  runInFlight = runOnce();
  await runInFlight;
  runInFlight = undefined;
  if (!stopping) {
    timer = setTimeout(() => {
      void scheduleNextRun();
    }, intervalMs);
  }
}

async function stop(signal: string) {
  if (stopping) return;
  console.info(`Push receipt worker received ${signal}; stopping after the current run.`);
  stopping = true;
  if (timer) clearTimeout(timer);
  if (runInFlight) {
    try {
      await runInFlight;
    } catch {
      // already logged in runOnce
    }
  }
  await gracefulShutdown(signal);
  process.exit(0);
}

process.on("SIGTERM", () => { void stop("SIGTERM"); });
process.on("SIGINT", () => { void stop("SIGINT"); });

console.info("Push receipt worker started", { intervalMs });
void scheduleNextRun();
