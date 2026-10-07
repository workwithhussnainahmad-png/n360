/** Diagnosis-only: bounded SELECTs; Redis disabled in this separate process. */
import fs from 'node:fs';
import { Client } from 'pg';
async function main() {
  process.env.NEXT_PHASE = 'phase-production-build';
  const { pool, cacheRefreshPool, readinessPool } = await import('../../src/db');
  const { NextRequest } = await import('next/server');
  const location = new URL(process.env.DIRECT_URL!);
  if (!['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('Diagnosis restricted to local database');
  const client = new Client({ connectionString: process.env.DIRECT_URL, application_name: 'diagnosis_readonly', statement_timeout: 5000 });
  await client.connect();
  await client.query('SET default_transaction_read_only = on');
  const queries: any[] = []; let label = '';
  const original = pool.query;
  pool.query = (async (config: any, values: any) => {
    const text = typeof config === 'string' ? config : config.text;
    const params = typeof config === 'string' ? values : (config.values ?? values);
    if (!/^select\s/i.test(text)) throw new Error('Only SELECT allowed');
    const started = performance.now();
    const result = await client.query(typeof config === 'string' ? { text, values: params } : { ...config, values: params });
    queries.push({ label, sql: text, params, elapsedMs: performance.now() - started, rowCount: result.rowCount });
    return result;
  }) as any;
  const tokens = JSON.parse(fs.readFileSync('k6/tokens.json','utf8').replace(/^\uFEFF/, '')).tokens;
  const responses: any[] = [];
  try {
    for (const role of ['STUDENT','STAFF']) {
      const token = tokens.find((t: any) => t.roleHint === role).accessToken;
      for (const endpoint of ['dashboard','timetable','profile']) {
        label = `${role.toLowerCase()}/${endpoint}`;
        const route = role === 'STUDENT'
          ? endpoint === 'dashboard' ? await import('../../src/app/api/student/dashboard/route') : endpoint === 'timetable' ? await import('../../src/app/api/student/timetable/route') : await import('../../src/app/api/student/profile/route')
          : endpoint === 'dashboard' ? await import('../../src/app/api/staff/dashboard/route') : endpoint === 'timetable' ? await import('../../src/app/api/staff/timetable/route') : await import('../../src/app/api/staff/profile/route');
        const before = queries.length;
        const response = await route.GET(new NextRequest(`http://localhost:3000/api/${label}`, { headers: {authorization: `Bearer ${token}`} }), {});
        const body = await response.text();
        responses.push({ label, status: response.status, uncompressedBytes: Buffer.byteLength(body), queryCount: queries.length - before });
      }
    }
    // Empty demo notices skip read-status SQL; compile its conditional branch explicitly.
    const { db } = await import('../../src/db');
    const s = await import('../../src/db/schema');
    const { and,eq,inArray } = await import('drizzle-orm');
    const readQuery = db.select().from(s.announcementReads).where(and(eq(s.announcementReads.userRole,'STAFF'),eq(s.announcementReads.userId,1),inArray(s.announcementReads.announcementId,[1,2,3]))).toSQL();
    const plans: any[] = [];
    const seen = new Set<string>();
    for (const q of queries) {
      if (seen.has(q.sql)) continue; seen.add(q.sql);
      const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`, q.params);
      plans.push({ label:q.label, sql:q.sql, params:q.params, plan:result.rows[0]['QUERY PLAN'] });
    }
    fs.writeFileSync('docs/performance-diagnostic-evidence/queries-and-plans.json', JSON.stringify({capturedAt:new Date().toISOString(), method:'Source handlers, Redis disabled, separate read-only direct PostgreSQL client. Not a production cache-hit query count or load trace.', responses, queries, conditionalAnnouncementReads:readQuery, plans},null,2));
    console.log(JSON.stringify({responses, queries:queries.length, plans:plans.length}));
  } finally {pool.query=original; await Promise.all([client.end(),pool.end(),cacheRefreshPool.end(),readinessPool.end()]);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
