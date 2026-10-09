import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { SQL, eq } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { hash, verify } from '@node-rs/argon2';
import { NextRequest } from 'next/server';
import * as schema from '../src/db/schema';
import type { JWTPayload } from '../src/lib/auth-types';

// Actual services/routes against disposable in-memory PostgreSQL. No live data,
// email, worker, cache or external account is touched.
async function main() {
process.env.JWT_SECRET = 'isolated-campus-verification-secret-at-least-32-characters';
const memory = await PGlite.create();
const testDb = drizzle(memory);
const state = { db: testDb, session: null as JWTPayload | null, viewCookie: '', revocations: 0, cookieCleared: false };
(globalThis as typeof globalThis & { __campusVerification: typeof state }).__campusVerification = state;
const mocks: Record<string, string> = {
  'CampusLoginForm': `import {createElement} from 'react';export const CampusLoginForm=props=>props.allowCreate===false?null:createElement('div',{'data-campus-form':props.endpoint??'/api/institution/campuses'});`,
  db: 'export const db=globalThis.__campusVerification.db;',
  auth: `export const getSession=async()=>globalThis.__campusVerification.session;
    export const getSessionFromRequest=getSession;export const getLightSessionFromRequest=getSession;
    export const getWarmSessionFromRequest=()=>null;
    export const setCampusViewCookie=async token=>{globalThis.__campusVerification.viewCookie=token};
    export const clearAuthCookies=async()=>{globalThis.__campusVerification.cookieCleared=true};
    export const revokeAllSessions=async()=>{globalThis.__campusVerification.revocations++};
    export const createTokens=async()=>({accessToken:'fixture',refreshToken:'fixture'});
    export const setAuthCookies=async()=>{};`,
  'argon2-pool': `import {hash,verify} from '@node-rs/argon2';export const hashPassword=hash;export const verifyPassword=verify;`,
  'rate-limit': 'export const withRateLimit=async()=>({success:true});',
  performance: 'export const measurePerformancePhase=async(_name,fn)=>fn();',
  'api-policy': 'export const withApiPolicy=fn=>fn;',
  audit: 'export const logAudit=async()=>{};',
  user: 'export const invalidateUserValidity=async()=>{};export const resolveUserCreatedAt=async()=>new Date();',
  redis: 'export const invalidateStudentEnrichCache=async()=>{};export const getCachedOrFetch=async(_key,_ttl,fetch)=>fetch();export const redis={status:"ready",del:async()=>{}};',
  cloudinary: 'export default {api:{resource:async id=>({secure_url:"https://example.test/"+id,format:"png",bytes:1024})}};',
};
async function load(entry: string) {
  const result = await build({ entryPoints: [entry], bundle: true, jsx: 'automatic', write: false, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent', plugins: [{ name: 'isolated-campus-db', setup(builder) {
    builder.onResolve({ filter: /^(@\/db$|@\/lib\/|@\/components\/institution\/CampusLoginForm$|\.\/|\.\.\/)/ }, (args) => {
      const absolute = args.path.startsWith('@/') ? path.resolve('src', args.path.slice(2)) : path.resolve(args.resolveDir, args.path);
      const key = absolute === path.resolve('src/db') ? 'db' : path.dirname(absolute) === path.resolve('src/lib') ? path.basename(absolute).replace(/\.ts$/, '') : '';
      if (absolute === path.resolve('src/components/institution/CampusLoginForm')) return {path:'CampusLoginForm',namespace:'fixture'};
      if (Object.hasOwn(mocks, key)) return { path: key, namespace: 'fixture' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
  } }] });
  const loadedModule = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(path.resolve('package.json')), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const evidence: string[] = [];
process.env.NEXT_PUBLIC_APP_DOMAIN='nisaab360.app';
try {
  const dialect = new PgDialect();
  const tables = [schema.institutions, schema.campuses, schema.institutionAdmins, schema.institutionOwners, schema.staff, schema.students, schema.employees, schema.superAdmins, schema.parentAccounts, schema.classes, schema.institutionPublicProfiles, schema.admissionCycles, schema.admissionCycleCampuses];
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.filter((column) => config.name !== 'institutions' || !['parent_institution_id', 'campus_name', 'must_change_password'].includes(column.name)).map((column) => {
      const type = column.columnType === 'PgEnumColumn' ? 'text' : column.getSQLType();
      let defaultValue = '';
      if (column.default !== undefined) {
        const value = column.default;
        defaultValue = ' DEFAULT ' + (value instanceof SQL ? dialect.sqlToQuery(value).sql : typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : typeof value === 'object' ? `'${JSON.stringify(value)}'::jsonb` : String(value));
      }
      return `"${column.name}" ${type}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}${defaultValue}`;
    });
    await memory.exec(`CREATE TABLE "${config.name}" (${columns.join(',')});`);
  }
  const rootPassword = await hash('fixture-main-password');
  const rootValues = { name: 'National College', type: 'COLLEGE' as const, username: 'national', country: 'Pakistan', city: 'Lahore', address: 'Main address', contactEmail: 'main@example.test', contactPhone: '03001234567', registrationNumber: 'NCS01', pricingPlan: 'PREMIUM' as const, logoKey: 'fixture-logo', proofDocumentKey: 'fixture-proof', adminPasswordHash: rootPassword, status: 'APPROVED' as const };
  // Pre-migration insert must not reference the newly introduced columns.
  await memory.query(`INSERT INTO institutions(name,type,username,country,city,address,contact_email,contact_phone,registration_number,pricing_plan,logo_key,proof_document_key,admin_password_hash,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, Object.values(rootValues));
  await testDb.insert(schema.campuses).values([{ institutionId: 1, name: 'Main', address: 'Main address' }, { institutionId: 1, name: 'Green', address: 'Green address' }]);
  const migration = await readFile('drizzle/0066_campus_workspaces.sql', 'utf8');
  await memory.exec(migration);
  await memory.exec(migration);
  const originalCampuses = await testDb.select().from(schema.campuses);
  assert.deepEqual(originalCampuses.map((row) => [row.id, row.name]), [[1, 'Main'], [2, 'Green']]);
  assert.equal((await testDb.select().from(schema.institutions))[0].campusName, 'Main');
  evidence.push('Migration replay preserves the existing Main/Green campus IDs, main credentials and records.');
  const service = await load('src/lib/campus-workspaces.ts');
  const view = await load('src/lib/campus-view.ts');
  const home = await service.resolveCampusSession({ role: 'INSTITUTION', userId: 1, institutionId: 999 });
  assert.equal(home.institutionId, 1, 'database identity overrides a forged tenant claim');
  assert.equal(home.homeInstitutionId, 1);
  assert.equal(home.campusReadOnly, false);
  await testDb.insert(schema.institutionOwners).values({ institutionId: 1, name: 'Owner', gender: 'MALE', email: 'owner@example.test', contactNumber: '03001234567' });
  const campusesRoute = await load('src/app/api/institution/campuses/route.ts');
  state.session = home;
  const campusRequest = (body: unknown) => new NextRequest('http://localhost/api/institution/campuses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const setup = await campusesRoute.POST(campusRequest({ name: 'Green', address: 'Green address', loginEmail: 'GREEN@example.test', registrationNumber: 'GREEN-001', existingCampusId: 2 }), {});
  assert.equal(setup.status, 201, await setup.clone().text());
  assert.equal((await setup.json()).loginEmail, 'green@example.test');
  const greenRow = (await testDb.select().from(schema.institutions).where(eq(schema.institutions.parentInstitutionId, 1)))[0];
  assert.ok(greenRow);
  assert.equal(greenRow.username, 'green');
  assert.equal(greenRow.registrationNumber, 'GREEN-001');
  assert.equal(greenRow.mustChangePassword, true);
  assert.equal(await verify(greenRow.adminPasswordHash, '1234567890'), true);
  assert.equal((await testDb.select().from(schema.campuses).where(eq(schema.campuses.id, 2)))[0].institutionId, greenRow.id);
  assert.equal((await testDb.select().from(schema.institutionOwners).where(eq(schema.institutionOwners.institutionId, greenRow.id))).length, 1);
  assert.equal((await campusesRoute.POST(campusRequest({ name: 'Other', address: 'Other address', loginEmail: 'MAIN@example.test' }), {})).status, 409);
  assert.equal((await campusesRoute.POST(campusRequest({ name: 'green', address: 'Other address', loginEmail: 'unused@example.test' }), {})).status, 409);
  assert.equal((await campusesRoute.POST(campusRequest({ name: '', address: 'x', loginEmail: 'invalid' }), {})).status, 400);
  assert.equal((await testDb.select().from(schema.institutions)).length, 2, 'invalid requests roll back their workspace');
  evidence.push('Existing-campus login setup is atomic, keeps campus ID, normalizes email, rejects duplicate names/emails and hashes the default password.');
  const forced = await service.resolveCampusSession({ role: 'INSTITUTION', userId: greenRow.id, institutionId: greenRow.id, mustChangePassword: false });
  assert.equal(forced.mustChangePassword, true, 'stale/forged password-change claim cannot bypass database flag');
  const rbac = await load('src/lib/rbac.ts');
  const ownWrite = rbac.requireRole(['INSTITUTION'], async () => Response.json({ success: true }));
  state.session = forced;
  assert.equal((await ownWrite(new NextRequest('http://localhost/api/institution/fixture', { method: 'POST' }), {})).status, 403);
  const passwordRoute = await load('src/app/api/auth/change-password/route.ts');
  const passwordRequest = (currentPassword: string, newPassword: string) => new NextRequest('http://localhost/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) });
  assert.equal((await passwordRoute.POST(passwordRequest('1234567890', '1234567890'), {})).status, 400);
  assert.equal((await passwordRoute.POST(passwordRequest('wrong-password', 'fixture-green-password'), {})).status, 400);
  assert.equal((await passwordRoute.POST(passwordRequest('1234567890', 'fixture-green-password'), {})).status, 200);
  const changed = (await testDb.select().from(schema.institutions).where(eq(schema.institutions.id, greenRow.id)))[0];
  assert.equal(changed.mustChangePassword, false);
  assert.equal(await verify(changed.adminPasswordHash, 'fixture-green-password'), true);
  assert.equal(await verify(changed.adminPasswordHash, '1234567890'), false);
  assert.equal((await testDb.select().from(schema.institutions).where(eq(schema.institutions.id, 1)))[0].adminPasswordHash, rootPassword);
  assert.equal(state.revocations, 1);
  evidence.push('First-login password requirement is read fresh from the DB; password update verifies the default, changes only that campus and revokes refresh sessions.');
  const loginHelper = await load('src/lib/student-login-institution.ts');
  const identifiers = await load('src/lib/login-identifiers.ts');
  const mainInstitution = (await testDb.select().from(schema.institutions).where(eq(schema.institutions.id, 1)))[0];
  const mainLogin = await loginHelper.resolveStudentLoginInstitution(mainInstitution);
  const childLogin = await loginHelper.resolveStudentLoginInstitution(greenRow);
  const mainId = identifiers.generateStudentLoginRollNumber({institution: mainLogin, yearOfJoining:2026, admissionSequence:1});
  const childId = identifiers.generateStudentLoginRollNumber({institution: childLogin, yearOfJoining:2026, admissionSequence:1});
  assert.equal(mainId, 'C26-00000001@national.nisaab360.app');
  assert.equal(childId, 'C26-00000001@national.green.nisaab360.app');
  assert.equal(identifiers.campusLoginSlug('  Green East  '), 'green-east');
  assert.equal(identifiers.campusLoginSlug('Green--East'), 'green-east');
  assert.equal(identifiers.campusLoginSlug('Caf\u00e9 Campus'), 'cafe-campus');
  assert.throws(()=>identifiers.campusLoginSlug('---'));
  assert.throws(()=>identifiers.campusLoginSlug('a'.repeat(64)));
  assert.throws(()=>identifiers.generateStudentLoginRollNumber({institution: greenRow, yearOfJoining:2026, admissionSequence:1}), /Parent institution/);
  await assert.rejects(()=>loginHelper.resolveStudentLoginInstitution({...greenRow,parentInstitutionId:999999}), /Parent institution/);
  await service.createCampusWorkspace(home, {name:'Green East',address:'Synthetic address',loginEmail:'east@example.test'});
  await assert.rejects(()=>service.createCampusWorkspace(home, {name:'Green-East',address:'Synthetic address',loginEmail:'east-other@example.test'}), /student login name already exists/);
  evidence.push('Student logins use the main username or parent-plus-campus namespace; actual parent SQL lookup, missing-parent failures, accent/space normalization, invalid/overlong names and normalized campus collisions are verified.');
  const green = await service.resolveCampusSession({ role: 'INSTITUTION', userId: greenRow.id, institutionId: greenRow.id });
  const mainViewToken = await view.createCampusViewToken(home, greenRow.id);
  const mainViewingGreen = await service.resolveCampusSession(home, mainViewToken);
  assert.equal(mainViewingGreen.institutionId, greenRow.id);
  assert.equal(mainViewingGreen.homeInstitutionId, 1);
  assert.equal(mainViewingGreen.campusReadOnly, true);
  const greenViewingMain = await service.resolveCampusSession(green, await view.createCampusViewToken(green, 1));
  assert.equal(greenViewingMain.institutionId, 1);
  assert.equal(greenViewingMain.campusReadOnly, true);
  assert.equal((await service.resolveCampusSession(green, mainViewToken)).institutionId, greenRow.id, 'another account cannot reuse a view cookie');
  assert.equal((await service.resolveCampusSession(home, mainViewToken + 'tamper')).institutionId, 1);
  await testDb.insert(schema.institutions).values({ ...rootValues, username: 'foreign', contactEmail: 'foreign@example.test', campusName: 'Foreign' });
  const foreign = (await testDb.select().from(schema.institutions).where(eq(schema.institutions.username, 'foreign')))[0];
  const foreignToken = await view.createCampusViewToken(home, foreign.id);
  assert.equal((await service.resolveCampusSession(home, foreignToken)).institutionId, 1, 'foreign institution cannot become a view');
  const switchRoute = await load('src/app/api/institution/campus-view/route.ts');
  state.session = mainViewingGreen;
  const switchRequest = (campusId: number) => new NextRequest('http://localhost/api/institution/campus-view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campusId }) });
  assert.equal((await switchRoute.POST(switchRequest(1), {})).status, 200, 'read-only users can return to their own campus');
  assert.equal((await service.resolveCampusSession(home, state.viewCookie)).campusReadOnly, false);
  assert.equal((await switchRoute.POST(switchRequest(99999), {})).status, 404);
  state.session = greenViewingMain;
  assert.equal((await switchRoute.POST(switchRequest(2), {})).status, 200, 'other campus can return home');
  state.session = mainViewingGreen;
  const returnRequest = (body: unknown = {returnHome:true}) => new NextRequest('http://localhost/api/institution/campus-view', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const returnedMain = await switchRoute.POST(returnRequest(), {});
  assert.equal(returnedMain.status,200);
  assert.equal((await returnedMain.json()).readOnly,false);
  assert.equal((await service.resolveCampusSession(home,state.viewCookie)).institutionId,home.homeInstitutionId);
  state.session = greenViewingMain;
  assert.equal((await switchRoute.POST(returnRequest(), {})).status,200);
  assert.equal((await service.resolveCampusSession(green,state.viewCookie)).institutionId,green.homeInstitutionId);
  assert.equal((await switchRoute.POST(returnRequest({returnHome:true,campusId:99999}), {})).status,400);
  assert.equal((await switchRoute.POST(returnRequest({returnHome:false}), {})).status,400);
  evidence.push('One-click returnHome selects the authenticated home workspace in both directions, returns writable state and rejects mixed/invalid target payloads.');
  evidence.push('Both directions of viewing preserve identity; signed cookies reject tampering, reuse by another account and foreign institution selection; switching home restores write access.');
  state.session = mainViewingGreen;
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await ownWrite(new NextRequest('http://localhost/api/institution/fixture', { method }), {})).status, 403);
  assert.equal((await ownWrite(new NextRequest('http://localhost/api/institution/fixture'), {})).status, 200);
  const mutatingGet = rbac.requireRole(['INSTITUTION'], async () => Response.json({ success: true }), { mutatesOnRead: true });
  assert.equal((await mutatingGet(new NextRequest('http://localhost/api/institution/settings/google-drive/callback'), {})).status, 403, 'OAuth GET cannot alter another campus');
  assert.throws(() => view.assertCampusWritable(mainViewingGreen), /read-only/);
  assert.throws(() => view.assertCampusWritable(forced), /PASSWORD_CHANGE_REQUIRED/);
  state.session = green;
  assert.equal((await ownWrite(new NextRequest('http://localhost/api/institution/fixture', { method: 'POST' }), {})).status, 200);
  assert.equal((await campusesRoute.POST(campusRequest({ name: 'Nested', address: 'Nested address', loginEmail: 'nested@example.test' }), {})).status, 403);
  const adminsRoute = await load('src/app/api/institution/admins/route.ts');
  const adminRequest = (email: string) => new NextRequest('http://localhost/api/institution/admins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Campus Admin', email, password: 'fixture-admin-password' }) });
  assert.equal((await adminsRoute.POST(adminRequest('green@example.test'), {})).status, 409, 'Add Admin cannot shadow a campus login');
  assert.equal((await adminsRoute.POST(adminRequest('green-local-admin@example.test'), {})).status, 200);
  assert.equal((await adminsRoute.POST(adminRequest('GREEN-LOCAL-ADMIN@example.test'), {})).status, 409);
  await testDb.insert(schema.institutionAdmins).values({ institutionId: greenRow.id, name: 'Green Admin', email: 'admin@example.test', passwordHash: 'fixture' });
  const admin = await service.resolveCampusSession({ role: 'INSTITUTION_ADMIN', userId: 1, institutionId: 1 });
  assert.equal(admin.institutionId, greenRow.id, 'Add Admin remains scoped to its own campus');
  assert.equal((await service.resolveCampusSession(admin, await view.createCampusViewToken(admin, 1))).institutionId, greenRow.id, 'secondary admins stay local');
  await testDb.insert(schema.classes).values([{ institutionId: 1, name: 'Main Class' }, { institutionId: greenRow.id, name: 'Green Class' }]);
  const readClasses = rbac.requireRole(['INSTITUTION'], async (_req: NextRequest, { session }: { session: JWTPayload }) => Response.json(await testDb.select({ name: schema.classes.name }).from(schema.classes).where(eq(schema.classes.institutionId, rbac.getTenantContext(session)))));
  state.session = mainViewingGreen;
  assert.deepEqual(await (await readClasses(new NextRequest('http://localhost/api/institution/classes'), {})).json(), [{ name: 'Green Class' }]);
  state.session = home;
  assert.deepEqual(await (await readClasses(new NextRequest('http://localhost/api/institution/classes'), {})).json(), [{ name: 'Main Class' }]);
  await testDb.update(schema.institutions).set({ status: 'REJECTED' }).where(eq(schema.institutions.id, 1));
  assert.equal(await service.resolveCampusSession(green), null, 'root rejection disables campus owners');
  assert.equal(await service.resolveCampusSession(admin), null, 'root rejection disables local admins');
  evidence.push('RBAC blocks all foreign-campus writes, allows own-campus writes/selected-campus reads, isolates local admins, disallows nested campus creation and checks parent approval.');

  // Independent purchased institutions verify every entitlement without touching live data.
  const platformRoute = await load('src/app/api/employee/institutions/[id]/campuses/route.ts');
  const newRoot = async (plan: 'BASIC' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE', suffix: string) => {
    const [row] = await testDb.insert(schema.institutions).values({...rootValues,pricingPlan:plan,username:suffix,contactEmail:suffix+'@example.test',campusName:'Main'}).returning();
    await testDb.insert(schema.campuses).values({institutionId:row.id,name:'Main',address:'Fixture main'});
    return {row,session:await service.resolveCampusSession({role:'INSTITUTION',userId:row.id,institutionId:row.id})};
  };
  const createInput = (suffix: string) => ({name:suffix,address:'Fixture address',loginEmail:suffix.toLowerCase()+'@example.test'});
  for(const [plan,limit] of [['BASIC',1],['STANDARD',3],['PREMIUM',5]] as const) {
    const fixture=await newRoot(plan,'plan-'+plan.toLowerCase());
    state.session=fixture.session;
    for(let n=1;n<limit;n++) {
      const response=await campusesRoute.POST(campusRequest(createInput(plan+'-'+n)),{});
      assert.equal(response.status,201,await response.clone().text());
    }
    const before=await service.listInstitutionCampuses(fixture.session);
    assert.equal(before.length,limit);
    const denied=await campusesRoute.POST(campusRequest(createInput(plan+'-overflow')),{});
    assert.equal(denied.status,409,await denied.clone().text());
    assert.match((await denied.json()).error,/including Main/);
    assert.equal((await service.listInstitutionCampuses(fixture.session)).length,limit);
    // Platform actors cannot bypass a fixed plan through the Enterprise endpoint.
    state.session={role:'EMPLOYEE',userId:777};
    assert.equal((await platformRoute.POST(campusRequest(createInput(plan+'-bypass')),{params:Promise.resolve({id:String(fixture.row.id)})})).status,409);
  }
  evidence.push('Basic/Standard/Premium allow exactly 1/3/5 campuses including Main; over-limit requests return 409 without adding data; platform endpoint cannot bypass fixed-plan limits.');
  const legacy=await newRoot('STANDARD','legacy-limit');
  const [legacyCampus]=await testDb.insert(schema.campuses).values({institutionId:legacy.row.id,name:'Legacy',address:'Fixture legacy'}).returning();
  await testDb.insert(schema.campuses).values({institutionId:legacy.row.id,name:'Legacy Other',address:'Fixture legacy'});
  state.session=legacy.session;
  assert.equal((await campusesRoute.POST(campusRequest({...createInput('Legacy'),existingCampusId:legacyCampus.id}),{})).status,201,'setup at the limit consumes no extra campus');
  await testDb.update(schema.institutions).set({pricingPlan:'BASIC'}).where(eq(schema.institutions.id,legacy.row.id));
  const preserved=await service.listInstitutionCampuses(legacy.session);
  assert.equal(preserved.length,3);
  assert.equal((await campusesRoute.POST(campusRequest(createInput('legacy-overflow')),{})).status,409);
  assert.equal((await service.listInstitutionCampuses(legacy.session)).length,3);
  evidence.push('Legacy campuses count before login setup; setup at the limit does not consume another slot; plan downgrade blocks additions and preserves existing campuses.');
  const enterprise=await newRoot('ENTERPRISE','plan-enterprise');
  const callPlatform=(id: string, body: unknown) => platformRoute.POST(campusRequest(body),{params:Promise.resolve({id})});
  state.session=enterprise.session;
  assert.equal((await campusesRoute.POST(campusRequest(createInput('enterprise-owner')),{})).status,403);
  assert.equal((await callPlatform(String(enterprise.row.id),createInput('enterprise-forged'))).status,403);
  await assert.rejects(()=>service.createCampusWorkspace(enterprise.session,createInput('service-forged'),enterprise.row.id),/Only platform/);
  for(const [index,actor] of [{role:'SUPER_ADMIN',userId:900,isSuperAdmin:true},{role:'SUPER_ADMIN',userId:901,isSuperAdmin:false},{role:'EMPLOYEE',userId:902}].entries()) {
    state.session=actor as JWTPayload;
    const response=await callPlatform(String(enterprise.row.id),createInput('enterprise-'+index));
    assert.equal(response.status,201,await response.clone().text());
    const child=(await response.json()).campus;
    const [campus]=await testDb.select().from(schema.campuses).where(eq(schema.campuses.id,child.id));
    const [workspace]=await testDb.select().from(schema.institutions).where(eq(schema.institutions.id,campus.institutionId));
    assert.equal(workspace.parentInstitutionId,enterprise.row.id);
    assert.equal(workspace.mustChangePassword,true);
    assert.equal((await callPlatform(String(workspace.id),createInput('nested-platform-'+index))).status,404);
  }
  state.session={role:'EMPLOYEE',userId:902};
  for(let n=3;n<6;n++) assert.equal((await callPlatform(String(enterprise.row.id),createInput('enterprise-'+n))).status,201);
  assert.equal((await service.listRootCampuses(enterprise.row.id)).length,7,'Enterprise has platform-managed creation rather than an invented fixed cap');
  for(const role of ['INSTITUTION_ADMIN','STAFF','STUDENT','PARENT'] as const) {
    state.session={role,userId:999,institutionId:enterprise.row.id};
    assert.equal((await callPlatform(String(enterprise.row.id),createInput('denied-'+role))).status,403);
  }
  state.session={role:'SUPER_ADMIN',userId:901,isSuperAdmin:false};
  for(const id of ['1x','0','-1','9007199254740992']) assert.equal((await callPlatform(id,createInput('invalid-id'))).status,400);
  assert.equal((await callPlatform('999999',createInput('missing-root'))).status,404);
  assert.equal((await callPlatform(String(enterprise.row.id),{...createInput('forged-parent'),parentInstitutionId:1})).status,400);
  await testDb.update(schema.institutions).set({status:'REJECTED'}).where(eq(schema.institutions.id,enterprise.row.id));
  assert.equal((await callPlatform(String(enterprise.row.id),createInput('rejected-root'))).status,404);
  evidence.push('Enterprise denies institution/delegated/other users; root and regular platform admins and employees create isolated campus accounts, with no fixed cap; malformed/foreign/nested/unapproved targets fail.');


  const ownerPage=await load('src/app/(institution)/institution/campuses/page.tsx');
  const basicUi=await newRoot('BASIC','ui-basic');state.session=basicUi.session;
  let markup=renderToStaticMarkup(await ownerPage.default());
  assert.match(markup,/1 of 1 campuses/);assert.doesNotMatch(markup,/data-campus-form/);
  const standardUi=await newRoot('STANDARD','ui-standard');state.session=standardUi.session;
  markup=renderToStaticMarkup(await ownerPage.default());assert.match(markup,/data-campus-form/);assert.match(markup,/1 of 3 campuses/);
  await service.createCampusWorkspace(standardUi.session,createInput('ui-standard-one'));
  await service.createCampusWorkspace(standardUi.session,createInput('ui-standard-two'));
  markup=renderToStaticMarkup(await ownerPage.default());assert.doesNotMatch(markup,/data-campus-form/);assert.match(markup,/3 of 3 campuses/);
  const enterpriseUi=await newRoot('ENTERPRISE','ui-enterprise');state.session=enterpriseUi.session;
  markup=renderToStaticMarkup(await ownerPage.default());assert.doesNotMatch(markup,/data-campus-form/);assert.match(markup,/Contact a platform admin or employee/);
  const adminSection=await load('src/components/InstitutionEnterpriseCampuses.tsx');
  markup=renderToStaticMarkup(await adminSection.InstitutionEnterpriseCampuses({institutionId:enterpriseUi.row.id}));
  assert.match(markup,new RegExp('data-campus-form="/api/employee/institutions/'+enterpriseUi.row.id+'/campuses"'));
  evidence.push('Actual campus page renders plan usage, hides creation at the limit and for Enterprise owners; actual platform Enterprise section targets the protected institution-specific endpoint.');

  // Identity changes must stay within the authenticated workspace, including uploads.
  const settingsRoute = await load('src/app/api/institution/settings/route.ts');
  const logoRoute = await load('src/app/api/institution/logo/route.ts');
  const signatureRoute = await load('src/app/api/institution/signature/route.ts');
  const websiteAccess = await load('src/lib/public-website-access.ts');
  const patchRequest = (url: string, body: unknown) => new NextRequest('http://localhost'+url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  state.session = green;
  assert.equal((await settingsRoute.PATCH(patchRequest('/api/institution/settings', {registrationNumber:'GREEN-002'}), {})).status, 200);
  assert.equal((await settingsRoute.PATCH(patchRequest('/api/institution/settings', {registrationNumber:'x'.repeat(101)}), {})).status, 400);
  assert.equal((await settingsRoute.PATCH(patchRequest('/api/institution/settings', {registrationNumber:'NO', institutionId:1}), {})).status, 400);
  const uploadId = `lms-uploads/tenant-${greenRow.id}/institution/user-${greenRow.id}/campus-logo`;
  assert.equal((await logoRoute.PATCH(patchRequest('/api/institution/logo', {publicId:uploadId}), {})).status, 200);
  assert.equal((await signatureRoute.PATCH(patchRequest('/api/institution/signature', {publicId:uploadId+'-head'}), {})).status, 200);
  assert.equal((await logoRoute.PATCH(patchRequest('/api/institution/logo', {publicId:'lms-uploads/tenant-1/institution/user-1/main-logo'}), {})).status, 400);
  const [updatedCampus] = await testDb.select().from(schema.institutions).where(eq(schema.institutions.id, greenRow.id));
  const [unchangedMain] = await testDb.select().from(schema.institutions).where(eq(schema.institutions.id, 1));
  assert.equal(updatedCampus.registrationNumber, 'GREEN-002');
  assert.equal(updatedCampus.logoKey, 'https://example.test/'+uploadId);
  assert.equal(updatedCampus.signatureKey, 'https://example.test/'+uploadId+'-head');
  assert.equal(unchangedMain.logoKey, rootValues.logoKey);
  assert.equal(unchangedMain.registrationNumber, rootValues.registrationNumber);
  assert.equal(unchangedMain.signatureKey, null);
  assert.equal(await websiteAccess.isMainCampusWebsite(1), true);
  assert.equal(await websiteAccess.isMainCampusWebsite(greenRow.id), false);
  await testDb.update(schema.institutions).set({status:'APPROVED',publicSlug:'identity-main',publicSiteEnabled:true}).where(eq(schema.institutions.id,1));
  await testDb.update(schema.institutions).set({publicSlug:'identity-child',publicSiteEnabled:true}).where(eq(schema.institutions.id,greenRow.id));
  const publicTenant = await load('src/lib/institution-tenant.ts');
  const mainWebsite = await publicTenant.resolveInstitutionTenant('identity-main');
  assert.equal(mainWebsite.kind,'active');
  assert.equal(mainWebsite.tenant.logoKey,rootValues.logoKey);
  assert.equal((await publicTenant.resolveInstitutionTenant('identity-child')).kind,'not_found');
  evidence.push('Actual public tenant resolution continues to serve the main campus logo after a child changes its logo, and refuses a child website even if it has a legacy enabled slug.');
  evidence.push('Campus creation uses its name for a readable username and accepts its own registration number; actual registration/logo/head-signature updates leave all main-campus identity fields intact and reject foreign upload ownership.');

  state.session = mainViewingGreen;
  assert.equal((await settingsRoute.PATCH(patchRequest('/api/institution/settings', {registrationNumber:'NO'}), {})).status, 403);
  assert.equal((await logoRoute.PATCH(patchRequest('/api/institution/logo', {publicId:uploadId}), {})).status, 403);
  state.session = home;
  assert.equal((await settingsRoute.PATCH(patchRequest('/api/institution/settings', {registrationNumber:'NO'}), {})).status, 403);
  state.session = admin;
  assert.equal((await settingsRoute.PATCH(patchRequest('/api/institution/settings', {registrationNumber:'GREEN-ADMIN'}), {})).status, 200);
  evidence.push('Registration edits enforce campus-local owner/admin scope, reject extra fields and oversize values, block sibling read-only mutations and cannot alter the main-campus registration.');

  for (const entry of ['src/app/api/institution/public-site/route.ts','src/app/api/institution/public-site/images/route.ts','src/app/api/institution/public-events/route.ts','src/app/api/institution/public-events/[id]/route.ts']) {
    const route = await load(entry);
    for (const roleSession of [green, admin]) {
      state.session = roleSession;
      for (const method of Object.keys(route)) {
        const response = await route[method](new NextRequest('http://localhost/api/institution/public-site', {method, ...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'signature'})})}), {params:Promise.resolve({id:'1'})});
        assert.equal(response.status, 403, entry+' '+method+' must deny campus website management');
      }
    }
  }
  evidence.push('Actual website settings, image-upload and event GET/POST/PATCH/DELETE endpoints deny child campus owners and delegated campus admins; the fresh main-campus check allows the root workspace.');

  // Simulate an old generated name and a global collision, then replay the migration.
  await testDb.update(schema.institutions).set({username:'campus2f73b6518'}).where(eq(schema.institutions.id,greenRow.id));
  await testDb.update(schema.institutions).set({username:'green'}).where(eq(schema.institutions.id,1));
  const identityMigration = await readFile('drizzle/0069_campus_identity.sql','utf8');
  await memory.exec('BEGIN;'+identityMigration+'COMMIT;');
  const afterMigration = (await testDb.select().from(schema.institutions).where(eq(schema.institutions.id,greenRow.id)))[0];
  assert.equal(afterMigration.username,'green-1');
  assert.equal(afterMigration.registrationNumber,'GREEN-ADMIN');
  assert.equal(afterMigration.logoKey,updatedCampus.logoKey);
  assert.equal(afterMigration.signatureKey,updatedCampus.signatureKey);
  await memory.exec('BEGIN;'+identityMigration+'COMMIT;');
  assert.deepEqual((await testDb.select().from(schema.institutions).where(eq(schema.institutions.id,greenRow.id)))[0],afterMigration);
  await testDb.update(schema.institutions).set({username:rootValues.username}).where(eq(schema.institutions.id,1));
  const collisionRoot = await newRoot('STANDARD','identity-collision');
  const collisionCampus = await service.createCampusWorkspace(collisionRoot.session,{name:'Green',address:'Separate address',loginEmail:'identity-collision-campus@example.test'});
  const [collisionCampusRecord] = await testDb.select().from(schema.campuses).where(eq(schema.campuses.id,collisionCampus.campus.id));
  const [collisionRow] = await testDb.select().from(schema.institutions).where(eq(schema.institutions.id,collisionCampusRecord.institutionId));
  assert.equal(collisionRow.username,'green');
  evidence.push('The identity migration handles generated campus usernames and global name collisions within 30 characters, preserves logos/signatures/registration numbers and is idempotent; new workspaces use readable available names across institutions.');

  await mkdir('docs/campus-identity-2026-10-07',{recursive:true});
  await writeFile('docs/campus-identity-2026-10-07/service-results.json', JSON.stringify({ passed: true, groups: evidence }, null, 2));
  console.log(`Campus verification passed: ${evidence.length} integration groups.`);
  evidence.forEach((group) => console.log(`- ${group}`));
} finally {
  await memory.close();
}
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
