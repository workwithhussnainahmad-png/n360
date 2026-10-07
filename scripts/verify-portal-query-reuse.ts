/** Real SQL on isolated fixtures; no HTTP, production writes or token issuance. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';

async function main() {
  process.env.NEXT_PHASE = 'phase-production-build';
  const { tokens } = JSON.parse(readFileSync('k6/tokens.json', 'utf8')) as {
    tokens: Array<{ roleHint: string; userId: number; institutionId: number; accessToken: string }>;
  };
  const accounts = ['STAFF', 'STUDENT'].map(role => tokens.find(row => row.roleHint === role)!);
  const { db, pool, readinessPool } = await import('../src/db');
  const schema = await import('../src/db/schema');
  const { redis } = await import('../src/lib/redis');
  const { GET: staffProfile } = await import('../src/app/api/staff/profile/route');
  const { GET: studentProfile } = await import('../src/app/api/student/profile/route');
  const { GET: studentTimetable } = await import('../src/app/api/student/timetable/route');
  const memory = await PGlite.create();
  const originalQuery = pool.query, originalSelect = db.select;
  const store = new Map<string, string>();
  let queries = 0;
  try {
    for (const table of [schema.staff, schema.students, schema.classes, schema.sections, schema.campuses]) {
      const config = getTableConfig(table);
      const columns = config.columns.map(column => `"${column.name}" ${column.columnType === 'PgEnumColumn' ? 'text' : column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`);
      await memory.exec(`create table "${config.name}" (${columns.join(',')})`);
    }
    for (const account of accounts) {
      const table = account.roleHint === 'STAFF' ? 'staff' : 'students';
      await memory.query(`insert into ${table} (id,institution_id,name,phone) values ($1,$2,'Fixture','original')`, [account.userId, account.institutionId]);
      store.set(`auth:user-validity:${account.roleHint}:${account.userId}`, '1');
    }
    const student = accounts[1];
    await memory.query('update students set section_id=5 where id=$1', [student.userId]);
    for (const section of [5, 6]) store.set(`cache:timetable:student:${student.institutionId}:${section}`, JSON.stringify([{ subjectName: `Section ${section}` }]));
    Object.assign(redis, { status: 'ready', get: async (key: string) => store.get(key) ?? null });
    Object.assign(pool, { query: async (config: { name: string; text: string; rowMode?: string }, values: unknown[]) => {
      queries++;
      assert.equal(config.name, '', 'The builder leaves protocol naming to the pool driver');
      const result = await memory.query(config.text, values);
      return { ...result, rows: config.rowMode === 'array'
        ? result.rows.map(row => result.fields.map(field => (row as Record<string, unknown>)[field.name])) : result.rows };
    } });
    async function call(account: typeof accounts[number], page: 'profile' | 'timetable') {
      const route = page === 'timetable' ? studentTimetable : account.roleHint === 'STAFF' ? staffProfile : studentProfile;
      return route(new NextRequest(`http://localhost/api/${account.roleHint.toLowerCase()}/${page}`, {
        headers: { authorization: `Bearer ${account.accessToken}` },
      }), {});
    }
    for (const account of accounts) {
      const response = await call(account, 'profile');
      assert.equal(response.status, 200);
      assert.equal((await response.json()).profile.phone, 'original');
    }
    assert.deepEqual((await (await call(student, 'timetable')).json()).timetable, [{ subjectName: 'Section 5' }]);
    // Subsequent calls must not reconstruct any query, but must observe changes.
    Object.assign(db, { select: () => { throw new Error('SQL was recompiled'); } });
    for (const account of accounts) {
      const table = account.roleHint === 'STAFF' ? 'staff' : 'students';
      await memory.query(`update ${table} set phone='changed' where id=$1`, [account.userId]);
      const response = await call(account, 'profile');
      assert.equal(response.status, 200);
      assert.equal((await response.json()).profile.phone, 'changed', 'Profile data must remain fresh');
    }
    await memory.query('update students set section_id=6 where id=$1', [student.userId]);
    assert.deepEqual((await (await call(student, 'timetable')).json()).timetable, [{ subjectName: 'Section 6' }], 'Fresh membership must choose the new section cache');
    for (const account of accounts) {
      const table = account.roleHint === 'STAFF' ? 'staff' : 'students';
      await memory.query(`update ${table} set institution_id=$1 where id=$2`, [account.institutionId + 1, account.userId]);
      assert.equal((await call(account, 'profile')).status, 404, 'Prepared query must retain tenant isolation');
    }
    assert.equal((await call(student, 'timetable')).status, 404, 'Cached timetable cannot bypass current tenant membership');
    assert.equal(queries, 9, 'Each profile/membership call still queries the database');
    console.log('Portal SQL checks passed: compile once, fresh profile changes, immediate section move and tenant isolation using real isolated SQL. Protocol naming is covered by the prepared-read driver checks. No HTTP, k6, production writes or tokens generated.');
  } finally {
    pool.query = originalQuery; db.select = originalSelect;
    await Promise.all([memory.close(), pool.end(), readinessPool.end()]);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
