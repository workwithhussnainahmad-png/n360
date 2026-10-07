/**
 * Next.js instrumentation — runs once when the Node server starts.
 * Registers graceful shutdown so pg/redis/argon2 workers don't linger.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateProductionEnvironment } = await import('./lib/production-env');
    validateProductionEnvironment();
    const { registerShutdownHandlers } = await import('./lib/process-lifecycle');
    registerShutdownHandlers();
  }
}
