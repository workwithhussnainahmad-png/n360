/** Read-only protocol test against the configured PostgreSQL/PgBouncer endpoint. */
import assert from 'node:assert/strict';
import { Client, type QueryConfig } from 'pg';
import { createPreparedReadRegistry } from '../src/db/prepared-queries';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const prepare = createPreparedReadRegistry(true);
  // Exceed the deployment's 25+5 server pool so client connections must share
  // backend sessions. Read constants only; no application data is modified.
  const clients = Array.from({ length: 40 }, () => new Client({
    connectionString: process.env.DATABASE_URL, application_name: 'prepared_read_verification',
    connectionTimeoutMillis: 10000, query_timeout: 10000,
  }));
  const backends = clients.map(() => new Set<number>());
  try {
    await Promise.all(clients.map(client => client.connect()));
    for (let round = 0; round < 8; round++) {
      const order = clients.map((client, index) => ({ client, index }));
      if (round % 2) order.reverse();
      await Promise.all(order.map(async ({ client, index }) => {
        const marker = round * 1000 + index;
        const config = prepare([{
          text: 'select $1::int as marker, pg_backend_pid() as backend, pg_sleep(0.01)',
          values: [marker], rowMode: 'array',
        }])[0] as QueryConfig;
        const result = await client.query(config);
        assert.equal(result.rows[0][0], marker, 'Each call must execute with fresh bind values');
        backends[index].add(result.rows[0][1]);
      }));
    }
    const reassigned = backends.filter(pids => pids.size > 1).length;
    assert.ok(reassigned > 0, 'Test must observe actual backend reassignment through transaction pooling');
    console.log(JSON.stringify({ passed: true, clients: clients.length, queries: clients.length * 8,
      clientsWithMultipleBackends: reassigned, backendCount: new Set(backends.flatMap(pids => [...pids])).size,
      behavior: 'Named statements preserve fresh values and array rows across backend reassignment; no application writes.' }));
  } finally {
    await Promise.allSettled(clients.map(client => client.end()));
  }
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
