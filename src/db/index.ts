import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { cacheRefreshContext } from '@/lib/cache-refresh-context';
import { createPreparedReadRegistry } from './prepared-queries';

const configuredPoolMax = Number.parseInt(process.env.DB_POOL_MAX ?? "15", 10);
const poolMax = Number.isFinite(configuredPoolMax) && configuredPoolMax > 0 ? configuredPoolMax : 15;

// Patch console.error to prevent dumping huge PG error objects with undefined fields
const originalError = console.error;
console.error = (...args: unknown[]) => {
  const newArgs = args.map(arg => {
    if (arg instanceof Error && (('query' in arg && 'params' in arg) || ('schema' in arg && 'table' in arg))) {
      // Drizzle's message/stack includes the entire SQL and parameters. During
      // pool exhaustion, serializing thousands of these worsens the backlog.
      const cause = arg.cause instanceof Error ? arg.cause : arg;
      return {
        message: cause.message,
        code: 'code' in cause ? cause.code : undefined,
        name: arg.name,
      };
    }
    return arg;
  });
  originalError(...newArgs);
};

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL!,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // PgBouncer rejects statement_timeout as a PostgreSQL startup parameter.
  // Keep the client-side query timeout below instead so pooled connections work.
  query_timeout: 5000,
  keepAlive: true,
  application_name: 'nisaab360_api'
});

// Background refresh has a bounded budget of its own. A refresh burst cannot
// consume the connections needed for fresh profiles, membership and mutations.
export const cacheRefreshPool = new Pool({
  ...pool.options,
  max: 4,
  application_name: 'nisaab360_cache_refresh',
});
cacheRefreshPool.on('error', (err) => {
  console.error('PostgreSQL cache refresh pool error:', err.message);
});
const foregroundQuery = pool.query;
const prepareRead = createPreparedReadRegistry(process.env.DB_PREPARED_STATEMENTS === '1');
pool.query = ((...args: unknown[]) => {
  const target = cacheRefreshContext.getStore() ? cacheRefreshPool : pool;
  const query = target === pool ? foregroundQuery : cacheRefreshPool.query;
  return Reflect.apply(query, target, prepareRead(args));
}) as typeof pool.query;

// Readiness must not queue behind hundreds of ordinary requests and convince
// the proxy that a responsive process has died. One separate probe connection
// still checks the same database through PgBouncer, with bounded timeouts.
export const readinessPool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  query_timeout: 2000,
  keepAlive: true,
  application_name: 'nisaab360_readiness',
});
readinessPool.on('error', (err) => {
  console.error('PostgreSQL readiness pool error:', err.message);
});

// Idle client errors must be handled or they can crash the process / leave bad sockets.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

export { pool };
export const db = drizzle(pool, { schema });

if (process.env.PERFORMANCE_OBSERVER === '1') {
  (globalThis as any)[Symbol.for('nisaab360.performance-pools')] = {
    foreground: pool, refresh: cacheRefreshPool, readiness: readinessPool,
  };
}
