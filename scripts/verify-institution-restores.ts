import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig, PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import type { PoolClient } from 'pg';
import * as schema from '../src/db/schema';
import zipEncrypted from 'archiver-zip-encrypted';
import { NextRequest } from 'next/server';
import { RESTORE_TABLES, parseRestoreJsonl, readRestoreZip, type RestorePayload } from '../src/lib/institution-restore-format';
import { stageRestore, applyStagedRestore, captureRestoreRecovery, lockRestoreTables } from '../src/lib/institution-restore-engine';

let memory: PGlite;
let client: PoolClient;
let service: typeof import('../src/lib/institution-restores');
let payload: RestorePayload;
let injectedFailure = false;
const owner = { id: 1, role: 'INSTITUTION' as const, ip: 'test' };
const institutionAdmin = { id: 7, role: 'INSTITUTION_ADMIN' as const, ip: 'test' };
const admin = { id: 1, role: 'SUPER_ADMIN' as const, ip: 'test' };
const employee = { id: 1, role: 'EMPLOYEE' as const, ip: 'test' };
const encryptedPassword = 'restore-fixture-password-123';
const require = createRequire(import.meta.url);
const archiver = require('archiver-zip-encrypted/node_modules/archiver');
archiver.registerFormat('restore-fixture', zipEncrypted);

function jsonl(value = payload) {
  const lines: unknown[] = [{ type: 'header', format: 'nisaab360-institution-export', version: 2, institution: value.institution, generatedAt: value.generatedAt, sensitiveFieldsIncluded: false }];
  for (const table of RESTORE_TABLES) for (const data of value.tables[table]) lines.push({ type: 'row', table, data });
  lines.push({ type: 'manifest', tableCounts: Object.fromEntries(RESTORE_TABLES.map(table => [table, value.tables[table].length])), tableCount: RESTORE_TABLES.length, recordCount: RESTORE_TABLES.reduce((sum, table) => sum + value.tables[table].length, 0) });
  return lines.map(line => JSON.stringify(line)).join('\n') + '\n';
}
async function zip(text: string, names = ['data.jsonl','README.txt','backup-info.json']) {
  const archive = archiver('restore-fixture', { encryptionMethod: 'aes256', password: encryptedPassword, zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  for (const name of names) archive.append(name === 'data.jsonl' ? text : '{}', { name });
  await archive.finalize();
  return Buffer.concat(chunks);
}
before(async () => {
  process.env.NEXT_PHASE = 'phase-production-build';
  process.env.JWT_SECRET = 'isolated-restore-tests-encryption-secret-32';
  process.env.DIRECT_URL = 'postgres://unused:unused@localhost:5432/unused';
  memory = await PGlite.create();
  const dialect = new PgDialect();
  await memory.exec(`CREATE TABLE institutions(id serial PRIMARY KEY, username text NOT NULL, name text NOT NULL, admin_password_hash text);
    CREATE TABLE super_admins(id serial PRIMARY KEY);
    CREATE TABLE employees(id serial PRIMARY KEY);
    INSERT INTO employees VALUES(1);
    CREATE TABLE institution_backups(id serial PRIMARY KEY,requested_by integer REFERENCES super_admins(id));
    CREATE TABLE central_backup_settings(id serial PRIMARY KEY,updated_by integer REFERENCES super_admins(id));
    INSERT INTO institutions VALUES (1,'school_one','School One','keep-secret'),(2,'school_two','School Two','other-secret');
    INSERT INTO super_admins VALUES(1);
    CREATE TABLE students(id serial PRIMARY KEY,institution_id integer REFERENCES institutions(id), password_hash text);
    CREATE TABLE staff(id serial PRIMARY KEY,institution_id integer REFERENCES institutions(id),password_hash text);
    CREATE TABLE classes(id serial PRIMARY KEY,institution_id integer REFERENCES institutions(id));
    CREATE TABLE sections(id serial PRIMARY KEY,institution_id integer REFERENCES institutions(id));
    CREATE TABLE subjects(id serial PRIMARY KEY,institution_id integer REFERENCES institutions(id));
    INSERT INTO students VALUES(1,1,'student-secret'),(2,2,'other-student-secret');
    INSERT INTO staff VALUES(1,1,'staff-secret'),(2,2,'other-staff-secret');
    INSERT INTO classes VALUES(1,1),(2,2); INSERT INTO sections VALUES(1,1),(2,2); INSERT INTO subjects VALUES(1,1),(2,2);
    CREATE TABLE audit_logs(id serial PRIMARY KEY,institution_id integer,actor_id integer,actor_role text,action text,target text,ip text,timestamp timestamp NOT NULL DEFAULT now());
    CREATE TABLE notifications(id serial PRIMARY KEY,institution_id integer,user_role text,user_id integer,type text,title text,message text);
    CREATE TABLE fee_payments(id serial PRIMARY KEY,institution_id integer,amount integer); INSERT INTO fee_payments VALUES(1,1,1500);`);
  for (const name of RESTORE_TABLES) {
    const table = Object.values(schema).find(value => {
      try { return getTableConfig(value as PgTable).name === name; } catch { return false; }
    }) as PgTable;
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      const enumColumn = column as typeof column & { enumValues?: string[] };
      const type = column.columnType === 'PgEnumColumn' ? 'text' : column.getSQLType();
      const defaultValue = column.default === undefined ? '' : ' DEFAULT ' +
        (typeof column.default === 'object' ? dialect.sqlToQuery(column.default as Parameters<typeof dialect.sqlToQuery>[0]).sql : typeof column.default === 'string' ? `'${column.default}'` : String(column.default));
      const enumCheck = column.columnType === 'PgEnumColumn' ? ` CHECK("${column.name}" IN (${enumColumn.enumValues!.map(value => `'${value}'`).join(',')}))` : '';
      return `"${column.name}" ${type}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}${column.isUnique ? ' UNIQUE' : ''}${defaultValue}${enumCheck}`;
    });
    for (const fk of config.foreignKeys) {
      const reference = fk.reference();
      columns.push(`FOREIGN KEY(${reference.columns.map(column => `"${column.name}"`).join(',')}) REFERENCES "${getTableConfig(reference.foreignTable).name}"(${reference.foreignColumns.map(column => `"${column.name}"`).join(',')}) ON DELETE ${fk.onDelete}`);
    }
    for (const unique of config.uniqueConstraints) columns.push(`UNIQUE(${unique.columns.map(column => `"${column.name}"`).join(',')})`);
    await memory.exec(`CREATE TABLE "${name}" (${columns.join(',')})`);
  }
  await memory.exec(await readFile(new URL('../drizzle/0061_institution_restore_requests.sql', import.meta.url), 'utf8'));
  const permissionsMigration = await readFile(new URL('../drizzle/0062_employee_backup_permissions.sql', import.meta.url), 'utf8');
  await memory.exec(permissionsMigration);
  await memory.exec(permissionsMigration); // Cached local migrators can replay this migration.
  await memory.exec(`INSERT INTO assignments(id,institution_id,staff_id,class_id,section_id,title,due_at) VALUES(1,1,1,1,1,'Old assignment','2026-10-01'),(2,2,2,2,2,'Other assignment','2026-10-01');
    INSERT INTO submissions(id,institution_id,assignment_id,student_id,file_key) VALUES(1,1,1,1,'original-key'),(2,2,2,2,'other-key');
    INSERT INTO tests(id,institution_id,class_id,subject_id,created_by_role,type,title,max_marks,date) VALUES(1,1,1,1,'INSTITUTION','MONTHLY','Original test',100,'2026-10-01');
    INSERT INTO marks(id,institution_id,test_id,student_id,marks_obtained,total_marks) VALUES(1,1,1,1,80,100);`);
  client = {
    query: async (text: string, values: unknown[] = []) => {
      if (text.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
      if (text.includes('pg_advisory')) return { rows: [] }; // PGlite is single-session; production uses PostgreSQL locks.
      if (text.startsWith('SET LOCAL')) return { rows: [] };
      if (injectedFailure && text.startsWith('INSERT INTO public."marks"')) throw new Error('Injected mid-import failure');
      return memory.query(text, values);
    }, release() {},
  } as unknown as PoolClient;
  payload = {
    institution: { id: 1, username: 'school_one', name: 'School One' }, generatedAt: '2026-10-01T00:00:00.000Z',
    tables: Object.fromEntries(await Promise.all(RESTORE_TABLES.map(async table => [table, table === 'assignments' ? (await memory.query('SELECT * FROM assignments WHERE institution_id=1')).rows : table === 'submissions' ? (await memory.query('SELECT * FROM submissions WHERE institution_id=1')).rows : table === 'tests' ? (await memory.query('SELECT * FROM tests')).rows : table === 'marks' ? (await memory.query('SELECT * FROM marks')).rows : []]))) as RestorePayload['tables'], preserved: {},
  };
  payload.tables.assignments[0].title = 'Restored assignment';
  payload.tables.marks[0].marks_obtained = 90;
  service = await import('../src/lib/institution-restores');
  const pool = service.getRestorePool();
  pool.connect = (async () => client) as typeof pool.connect;
  pool.query = client.query.bind(client) as typeof pool.query;
  const { redis } = await import('../src/lib/redis');
  Object.assign(redis, { status: 'ready', scan: async () => ['0', []], unlink: async () => 0 });
});
after(async () => { await service?.getRestorePool().end(); await memory?.close(); });

test('version 2 format accepts the tenant and rejects missing, duplicated and foreign records', () => {
  assert.equal(parseRestoreJsonl(jsonl(), 1).tables.assignments[0].title, 'Restored assignment');
  assert.throws(() => parseRestoreJsonl(jsonl(), 2), /belonging/);
  assert.throws(() => parseRestoreJsonl(jsonl().split('\n').slice(0,-2).join('\n'), 1), /manifest/);
  const bad = structuredClone(payload); bad.tables.assignments[0].institution_id = 2;
  assert.throws(() => parseRestoreJsonl(jsonl(bad), 1), /another institution/);
  const duplicate = structuredClone(payload); duplicate.tables.assignments.push(duplicate.tables.assignments[0]);
  assert.throws(() => parseRestoreJsonl(jsonl(duplicate), 1), /duplicate/);
});
test('actual archiver AES ZIP is readable; wrong passwords, unsafe names and damaged bytes fail', async () => {
  const bytes = await zip(jsonl());
  assert.equal((await readRestoreZip(bytes, encryptedPassword, 1)).tables.marks[0].marks_obtained, 90);
  await assert.rejects(readRestoreZip(bytes, 'wrong-password', 1), /verify ZIP/);
  await assert.rejects(readRestoreZip(await zip(jsonl(), ['data.jsonl','folder/README.txt','backup-info.json']), encryptedPassword, 1), /original/);
  const damaged = Buffer.from(bytes); damaged[100] ^= 1;
  await assert.rejects(readRestoreZip(damaged, encryptedPassword, 1));
  await assert.rejects(readRestoreZip(new Uint8Array(16 * 1024 * 1024 + 1), encryptedPassword, 1), /16 MB/);
});
test('staging uses actual constraints and rejects missing identities and identifier collisions', async () => {
  await memory.exec("INSERT INTO submissions(id,institution_id,assignment_id,student_id,file_key) VALUES(3,2,1,2,'inconsistent-link')");
  await client.query('BEGIN');
  await assert.rejects(stageRestore(client, payload), /inconsistent institution relationships/);
  await client.query('ROLLBACK');
  assert.equal((await memory.query('SELECT id FROM submissions WHERE id=3')).rows.length, 1, 'foreign child must not be deleted through a tenant cascade');
  await memory.exec('DELETE FROM submissions WHERE id=3');
  for (const mutation of [
    (p: RestorePayload) => { p.tables.assignments[0].staff_id = 2; },
    (p: RestorePayload) => { p.tables.assignments[0].id = 2; },
    (p: RestorePayload) => { p.tables.submissions[0].assignment_id = 999; },
    (p: RestorePayload) => { p.tables.assignments[0].extra_column = 'unsupported'; },
    (p: RestorePayload) => { p.tables.tests[0].type = 'INVALID'; },
  ]) {
    const bad = structuredClone(payload); mutation(bad);
    await client.query('BEGIN');
    await assert.rejects(stageRestore(client, bad));
    await client.query('ROLLBACK');
  }
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'Old assignment');
});
test('preview is isolated; replacement preserves other tenants, login secrets and payments; transaction rollback works', async () => {
  await client.query('BEGIN'); await lockRestoreTables(client);
  const preview = await stageRestore(client, payload);
  assert.equal(preview.tables.find(t => t.table === 'assignments')?.current, 1);
  const recovery = await captureRestoreRecovery(client, payload);
  assert.equal(recovery.tables.assignments[0].title, 'Old assignment');
  await applyStagedRestore(client, payload);
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'Restored assignment');
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=2')).rows[0].title, 'Other assignment');
  assert.equal((await memory.query<{ password_hash: string }>('SELECT password_hash FROM students WHERE id=1')).rows[0].password_hash, 'student-secret');
  assert.equal((await memory.query<{ amount: number }>('SELECT amount FROM fee_payments WHERE id=1')).rows[0].amount, 1500);
  await client.query('ROLLBACK');
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'Old assignment');
});
test('owner approval, admin execution, stale previews, recovery and failed import run through the persisted workflow', async () => {
  const id = await service.submitInstitutionRestore(payload, 'a'.repeat(64), owner);
  await assert.rejects(service.submitInstitutionRestore(payload, 'a'.repeat(64), owner), /active restore/);
  await service.processNextInstitutionRestore();
  let job = (await service.listInstitutionRestores(1))[0];
  assert.equal(job.status, 'AWAITING_APPROVAL');
  assert.equal('payload_encrypted' in job, false);
  await assert.rejects(service.actOnInstitutionRestore(id, undefined, 'execute', job.preview_hash, admin), /owner approval/);
  await assert.rejects(service.actOnInstitutionRestore(id, 2, 'approve', job.preview_hash, owner), /Tenant scope/);
  await assert.rejects(service.actOnInstitutionRestore(id, 2, 'approve', job.preview_hash, institutionAdmin), /primary account/);
  await assert.rejects(service.actOnInstitutionRestore(id, undefined, 'approve', job.preview_hash, institutionAdmin), /primary account/);
  await assert.rejects(service.actOnInstitutionRestore(id, 1, 'execute', job.preview_hash, institutionAdmin), /primary account/);
  await assert.rejects(service.actOnInstitutionRestore(id, undefined, 'approve', job.preview_hash, admin), /primary account/);
  await assert.rejects(service.actOnInstitutionRestore(id, undefined, 'approve', job.preview_hash, employee), /primary account/);
  await assert.rejects(service.actOnInstitutionRestore(id, undefined, 'execute', job.preview_hash, employee), /primary account/);
  await service.actOnInstitutionRestore(id, 1, 'approve', job.preview_hash, owner);
  await service.actOnInstitutionRestore(id, undefined, 'execute', job.preview_hash, admin);
  await memory.exec("UPDATE assignments SET title='Newer data' WHERE id=1");
  await service.processNextInstitutionRestore();
  job = (await service.listInstitutionRestores(1))[0];
  assert.equal(job.status, 'AWAITING_APPROVAL');
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'Newer data');
  await assert.rejects(service.actOnInstitutionRestore(id, 1, 'approve', job.preview_hash, institutionAdmin), /primary account/);
  await service.actOnInstitutionRestore(id, 1, 'approve', job.preview_hash, owner);
  assert.deepEqual((await memory.query('SELECT actor_id,actor_role FROM audit_logs WHERE action=$1 ORDER BY id DESC LIMIT 1',["INSTITUTION_RESTORE_APPROVE"])).rows[0], {actor_id:1,actor_role:'INSTITUTION'});
  await assert.rejects(service.actOnInstitutionRestore(id, undefined, 'execute', job.preview_hash, employee), /primary account/);
  await service.actOnInstitutionRestore(id, undefined, 'execute', job.preview_hash, admin);
  const executor = (await memory.query('SELECT execution_requested_by,execution_requested_by_employee,execution_requested_role FROM institution_restore_requests WHERE id=$1',[id])).rows[0];
  assert.deepEqual(executor, { execution_requested_by: 1, execution_requested_by_employee: null, execution_requested_role: 'SUPER_ADMIN' });
  await service.processNextInstitutionRestore();
  job = (await service.listInstitutionRestores(1))[0];
  assert.equal(job.status, 'COMPLETED'); assert.equal(job.recovery_available, true);
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'Restored assignment');
  const committedActor = (await memory.query('SELECT actor_id,actor_role FROM audit_logs WHERE action=$1 AND target=$2',['INSTITUTION_RESTORE_COMMITTED', 'Institution restore request '+id])).rows[0];
  assert.deepEqual(committedActor, { actor_id: 1, actor_role: 'SUPER_ADMIN' });
  await assert.rejects(service.requestRecoveryRestore(id, employee), /Forbidden/);
  const recoveryId = await service.requestRecoveryRestore(id, admin);
  await service.processNextInstitutionRestore();
  let recoveryJob = (await service.listInstitutionRestores(1))[0];
  assert.equal(recoveryJob.id, recoveryId);
  await service.actOnInstitutionRestore(recoveryId, 1, 'approve', recoveryJob.preview_hash, owner);
  await service.actOnInstitutionRestore(recoveryId, undefined, 'execute', recoveryJob.preview_hash, admin);
  injectedFailure = true;
  await service.processNextInstitutionRestore();
  injectedFailure = false;
  recoveryJob = (await service.listInstitutionRestores(1))[0];
  assert.equal(recoveryJob.status, 'FAILED');
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'Restored assignment', 'failed import must roll back earlier inserts/deletes');
  assert.equal((await memory.query<{ marks_obtained: number }>('SELECT marks_obtained FROM marks WHERE id=1')).rows[0].marks_obtained, 90);
  const thirdId = await service.requestRecoveryRestore(id, admin);
  await service.processNextInstitutionRestore();
  const third = (await service.listInstitutionRestores(1))[0];
  await service.actOnInstitutionRestore(thirdId, 1, 'approve', third.preview_hash, owner);
  await service.actOnInstitutionRestore(thirdId, undefined, 'execute', third.preview_hash, admin);
  const { redis } = await import('../src/lib/redis');
  Object.assign(redis, { status: 'end' });
  await service.processNextInstitutionRestore();
  assert.equal((await service.listInstitutionRestores(1))[0].status, 'CACHE_PENDING');
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'Newer data', 'recovery restores the pre-restore snapshot');
  await memory.exec("UPDATE assignments SET title='After committed recovery' WHERE id=1");
  Object.assign(redis, { status: 'ready' });
  await service.processNextInstitutionRestore();
  assert.equal((await service.listInstitutionRestores(1))[0].status, 'COMPLETED');
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'After committed recovery', 'cache retry must not repeat an import');
  assert.equal((await service.listInstitutionRestores(2)).length, 0);
  await assert.rejects(service.submitInstitutionRestore(payload, 'a'.repeat(64), owner), /three restore/);
  const { decryptStreamingCredentials } = await import('../src/lib/streaming-credentials');
  const stored = (await memory.query<{ payload_encrypted: string; recovery_encrypted: string }>('SELECT payload_encrypted,recovery_encrypted FROM institution_restore_requests WHERE id=$1', [id])).rows[0];
  assert.ok(!stored.payload_encrypted.includes('Restored assignment'));
  assert.ok(decryptStreamingCredentials(stored.recovery_encrypted)?.restore.includes('Newer data'));
});
test('a replacement worker fails an interrupted pre-commit request without touching committed data', async () => {
  await memory.exec("UPDATE institution_restore_requests SET created_at=now()-interval '2 days'");
  const id = await service.submitInstitutionRestore(payload, 'b'.repeat(64), owner);
  await memory.query("UPDATE institution_restore_requests SET status='EXECUTION_RUNNING',started_at=now() WHERE id=$1", [id]);
  await service.processNextInstitutionRestore();
  const job = (await service.listInstitutionRestores(1)).find(item => item.id === id)!;
  assert.equal(job.status, 'FAILED');
  assert.match(job.error, /no restore was committed/);
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'After committed recovery');
  assert.equal((await memory.query('SELECT id FROM notifications WHERE title=$1', ['Restore request interrupted'])).rows.length, 1);
});
test('legacy employee execution requests cannot bypass the current permission boundary', async () => {
  await memory.exec("UPDATE institution_restore_requests SET created_at=now()-interval '2 days'");
  const id = await service.submitInstitutionRestore(payload, 'c'.repeat(64), owner);
  await service.processNextInstitutionRestore();
  const job = (await service.listInstitutionRestores(1)).find(item => item.id === id)!;
  await service.actOnInstitutionRestore(id, 1, 'approve', job.preview_hash, owner);
  await assert.rejects(service.actOnInstitutionRestore(id, undefined, 'execute', job.preview_hash, employee), /primary account/);
  await service.actOnInstitutionRestore(id, undefined, 'execute', job.preview_hash, admin);
  await memory.query("UPDATE institution_restore_requests SET execution_requested_by=NULL,execution_requested_by_employee=1,execution_requested_role='EMPLOYEE' WHERE id=$1",[id]);
  await memory.exec('DELETE FROM employees WHERE id=1');
  await service.processNextInstitutionRestore();
  assert.equal((await service.listInstitutionRestores(1)).find(item => item.id === id)!.status, 'FAILED');
  assert.equal((await memory.query('SELECT id FROM super_admins WHERE id=1')).rows.length, 1);
  assert.equal((await memory.query<{ title: string }>('SELECT title FROM assignments WHERE id=1')).rows[0].title, 'After committed recovery');
});
test('Proxy grants the larger ceiling only to restore uploads; streamed bodies cannot bypass it', async () => {
  const { proxy } = await import('../src/proxy');
  for (const [path, method, bytes, expected] of [
    ['/api/institution/restore-requests','POST',8*1024*1024,200],
    ['/api/institution/restore-requests','POST',17*1024*1024,413],
    ['/api/institution/restore-requests','PATCH',8*1024*1024,413],
    ['/api/institution/restore-requests/1','POST',8*1024*1024,413],
    ['/api/institution/students','POST',8*1024*1024,413],
  ] as const) {
    const response = await proxy(new NextRequest(`http://localhost${path}`, { method, headers: { 'Content-Length': String(bytes) } }));
    assert.equal(response.status, expected);
  }
  const { acceptRestoreUpload } = await import('../src/lib/institution-restore-http');
  const request = new NextRequest('http://localhost/api/institution/restore-requests', {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=fixture', 'Content-Length': '1' },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17*1024*1024)); controller.close(); } }),
  });
  await assert.rejects(acceptRestoreUpload(request, 1, owner), /exceeds 16 MB/);
});
