import { createHash } from 'node:crypto';
import type { QueryConfig } from 'pg';

const MAX_STATEMENTS = 128;
const MAX_SQL_LENGTH = 32_768;

/**
 * Reuse PostgreSQL parse/plan work for recurring parameterized reads.
 *
 * Opt in only with direct PostgreSQL or PgBouncer >=1.21 configured with
 * max_prepared_statements >0. Query values/results are never cached. Keep a
 * fixed admission bound rather than evicting names: node-postgres retains each
 * prepared name for the lifetime of a client, so an LRU would not bound memory.
 */
export function createPreparedReadRegistry(enabled: boolean) {
  const names = new Map<string, string>();
  return function prepareRead(args: unknown[]): unknown[] {
    if (!enabled) return args;
    const input = args[0];
    // Query streams/custom Submittable objects own their protocol lifecycle.
    const config = typeof input === 'string' ? { text: input } : input;
    if (!config || typeof config !== 'object' || 'submit' in config) return args;
    const query = config as QueryConfig;
    const values = Array.isArray(args[1]) ? args[1] : query.values;
    if (query.name || !Array.isArray(values) || !values.length || typeof query.text !== 'string') return args;
    if (query.text.length > MAX_SQL_LENGTH || !/^\s*select\b/i.test(query.text) || query.text.includes(';')) return args;
    let name = names.get(query.text);
    if (!name) {
      if (names.size >= MAX_STATEMENTS) return args;
      // Same SQL gets the same bounded-length name across replicas and pools.
      name = `lms_read_${createHash('sha256').update(query.text).digest('hex').slice(0, 48)}`;
      names.set(query.text, name);
    }
    // Preserve custom parsers, rowMode, callbacks and bind values. Never mutate
    // Drizzle's shared config or retain per-request parameters in the registry.
    return [{ ...query, name }, ...args.slice(1)];
  };
}
