import assert from 'node:assert/strict';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { validationError, apiErrorMessage, responseErrorMessage } from '../src/lib/validation-errors';
import { databaseInputError } from '../src/lib/database-input-error';
import { actionFeedback } from '../src/lib/action-feedback';
import { ActionInputError } from '../src/lib/action-input-error';
import { api, ApiError } from '../src/lib/api-client';
import { runAction } from '../src/lib/run-action';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest } from 'next/server';

async function main() {
  const schema = z.object({ name: z.string().trim().min(1).max(20), email: z.email(), amount: z.number().int().min(1).max(1000), password: z.string().min(8) });
  const invalid = schema.safeParse({ name: ' ', email: 'private-invalid-value', amount: 1001, password: 'secret' });
  assert(!invalid.success);
  const result = validationError(invalid.error);
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.deepEqual(result.fieldErrors.name, ['This value is required.']);
  assert.deepEqual(result.fieldErrors.email, ['Enter a valid email address.']);
  assert.deepEqual(result.fieldErrors.amount, ['Enter a value no greater than 1000.']);
  assert.deepEqual(result.fieldErrors.password, ['Enter at least 8 characters.']);
  assert(!JSON.stringify(result).includes('private-invalid-value'));
  assert(!JSON.stringify(result).includes('secret'));
  const missing = schema.safeParse({}); assert(!missing.success);
  assert(validationError(missing.error).error.includes('Name: This value is required.'));
  const long = z.object({ title: z.string().max(3) }).safeParse({ title: 'abcd' }); assert(!long.success);
  assert.equal(validationError(long.error).error, 'Title: Use no more than 3 characters.');
  const custom = z.object({ phone: z.string().regex(/^\d+$/, 'Use digits only.') }).safeParse({ phone: 'x' }); assert(!custom.success);
  assert.equal(validationError(custom.error).error, 'Phone: Use digits only.');
  const union = z.union([z.object({ name: z.string().min(1) }), z.object({ amount: z.number() })]).safeParse({ name: '' }); assert(!union.success);
  assert(validationError(union.error).error.includes('Name:'));
  assert(!apiErrorMessage({ error: '<html>nginx private details</html>' }, 502).includes('nginx'));
  assert(!apiErrorMessage({ error: 'column "secret_column" does not exist' }, 500).includes('secret_column'));
  assert.equal(apiErrorMessage({ error: { issues: invalid.error.issues } }, 400), result.error);
  assert.equal(apiErrorMessage({ error: 'Invalid data', details: invalid.error.issues }, 400), result.error);
  assert(apiErrorMessage(new TypeError('Failed to fetch')).includes('internet connection'));
  assert(apiErrorMessage({}, 429).includes('wait'));
  assert(apiErrorMessage({}, 401).includes('sign in'));
  const duplicate = databaseInputError({ cause: { code: '23505', constraint: 'inst_class_roll_unique', detail: 'PRIVATE VALUE' } });
  assert.equal(duplicate?.status, 409);
  assert(duplicate?.body.fieldErrors?.classRollNumber);
  assert(!JSON.stringify(duplicate).includes('PRIVATE VALUE'));
  assert.equal(databaseInputError({ code: '42703' }), null);
  const expected = await actionFeedback(async () => { throw new ActionInputError('Class name is required.'); });
  assert.deepEqual(expected, { ok: false, error: 'Class name is required.' });
  const zodResult = await actionFeedback(async () => schema.parse({})); assert(!zodResult.ok && zodResult.fieldErrors?.name);
  const success = await actionFeedback(async () => ({ created: 1 })); assert.deepEqual(success, { ok: true, data: { created: 1 } });
  const originalError = console.error; console.error = () => {};
  try {
    const unknown = await actionFeedback(async () => { throw new Error('PRIVATE SERVER DETAILS'); });
    assert(!unknown.ok && !unknown.error.includes('PRIVATE'));
  } finally { console.error = originalError; }
  await assert.rejects(() => actionFeedback(async () => redirect('/login')), error => typeof error === 'object' && error !== null && 'digest' in error);
  await assert.rejects(() => runAction(async () => expected), error => error instanceof ApiError && error.message === 'Class name is required.');
  assert.deepEqual(await runAction(async () => success), { created: 1 });

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json(result, { status: 400 });
    await assert.rejects(() => api.post('/api/auth/login', {}), error => error instanceof ApiError && error.status === 400 && error.fieldErrors.email[0] === 'Enter a valid email address.');
    globalThis.fetch = async () => new Response('<html>private proxy error</html>', { status: 502 });
    await assert.rejects(() => api.post('/api/test', {}), error => error instanceof ApiError && !error.message.includes('private') && error.message.includes('server'));
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(() => api.post('/api/test', {}), error => error instanceof ApiError && error.message.includes('internet connection'));
    globalThis.fetch = async () => { throw new DOMException('Cancelled', 'AbortError'); };
    await assert.rejects(() => api.get('/api/test'), error => error instanceof DOMException && error.name === 'AbortError');
    globalThis.fetch = async () => new Response('broken json', { status: 400, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(() => api.post('/api/test', {}), error => error instanceof ApiError && error.message.includes('unreadable'));
    assert.equal(await responseErrorMessage(Response.json(result, { status: 400 })), result.error);
    assert(!((await responseErrorMessage(new Response('<html>secret</html>', { status: 500 }))).includes('secret')));
  } finally { globalThis.fetch = originalFetch; }
  await verifyAttendancePreservation();
  console.log('PASS: validation fields/limits/formats, safe API/database errors, action transport/redirects, network/HTML/JSON/cancellation handling. No services or live data used.');
}

async function verifyAttendancePreservation() {
  const memory = new PGlite();
  await memory.exec(`CREATE TABLE staff (id integer PRIMARY KEY, institution_id integer NOT NULL);
    CREATE TABLE staff_attendances (id serial PRIMARY KEY, institution_id integer NOT NULL, staff_id integer NOT NULL REFERENCES staff(id), date date NOT NULL, status text NOT NULL, created_at timestamp DEFAULT now(), UNIQUE(staff_id,date));
    INSERT INTO staff VALUES (1,10),(2,20);
    INSERT INTO staff_attendances(institution_id,staff_id,date,status) VALUES (10,1,'2026-10-09','PRESENT');`);
  const db = drizzle(memory);
  (globalThis as typeof globalThis & { __formValidationDb: typeof db }).__formValidationDb = db;
  try {
    const bundled = await build({ entryPoints: ['src/app/api/institution/staff-attendance/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'attendance-fixture', setup(builder) {
      builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: 'db', namespace: 'fixture' }));
      builder.onResolve({ filter: /^@\/lib\/rbac$/ }, () => ({ path: 'rbac', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'db' ? 'export const db=globalThis.__formValidationDb;' : 'export const requireRole=(_roles,handler)=>handler;' }));
    } }] });
    const dir = '.codex/form-validation'; await mkdir(dir, { recursive: true });
    const file = path.resolve(dir, 'attendance.cjs'); await writeFile(file, bundled.outputFiles[0].text);
    const route = createRequire(file)(file);
    const snapshot = async () => (await memory.query<{ institution_id: number; staff_id: number; date: string; status: string }>('SELECT institution_id,staff_id,date,status FROM staff_attendances ORDER BY id')).rows;
    const before = await snapshot();
    const post = (body: unknown) => route.POST(new NextRequest('http://localhost/api/institution/staff-attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { session: { institutionId: 10 } });
    for (const body of [
      { date: '2026-02-30', records: [{ staffId: 1, status: 'PRESENT' }] },
      { date: '2026-10-09', records: [] },
      { date: '2026-10-09', records: [{ staffId: 1, status: 'INVALID' }] },
      { date: '2026-10-09', records: [{ staffId: 1, status: 'PRESENT' }, { staffId: 1, status: 'ABSENT' }] },
      { date: '2026-10-09', records: [{ staffId: 2, status: 'ABSENT' }] },
    ]) {
      const response = await post(body); assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).error, 'string');
      assert.deepEqual(await snapshot(), before);
    }
    await memory.exec(`CREATE FUNCTION reject_fixture_leave() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='LEAVE' THEN RAISE EXCEPTION 'fixture failure after delete'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_fixture_leave BEFORE INSERT ON staff_attendances FOR EACH ROW EXECUTE FUNCTION reject_fixture_leave();`);
    const originalError = console.error; console.error = () => {};
    try { assert.equal((await post({ date: '2026-10-09', records: [{ staffId: 1, status: 'LEAVE' }] })).status, 500); }
    finally { console.error = originalError; }
    assert.deepEqual(await snapshot(), before);
    assert.equal((await post({ date: '2026-10-09', records: [{ staffId: '1', status: 'ABSENT' }] })).status, 200);
    assert.equal((await snapshot())[0].status, 'ABSENT');
    console.log('PASS: actual attendance API rejects invalid dates/statuses/duplicates/foreign staff before writes, preserves records after insert failure, and saves valid replacement atomically.');
  } finally { await memory.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
