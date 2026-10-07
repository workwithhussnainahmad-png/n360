import { redis, clearInFlightCacheFetches } from '@/lib/redis';
import { pool } from '@/db';
import { shutdownArgon2Pool } from '@/lib/argon2-pool';
import { closeRestorePool } from '@/lib/institution-restores';

let registered = false;
let shuttingDown = false;

/**
 * Close DB pool, Valkey, and argon2 workers so container stop doesn't leave
 * open handles / unreaped worker threads holding RAM+CPU.
 */
export async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Graceful shutdown on ${signal}`);

  clearInFlightCacheFetches();
  await closeRestorePool().catch(() => console.warn('Restore pool shutdown interrupted.'));

  try {
    await shutdownArgon2Pool();
  } catch (err) {
    console.warn('argon2 shutdown error:', err);
  }

  try {
    if (typeof (redis as { quit?: () => Promise<string> }).quit === 'function' && redis.status !== 'end') {
      await redis.quit();
    }
  } catch (err) {
    console.warn('redis quit error:', err);
    try {
      redis.disconnect();
    } catch {
      // ignore
    }
  }

  try {
    await pool.end();
  } catch (err) {
    console.warn('pg pool end error:', err);
  }
}

/** Register once for the Next.js Node server (resources only — no forced exit). */
export function registerShutdownHandlers() {
  if (registered || process.env.NEXT_PHASE === 'phase-production-build') return;
  registered = true;

  const onSignal = (signal: string) => {
    void gracefulShutdown(signal);
  };

  process.once('SIGTERM', () => onSignal('SIGTERM'));
  process.once('SIGINT', () => onSignal('SIGINT'));
}
