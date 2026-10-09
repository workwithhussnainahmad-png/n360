import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { SQL, eq, inArray } from 'drizzle-orm';
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
const feeQueries: string[] = [];
const testDb = drizzle(memory, { logger: { logQuery(query) { feeQueries.push(query); } } });
const state = { db: testDb, session: null as JWTPayload | null, viewCookie: '', revocations: 0, cookieCleared: false };
(globalThis as typeof globalThis & { __campusVerification: typeof state }).__campusVerification = state;
const mocks: Record<string, string> = {
  'CampusLoginForm': `import {createElement} from 'react';export const CampusLoginForm=props=>props.allowCreate===false?null:createElement('div',{'data-campus-form':props.endpoint??'/api/institution/campuses'});`,
  'next-cache':'export const revalidatePath=()=>{};',
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
  redis: 'export const redis={status:"ready",del:async()=>{},unlink:async()=>{}};export const invalidateInstitutionRosterCaches=async()=>{};export const invalidateStudentEnrichCache=async()=>{};export const invalidateReadCacheKeys=async()=>{};export const invalidateReadCachePatterns=async()=>{};export const invalidateTimetableReadCaches=async()=>{};export const invalidateAnnouncementReadCaches=async()=>{};export const invalidateStaffReadCaches=async()=>{};export const getCachedOrFetch=async(_key,_ttl,fn)=>fn();export const peekCachedOrFetch=()=>null;',
  'central-drive-backups': 'export const centralDriveOAuthUrl=state=>"https://accounts.google.test/consent?state="+state;export const exchangeCentralDriveCode=async()=>({refreshToken:"fixture-central-secret"});',
  cloudinary: 'export default {api:{resource:async()=>{throw Error("Unexpected cloudinary call")}}};',
  'institution-restores': 'export const submitInstitutionRestore=async()=>1;export const listInstitutionRestores=async()=>[];export const actOnInstitutionRestore=async()=>{};export const requestRecoveryRestore=async()=>({id:1});',
  user: 'export const getFreshStudent=async(...args)=>globalThis.__campusVerification.liveStudentVerifier(...args);export const verifyUserExistsFresh=async(...args)=>globalThis.__campusVerification.liveVerifier?globalThis.__campusVerification.liveVerifier(...args):true;export const invalidateUserValidity=async()=>{};export const resolveUserCreatedAt=async()=>new Date();export const getUserCreatedAt=async()=>new Date();',
};
async function load(entry: string) {
  const result = await build({ entryPoints: [entry], bundle: true, jsx: 'automatic', write: false, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent', plugins: [{ name: 'isolated-campus-db', setup(builder) {
    builder.onResolve({ filter: /^(@\/db$|next\/cache$|@\/components\/|@\/app\/|@\/lib\/|@\/components\/institution\/CampusLoginForm$|\.\/|\.\.\/)/ }, (args) => {
      if(args.kind==='entry-point') return;
      if(args.path==='next/cache') return {path:'next-cache',namespace:'fixture'};
      const absolute = args.path.startsWith('@/') ? path.resolve('src', args.path.slice(2)) : path.resolve(args.resolveDir, args.path);
      const controls=['InstitutionLogoUploader','InstitutionSignatureUploader','PaymentAccountsSettings','GoogleDriveBackupSettings','CourseStreamingSettings','GraduatedStudentAccessClient','CentralDatabaseBackupSettings','InstitutionRestoreRequests','InstitutionBackupsClient'];
      const name=path.basename(absolute).replace(/\.tsx?$/, '');
      if(controls.includes(name)) return {path:name,namespace:'ui-capability'};
      const key = absolute === path.resolve('src/db') ? 'db' : path.dirname(absolute) === path.resolve('src/lib') ? path.basename(absolute).replace(/\.ts$/, '') : '';
      if (absolute === path.resolve('src/components/institution/CampusLoginForm')) return {path:'CampusLoginForm',namespace:'fixture'};
      if (Object.hasOwn(mocks, key)) return { path: key, namespace: 'fixture' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'ui-capability' }, args=>({contents:`import {createElement} from 'react';export const ${args.path}=props=>createElement('div',{'data-capability':'${args.path}','data-download':String(props.canDownload??false)});`,loader:'js',resolveDir:process.cwd()}));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
  } }] });
  const compiledModule = { exports: {} as Record<string, any> };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(path.resolve('package.json')), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const evidence: string[] = [];
process.env.NEXT_PUBLIC_APP_DOMAIN='nisaab360.app';
try {
  const dialect = new PgDialect();
  const tables = [schema.institutions, schema.campuses, schema.institutionAdmins, schema.institutionOwners, schema.staff, schema.students, schema.employees, schema.superAdmins, schema.parentAccounts, schema.classes, schema.sections, schema.centralBackupSettings, schema.institutionGoogleDriveBackups, schema.institutionPaymentGateways, schema.platformReviews, schema.feeHeads, schema.classFeeItems, schema.feeInvoices, schema.feePaymentSubmissions, schema.feeInvoiceItems, schema.studentFeeAdjustments, schema.studentAdmissionCounters];
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
  await memory.exec('CREATE UNIQUE INDEX fee_head_fixture_name_unique ON fee_heads(institution_id,name)');
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

  const permissions = await load('src/lib/security-permissions.ts');
  const root = {role:'SUPER_ADMIN',userId:10,isSuperAdmin:true} as JWTPayload;
  const regular = {role:'SUPER_ADMIN',userId:11,isSuperAdmin:false} as JWTPayload;
  const employee = {role:'EMPLOYEE',userId:10,mustChangePassword:false} as JWTPayload;
  const owner = {role:'INSTITUTION',userId:1,institutionId:1,homeInstitutionId:1,rootInstitutionId:1} as JWTPayload;
  const delegated = {role:'INSTITUTION_ADMIN',userId:10,institutionId:1,homeInstitutionId:1,rootInstitutionId:1} as JWTPayload;
  for(const [id,isSuperAdmin] of [[10,true],[11,false],[12,true]] as const) await testDb.insert(schema.superAdmins).values({id,email:'admin-'+id+'@example.test',passwordHash:'fixture',securityQuestion:'Fixture question',securityAnswerHash:'fixture',isSuperAdmin});
  await testDb.insert(schema.employees).values({id:10,name:'Fixture Employee',email:'employee@example.test',passwordHash:'fixture',mustChangePassword:false});
  const actors=[root,regular,employee,owner,delegated,{role:'STAFF',userId:10,institutionId:1},{role:'STUDENT',userId:10,institutionId:1},{role:'PARENT',userId:10,institutionId:1},{...owner,campusReadOnly:true,institutionId:2},{...owner,mustChangePassword:true}] as JWTPayload[];
  const rbac=await load('src/lib/rbac.ts');let permissionCases=0,handlerCalls=0;
  for(const permission of ['platform.security','platform.accounts','platform.restore','platform.export','institution.security']) {
    const api=rbac.requireRole(['SUPER_ADMIN','EMPLOYEE','INSTITUTION','INSTITUTION_ADMIN','STAFF','STUDENT','PARENT'],async()=>{handlerCalls++;return Response.json({success:true})},{permission});
    for(const actor of actors) {
      state.session=actor;const response=await api(new NextRequest('http://localhost/api/fixture',{method:'POST'}),{});
      const expected=permission==='platform.security'?actor===root:permission==='institution.security'?actor===owner:actor===root||actor===regular;
      assert.equal(response.status,expected?200:403,permission+' '+actor.role);permissionCases++;
    }
    state.session=null;assert.equal((await api(new NextRequest('http://localhost/api/fixture',{method:'POST'}),{})).status,401);permissionCases++;
  }
  assert.equal(handlerCalls,8);
  assert.equal(await permissions.authorizeSecurityPermission({...regular,isSuperAdmin:true},'platform.security'),false,'forged/stale token root flag cannot override database');
  await testDb.update(schema.superAdmins).set({isSuperAdmin:false}).where(eq(schema.superAdmins.id,10));
  assert.equal(await permissions.authorizeSecurityPermission(root,'platform.security'),false,'demotion takes effect without waiting for token expiry');
  await testDb.update(schema.superAdmins).set({isSuperAdmin:true}).where(eq(schema.superAdmins.id,10));
  assert.equal(await permissions.authorizeSecurityPermission({...owner,institutionId:2},'institution.security'),false);
  evidence.push(permissionCases+' direct permission matrix cases, anonymous denial, forced-password/read-only denial, stale/forged Root flag rejection and immediate database demotion.');
  const actions=await load('src/app/actions/sa-actions.ts');
  const form=new FormData();form.set('name','New employee');form.set('email','newemployee@example.test');form.set('password','fixture-strong-password');
  state.session=employee;await assert.rejects(()=>actions.createEmployeeAction(form),/Forbidden/);
  state.session=regular;await actions.createEmployeeAction(form);
  const [createdEmployee]=await testDb.select().from(schema.employees).where(eq(schema.employees.email,'newemployee@example.test'));
  assert.equal(createdEmployee.mustChangePassword,true);
  await actions.deleteEmployeeAction(createdEmployee.id);
  assert.ok((await testDb.select().from(schema.employees).where(eq(schema.employees.id,createdEmployee.id)))[0].deletedAt,'deactivation preserves account and attribution');
  for(const actor of [regular,employee,owner,delegated]) {state.session=actor;await assert.rejects(()=>actions.createSuperAdminAction(form),/Forbidden/);await assert.rejects(()=>actions.deleteSuperAdminAction(10),/Forbidden/);await assert.rejects(()=>actions.updatePublicSiteBaseDomainAction('schools.example.org'),/Forbidden/);}
  state.session=root;await assert.rejects(()=>actions.deleteSuperAdminAction(12),/Root accounts/);await assert.rejects(()=>actions.deleteSuperAdminAction(10),/yourself/);
  const adminForm=new FormData();adminForm.set('email','new-admin@example.test');adminForm.set('password','fixture-strong-password');adminForm.set('securityQuestion','Fixture question');adminForm.set('securityAnswer','Fixture answer');adminForm.set('isSuperAdmin','true');
  await actions.createSuperAdminAction(adminForm);
  assert.equal((await testDb.select().from(schema.superAdmins).where(eq(schema.superAdmins.email,'new-admin@example.test')))[0].isSuperAdmin,false);
  evidence.push('Actual Server Actions reject employee account management and lower-role platform-admin/global-domain changes; Root cannot delete itself or another Root, injected Root fields are ignored, employee removal preserves the account.');
  const lifecycle=await load('src/lib/institution-status.ts');
  await assert.rejects(()=>lifecycle.changeInstitutionStatus(employee,1,'REJECTED'),/pending registrations/);
  const [pending]=await testDb.insert(schema.institutions).values({...rootValues,username:'pending-fixture',contactEmail:'pending@example.test',status:'PENDING'}).returning();
  await lifecycle.changeInstitutionStatus(employee,pending.id,'REJECTED');
  assert.equal((await testDb.select().from(schema.institutions).where(eq(schema.institutions.id,pending.id)))[0].status,'REJECTED');
  await lifecycle.changeInstitutionStatus(regular,1,'REJECTED');
  assert.ok((await testDb.select().from(schema.institutions).where(eq(schema.institutions.id,1)))[0],'rejection must never delete data');
  await lifecycle.changeInstitutionStatus(root,1,'APPROVED');
  const employeeActions=await load('src/app/actions/employee-actions.ts');
  for(const actor of actors){state.session=actor;await assert.rejects(()=>employeeActions.deleteInstitutionAction(1,'National College'),/disabled/);}
  const accountRoute=await load('src/app/api/institution/account/route.ts');state.session=owner;
  assert.equal((await accountRoute.DELETE(new NextRequest('http://localhost/api/institution/account',{method:'DELETE'}),{})).status,403);
  evidence.push('Employees may review pending registrations but cannot suspend active institutions; rejection preserves rows; all direct institution deletion paths are disabled.');
  const routeCases=[['src/app/api/sa/central-backup/settings/route.ts','GET',[regular,employee,owner,delegated]],['src/app/api/sa/central-backup/google-drive/connect/route.ts','GET',[regular,employee,owner,delegated]],['src/app/api/sa/central-backup/google-drive/callback/route.ts','GET',[regular,employee,owner,delegated]],['src/app/api/sa/restore-requests/[id]/route.ts','POST',[employee,owner,delegated]],['src/app/api/sa/institution-backups/[id]/download/route.ts','GET',[employee,owner,delegated]],['src/app/api/institution/settings/google-drive/route.ts','PUT',[root,regular,employee,delegated]],['src/app/api/institution/settings/google-drive/connect/route.ts','GET',[root,regular,employee,delegated]],['src/app/api/institution/restore-requests/[id]/route.ts','POST',[root,regular,employee,delegated]],['src/app/api/institution/export/route.ts','GET',[root,regular,employee,delegated]],['src/app/api/institution/signature/route.ts','PATCH',[root,regular,employee,delegated]],['src/app/api/institution/settings/payment-accounts/route.ts','POST',[root,regular,employee,delegated]],['src/app/api/course-streaming/route.ts','PUT',[root,regular,employee,delegated]]];
  let directCases=0;
  for(const [entry,method,deniedActors]of routeCases){const route=await load(entry as string);for(const actor of deniedActors as JWTPayload[]){state.session=actor;const response=await route[method as string](new NextRequest('http://localhost/api/fixture',{method:method as string}),{params:Promise.resolve({id:'1'})});assert.equal(response.status,403,entry+' '+actor.role);directCases++;}}
  const paymentAccounts = await load('src/app/api/institution/settings/payment-accounts/route.ts');
  state.session=owner;
  const createdAccount = await paymentAccounts.POST(new NextRequest('http://localhost/api/institution/settings/payment-accounts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({providerName:'Test Bank',accountTitle:'Institution',accountNumber:'TEST1234'}) }), {});
  assert.equal(createdAccount.status,201); const accountId=(await createdAccount.json()).account.id;
  state.session=delegated; assert.equal((await paymentAccounts.DELETE(new NextRequest('http://localhost/api/institution/settings/payment-accounts?id='+accountId,{method:'DELETE'}),{})).status,403);
  assert.equal((await paymentAccounts.GET(new NextRequest('http://localhost/api/institution/settings/payment-accounts'),{})).status,200);
  state.session=owner; assert.equal((await paymentAccounts.DELETE(new NextRequest('http://localhost/api/institution/settings/payment-accounts?id='+accountId,{method:'DELETE'}),{})).status,200);
  assert.equal((await paymentAccounts.DELETE(new NextRequest('http://localhost/api/institution/settings/payment-accounts?id='+accountId,{method:'DELETE'}),{})).status,404);
  evidence.push('Manual payment account creation/deletion and delegated-admin read-only permissions verified against actual settings routes.');

  const feesRoute = await load('src/app/api/institution/fees/route.ts');
  const feeRequest = (body: object) => new NextRequest('http://localhost/api/institution/fees', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  state.session=owner;
  const oneTimeHeadResponse=await feesRoute.POST(feeRequest({action:'createHead',name:'Fee head fixture',kind:'ONE_TIME'}),{});
  assert.equal(oneTimeHeadResponse.status,201);
  const feeHead=(await oneTimeHeadResponse.json()).head;
  assert.equal((await feesRoute.POST(feeRequest({action:'createHead',name:'Fee head fixture',kind:'RECURRING'}),{})).status,409);
  let billingMeta=await feesRoute.GET(new NextRequest('http://localhost/api/institution/fees?view=billing'),{});
  assert.equal(billingMeta.status,200); assert.equal((await billingMeta.json()).heads[0].kind,'ONE_TIME');
  state.session={...owner,userId:2,institutionId:2,homeInstitutionId:2};
  assert.equal((await feesRoute.POST(feeRequest({action:'removeHead',feeHeadId:feeHead.id}),{})).status,404);
  assert.equal((await feesRoute.POST(feeRequest({action:'updateHeadKind',feeHeadId:feeHead.id,kind:'RECURRING'}),{})).status,404);
  state.session=delegated;
  assert.equal((await feesRoute.POST(feeRequest({action:'updateHeadKind',feeHeadId:feeHead.id,kind:'RECURRING'}),{})).status,200);
  billingMeta=await feesRoute.GET(new NextRequest('http://localhost/api/institution/fees?view=billing'),{});
  assert.equal((await billingMeta.json()).heads[0].kind,'RECURRING');
  await testDb.insert(schema.classFeeItems).values({institutionId:1,classId:1,feeHeadId:feeHead.id,amount:1500});
  assert.equal((await feesRoute.POST(feeRequest({action:'removeHead',feeHeadId:feeHead.id}),{})).status,200);
  assert.equal((await testDb.select().from(schema.feeHeads).where(eq(schema.feeHeads.id,feeHead.id)))[0].isActive,false);
  assert.equal((await testDb.select().from(schema.classFeeItems).where(eq(schema.classFeeItems.feeHeadId,feeHead.id)))[0].amount,1500);
  state.session=owner;
  const restored=await feesRoute.POST(feeRequest({action:'createHead',name:'Fee head fixture',kind:'RECURRING'}),{});
  assert.equal(restored.status,201);assert.equal((await restored.json()).head.id,feeHead.id);
  evidence.push('Fee billing metadata includes one-time/recurring heads; kind conversion, duplicate prevention, removal preserving references, same-name restoration and tenant isolation pass against actual routes.');
  const submissionsRoute = await load('src/app/api/institution/fees/submissions/route.ts');
  const [proofStudent] = await testDb.insert(schema.students).values({institutionId:1,name:'Payment pagination student',loginRollNumber:'proof-roll',passwordHash:'fixture',classId:1,sectionId:1,yearOfJoining:2026,classRollNumber:'proof'}).returning();
  const proofInvoices = await testDb.insert(schema.feeInvoices).values(Array.from({length:25},(_,i)=>({institutionId:1,studentId:proofStudent.id,classIdAtIssue:1,classNameAtIssue:'Class A',sectionIdAtIssue:1,sectionNameAtIssue:'Whole Class',billingMonth:'2025-01',dueDate:'2025-01-10',subtotal:1500,totalAmount:1500}))).returning();
  await testDb.insert(schema.feePaymentSubmissions).values(proofInvoices.map((invoice,i)=>({institutionId:1,invoiceId:invoice.id,studentId:proofStudent.id,amount:1500,sourceBankName:'Easypaisa',transactionId:'proof-txn-'+i,proofFileKey:'private-proof-'+i,status:(i%2?'VERIFIED':'SUBMITTED') as 'VERIFIED'|'SUBMITTED',submittedAt:new Date('2025-01-01T00:00:00Z')})));
  await testDb.insert(schema.feePaymentSubmissions).values({institutionId:2,invoiceId:proofInvoices[0].id,studentId:proofStudent.id,amount:1500,sourceBankName:'Foreign',transactionId:'foreign-proof',proofFileKey:'secret-foreign-proof'});
  const proofGet = (query='') => submissionsRoute.GET(new NextRequest('http://localhost/api/institution/fees/submissions'+query),{});
  state.session=owner;
  const firstProofPage=await (await proofGet()).json();
  assert.equal(firstProofPage.total,25); assert.equal(firstProofPage.records.length,20); assert.equal(firstProofPage.totalPages,2);
  assert.equal(firstProofPage.records[0].transactionId,'proof-txn-24');
  assert.ok(firstProofPage.records.every((row: Record<string,unknown>) => !('proofFileKey' in row)));
  const secondProofPage=await (await proofGet('?page=2')).json();
  assert.equal(secondProofPage.records.length,5); assert.equal(secondProofPage.records[0].transactionId,'proof-txn-4');
  assert.equal((await (await proofGet('?page=999')).json()).page,2);
  assert.equal((await (await proofGet('?status=VERIFIED')).json()).total,12);
  assert.equal((await (await proofGet('?q=proof-txn-24')).json()).total,1);
  assert.equal((await (await proofGet('?q=%25')).json()).total,0);
  assert.equal((await proofGet('?page=-1')).status,400);
  assert.equal((await proofGet('?status=PAID')).status,400);
  state.session=delegated; assert.equal((await (await proofGet()).json()).total,25);
  state.session={...owner,institutionId:2,userId:2}; assert.equal((await (await proofGet()).json()).total,0);
  state.session=root; assert.equal((await proofGet()).status,403);
  evidence.push('Payment submissions: server pagination, stable tied-date order, page clamping, old-month history, status/search/literal wildcard filters, private-file omission, delegated access and tenant/role isolation pass.');
  state.session=owner;
  const filterClasses = await testDb.insert(schema.classes).values([{institutionId:1,name:'Class A'},{institutionId:1,name:'Class B'},{institutionId:2,name:'Foreign class'}]).returning();
  const filterSections = await testDb.insert(schema.sections).values(filterClasses.map(c=>({institutionId:c.institutionId,classId:c.id,name:'Section A'}))).returning();
  await testDb.update(schema.students).set({classId:filterClasses[0].id,sectionId:filterSections[0].id}).where(eq(schema.students.id,proofStudent.id));
  const [filterStudent] = await testDb.insert(schema.students).values({institutionId:1,name:'Class B student',loginRollNumber:'class-b-roll',passwordHash:'fixture',classId:filterClasses[1].id,sectionId:filterSections[1].id,yearOfJoining:2026,classRollNumber:'B1'}).returning();
  await testDb.insert(schema.feeInvoices).values({institutionId:1,studentId:filterStudent.id,classIdAtIssue:filterClasses[1].id,classNameAtIssue:'Class B',sectionIdAtIssue:filterSections[1].id,sectionNameAtIssue:'Section A',billingMonth:'2025-01',dueDate:'2025-01-10',subtotal:2000,totalAmount:2000,status:'PARTIAL'});
  const collectionGet = (query='') => feesRoute.GET(new NextRequest('http://localhost/api/institution/fees?view=collections&month=2025-01'+query),{});
  feeQueries.length = 0;
  const allCollections = await (await collectionGet()).json();
  assert.equal(feeQueries.length, 6);
  feeQueries.length = 0;
  const leanCollections = await (await collectionGet("&meta=0&summary=0")).json();
  assert.equal(feeQueries.length, 3);
  assert.ok(!("classes" in leanCollections)); assert.ok(!("summary" in leanCollections));
  assert.deepEqual(leanCollections.invoices, allCollections.invoices);
  assert.equal(allCollections.invoices.length,26); assert.equal(allCollections.pageSize,50);
  assert.deepEqual(allCollections.classes.map((c:{name:string})=>c.name),['Class A','Class B']);
  const classBCollections=await (await collectionGet('&classId='+filterClasses[1].id)).json();
  assert.equal(classBCollections.invoices.length,1); assert.equal(classBCollections.invoices[0].studentName,'Class B student');
  assert.equal((await (await collectionGet('&classId='+filterClasses[0].id+'&status=PARTIAL')).json()).invoices.length,0);
  assert.equal((await (await collectionGet('&classId='+filterClasses[1].id+'&q=class-b-roll&status=PARTIAL')).json()).invoices.length,1);
  assert.equal((await (await collectionGet('&classId='+filterClasses[2].id)).json()).invoices.length,0);
  assert.equal((await collectionGet('&classId=invalid')).status,400);
  assert.equal((await collectionGet('&classId=-1')).status,400);
  evidence.push('Collections class metadata and filtering combine with search/status, preserve the 50-row limit, reject malformed IDs and exclude foreign classes.');
  state.session=owner;
  await testDb.update(schema.feeInvoices).set({status:'PAID',paidAmount:1500}).where(eq(schema.feeInvoices.id,proofInvoices[0].id));
  await testDb.update(schema.feeInvoices).set({status:'PAID',paidAmount:2000}).where(eq(schema.feeInvoices.studentId,filterStudent.id));
  await testDb.insert(schema.feeInvoices).values({institutionId:1,studentId:filterStudent.id,classIdAtIssue:filterClasses[1].id,classNameAtIssue:'Class B',sectionIdAtIssue:filterSections[1].id,sectionNameAtIssue:'Section A',billingMonth:'2024-12',dueDate:'2024-12-10',subtotal:1800,totalAmount:1800,paidAmount:1800,status:'PAID'});
  assert.equal((await (await collectionGet()).json()).invoices.length,24);
  assert.equal((await (await collectionGet('&status=PAID')).json()).invoices.length,0);
  const paidGet=(query='')=>feesRoute.GET(new NextRequest('http://localhost/api/institution/fees?view=paid'+query),{});
  feeQueries.length = 0;
  const allPaid=await (await paidGet()).json();
  assert.equal(feeQueries.length, 5); assert.ok(!("summary" in allPaid));
  feeQueries.length = 0;
  const leanPaid = await (await paidGet("&meta=0")).json();
  assert.equal(feeQueries.length, 3); assert.deepEqual(leanPaid.invoices, allPaid.invoices);
  assert.equal(allPaid.invoices.length,3); assert.deepEqual(allPaid.invoices.map((row:{billingMonth:string})=>row.billingMonth),['2025-01','2025-01','2024-12']);
  assert.ok(allPaid.invoices.every((row:{status:string})=>row.status==='PAID'));
  assert.equal((await (await paidGet('&month=2024-12')).json()).invoices.length,1);
  assert.equal((await (await paidGet('&classId='+filterClasses[1].id+'&q=class-b-roll')).json()).invoices.length,2);
  assert.equal((await (await paidGet('&month=2024-12&classId='+filterClasses[0].id)).json()).invoices.length,0);
  assert.equal((await (await paidGet('&classId='+filterClasses[2].id)).json()).invoices.length,0);
  assert.equal((await paidGet('&month=2024-13')).status,400);
  evidence.push('Fully paid challans leave Collections; Paid history has all-month/month/class/search reads and newest-month-first ordering with tenant isolation.');
  await testDb.update(schema.students).set({ classId: filterClasses[0].id }).where(eq(schema.students.id, filterStudent.id));
  await testDb.update(schema.classes).set({ name: 'Renamed class B' }).where(eq(schema.classes.id, filterClasses[1].id));
  const issuedClass = await (await paidGet('&classId='+filterClasses[1].id)).json();
  assert.equal(issuedClass.invoices.length, 2); assert.ok(issuedClass.invoices.every((row: { className: string }) => row.className === 'Class B'));
  await testDb.update(schema.classes).set({ deletedAt: new Date() }).where(eq(schema.classes.id, filterClasses[1].id));
  const historicalChoices = await (await paidGet()).json();
  assert.ok(historicalChoices.classes.some((row: { id: number; name: string }) => row.id === filterClasses[1].id && row.name === 'Class B'));
  await testDb.insert(schema.feeInvoices).values({institutionId:1, studentId:proofStudent.id,billingMonth:'2023-01',dueDate:'2023-01-10',subtotal:1,totalAmount:1,paidAmount:1,status:'PAID'});
  assert.equal((await (await paidGet('&month=2023-01')).json()).invoices[0].className, 'Not recorded');
  const extras = await testDb.insert(schema.feeInvoices).values(Array.from({length:105},()=>({institutionId:1,studentId:proofStudent.id,classIdAtIssue:1,classNameAtIssue:'Class A',billingMonth:'2025-01',dueDate:'2025-01-10',subtotal:1500,totalAmount:1500,status:'PAID' as const,paidAmount:1500,createdAt:new Date('2025-01-01T00:00:00Z')}))).returning();
  const pageOne = await (await paidGet('&page=1')).json(), pageTwo = await (await paidGet('&page=2')).json(), pageThree = await (await paidGet('&page=3')).json();
  assert.equal(pageOne.pagination.total, 109); assert.equal(pageOne.invoices.length,50);assert.equal(pageTwo.invoices.length,50);assert.equal(pageThree.invoices.length,9);
  assert.equal(new Set([...pageOne.invoices,...pageTwo.invoices,...pageThree.invoices].map((row:{id:number})=>row.id)).size,109);
  assert.equal((await paidGet('&page=0')).status,400);assert.equal((await paidGet('&page=1.5')).status,400);
  await testDb.update(schema.feeInvoices).set({status:'DUE',paidAmount:0}).where(inArray(schema.feeInvoices.id,extras.slice(0,60).map(row=>row.id)));
  await testDb.update(schema.feeInvoices).set({status:'DUE',paidAmount:0}).where(eq(schema.feeInvoices.id,extras[1].id));
  const beforeCollect = await (await collectionGet()).json();
  const nextCollection = await (await collectionGet('&page=2')).json();
  assert.equal(beforeCollect.invoices.length,50);
  await testDb.update(schema.feeInvoices).set({status:'PAID',paidAmount:1500}).where(eq(schema.feeInvoices.id,beforeCollect.invoices[0].id));
  const afterCollect = await (await collectionGet()).json();assert.equal(afterCollect.invoices.length,50);assert.ok(afterCollect.invoices.some((row:{id:number})=>row.id===nextCollection.invoices[0].id));assert.equal(afterCollect.pagination.total,beforeCollect.pagination.total-1);assert.ok(!afterCollect.invoices.some((row:{id:number})=>row.id===beforeCollect.invoices[0].id));
  await testDb.insert(schema.classFeeItems).values({institutionId:1,classId:1,feeHeadId:feeHead.id,amount:1600});
  assert.equal((await feesRoute.POST(feeRequest({action:'generateMonth',billingMonth:'2099-01',dueDate:'2099-01-10'}),{})).status,200);
  const newInvoices = await (await feesRoute.GET(new NextRequest('http://localhost/api/institution/fees?view=collections&month=2099-01'),{})).json();
  assert.ok(newInvoices.invoices.length>0);assert.ok(newInvoices.invoices.every((row:{className:string})=>row.className!=='Not recorded'));
  evidence.push('Fee pagination covers 109 tied-date records without duplicates; issued class survives promotion/rename, legacy class stays unknown and generation records new snapshots.');
  await testDb.insert(schema.feeInvoices).values(Array.from({length:300},()=>({institutionId:1,studentId:proofStudent.id,billingMonth:'2099-02',billingKey:randomUUID(),billingKind:'ONE_TIME' as const,billingLabel:'Event',dueDate:'2099-02-10',subtotal:10000000,totalAmount:10000000})));
  const largeSummary=await (await feesRoute.GET(new NextRequest('http://localhost/api/institution/fees?view=collections&month=2099-02'),{})).json();
  assert.equal(largeSummary.summary.billed,3000000000);assert.equal(largeSummary.summary.outstanding,3000000000);assert.equal(largeSummary.summary.studentCount,1);assert.equal(largeSummary.summary.invoiceCount,300);
  const central=await load('src/app/api/sa/central-backup/settings/route.ts');state.session=root;assert.equal((await central.GET(new NextRequest('http://localhost/api/sa/central-backup/settings'),{})).status,200);
  const drive=await load('src/app/api/institution/settings/google-drive/route.ts');state.session=owner;assert.equal((await drive.GET(new NextRequest('http://localhost/api/institution/settings/google-drive'),{})).status,200);
  const institutionActions=await load('src/app/actions/institution-actions.ts');state.session=delegated;for(const fn of ['createInstitutionOwnerAction','createInstitutionAdminAction'])await assert.rejects(()=>institutionActions[fn](form),/Forbidden/);await assert.rejects(()=>institutionActions.deleteInstitutionAdminAction(10),/Forbidden/);
  evidence.push(directCases+' actual sensitive API denial cases across roles; allowed Root/owner reads; owner identity and delegated-admin Server Actions reject institution admins.');
  const {SignJWT}=await import('jose');const secret=new TextEncoder().encode(process.env.JWT_SECRET);
  const callback=await load('src/app/api/sa/central-backup/google-drive/callback/route.ts');state.session=root;
  const stateToken=async(subject:string)=>new SignJWT({purpose:'central-google-drive-setup'}).setProtectedHeader({alg:'HS256'}).setSubject(subject).setExpirationTime('15m').sign(secret);
  let response=await callback.GET(new NextRequest('http://localhost/api/sa/central-backup/google-drive/callback?code=fixture&state='+await stateToken('12')),{});assert.equal(response.status,400);
  response=await callback.GET(new NextRequest('http://localhost/api/sa/central-backup/google-drive/callback?code=fixture&state='+await stateToken('10')),{});assert.equal(response.status,200);assert.match(await response.text(),/fixture-central-secret/);
  evidence.push('Central OAuth callback rejects state issued for another Root account and accepts only its initiating authenticated Root; lower roles cannot obtain its token.');

  const freshUsers=await load('src/lib/user.ts');
  assert.equal(await freshUsers.verifyUserExistsFresh('INSTITUTION',1),true);
  assert.equal(await freshUsers.verifyUserExistsFresh('SUPER_ADMIN',11),true);
  assert.equal(await freshUsers.verifyUserExistsFresh('EMPLOYEE',10),true);
  await testDb.update(schema.employees).set({deletedAt:new Date()}).where(eq(schema.employees.id,10));
  assert.equal(await freshUsers.verifyUserExistsFresh('EMPLOYEE',10),false);
  await testDb.update(schema.employees).set({deletedAt:null}).where(eq(schema.employees.id,10));
  const [child]=await testDb.insert(schema.institutions).values({...rootValues,username:'fresh-child',contactEmail:'fresh-child@example.test',parentInstitutionId:1,campusName:'Green'}).returning();
  const [localAdmin]=await testDb.insert(schema.institutionAdmins).values({institutionId:child.id,name:'Local admin',email:'local-admin@example.test',passwordHash:'fixture'}).returning();
  assert.equal(await freshUsers.verifyUserExistsFresh('INSTITUTION_ADMIN',localAdmin.id,child.id),true);
  assert.equal(await freshUsers.verifyUserExistsFresh('INSTITUTION_ADMIN',localAdmin.id,1),false,'stale/foreign tenant claims fail');
  assert.equal(await freshUsers.verifyUserExistsFresh('INSTITUTION',child.id),true);
  await testDb.update(schema.institutions).set({status:'REJECTED'}).where(eq(schema.institutions.id,1));
  assert.equal(await freshUsers.verifyUserExistsFresh('INSTITUTION',1),false);
  assert.equal(await freshUsers.verifyUserExistsFresh('INSTITUTION',child.id),false);
  assert.equal(await freshUsers.verifyUserExistsFresh('INSTITUTION_ADMIN',localAdmin.id,child.id),false);
  await testDb.update(schema.institutions).set({status:'APPROVED'}).where(eq(schema.institutions.id,1));
  await testDb.delete(schema.institutionAdmins).where(eq(schema.institutionAdmins.id,localAdmin.id));
  assert.equal(await freshUsers.verifyUserExistsFresh('INSTITUTION_ADMIN',localAdmin.id,child.id),false);
  await testDb.delete(schema.superAdmins).where(eq(schema.superAdmins.id,11));
  assert.equal(await freshUsers.verifyUserExistsFresh('SUPER_ADMIN',11),false);
  evidence.push('Actual fresh authorization rejects deactivated/deleted accounts, foreign tenant claims and all child primary/delegated accounts under a suspended root, without cached-validity grace periods.');


  const resetRoute = await load('src/app/api/institution/reset-password/route.ts');
  state.session=delegated;
  const originalOwnerHash=(await testDb.select().from(schema.institutions).where(eq(schema.institutions.id,1)))[0].adminPasswordHash;
  for(const userType of ['INSTITUTION','INSTITUTION_ADMIN','EMPLOYEE','SUPER_ADMIN']) {
    const response=await resetRoute.POST(new NextRequest('http://localhost/api/institution/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userType,identifier:'main@example.test'})}));
    assert.equal(response.status,400);
  }
  assert.equal((await testDb.select().from(schema.institutions).where(eq(schema.institutions.id,1)))[0].adminPasswordHash,originalOwnerHash);
  evidence.push('The operational password-reset API refuses owner, delegated-admin, employee and platform-admin targets; the owner credential remains unchanged.');


  Object.assign(state,{liveVerifier:freshUsers.verifyUserExistsFresh,liveStudentVerifier:freshUsers.getFreshStudent});
  const [student]=await testDb.insert(schema.students).values({institutionId:1,name:'Fresh student',loginRollNumber:'fixture-fresh-student',passwordHash:'fixture',classId:1,sectionId:1,yearOfJoining:2026,classRollNumber:'01',academicStatus:'ACTIVE',isActive:true}).returning();
  const actualAuth=await load('src/lib/auth.ts');
  const studentToken=await new SignJWT({role:'STUDENT',userId:student.id,institutionId:1,studentAcademicStatus:'ACTIVE',graduatedStudentAccessAllowed:true}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('15m').sign(secret);
  const studentRequest=()=>new NextRequest('http://localhost/api/student/profile',{headers:{Authorization:'Bearer '+studentToken}});
  assert.equal((await actualAuth.getSessionFromRequest(studentRequest())).studentAcademicStatus,'ACTIVE');
  await testDb.update(schema.students).set({academicStatus:'GRADUATED'}).where(eq(schema.students.id,student.id));
  await testDb.update(schema.institutions).set({allowGraduatedStudentAccess:false}).where(eq(schema.institutions.id,1));
  assert.equal(await actualAuth.getSessionFromRequest(studentRequest()),null,'old signed active claims cannot bypass graduate access denial');
  await testDb.update(schema.institutions).set({allowGraduatedStudentAccess:true}).where(eq(schema.institutions.id,1));
  const graduateSession=await actualAuth.getSessionFromRequest(studentRequest());assert.equal(graduateSession.studentAcademicStatus,'GRADUATED');
  state.session=graduateSession;
  const graduateApi=rbac.requireRole(['STUDENT'],async()=>Response.json({success:true}));
  assert.equal((await graduateApi(new NextRequest('http://localhost/api/student/assignments'),{})).status,403);
  await testDb.update(schema.students).set({isActive:false}).where(eq(schema.students.id,student.id));
  assert.equal(await actualAuth.getSessionFromRequest(studentRequest()),null,'cached token cannot survive deactivation');
  assert.equal(actualAuth.getWarmSessionFromRequest(studentRequest()),null,'warm responses cannot bypass fresh authorization');
  await testDb.update(schema.students).set({isActive:true,academicStatus:'ACTIVE'}).where(eq(schema.students.id,student.id));
  assert.equal((await actualAuth.getSessionFromRequest(studentRequest())).studentAcademicStatus,'ACTIVE');
  await testDb.update(schema.students).set({deletedAt:new Date()}).where(eq(schema.students.id,student.id));
  assert.equal(await actualAuth.getSessionFromRequest(studentRequest()),null,'deleted student fails on the next request');
  await testDb.update(schema.students).set({deletedAt:null}).where(eq(schema.students.id,student.id));
  await testDb.update(schema.institutions).set({status:'PENDING'}).where(eq(schema.institutions.id,1));
  assert.equal(await actualAuth.getSessionFromRequest(studentRequest()),null,'unapproved institution fails on the next request');
  await testDb.update(schema.institutions).set({status:'APPROVED'}).where(eq(schema.institutions.id,1));
  const foreignStudentToken=await new SignJWT({role:'STUDENT',userId:student.id,institutionId:child.id}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('15m').sign(secret);
  assert.equal(await actualAuth.getSessionFromRequest(new NextRequest('http://localhost/api/student/profile',{headers:{Authorization:'Bearer '+foreignStudentToken}})),null,'wrong institution claim fails');
  assert.equal(await freshUsers.getFreshStudent(2147483647,1),null,'missing student fails');
  const cleanSession=await actualAuth.getSessionFromRequest(studentRequest());
  for(const property of ['name','classId','sectionId'])assert.equal(Object.hasOwn(cleanSession,property),false,'placement stays private: '+property);
  evidence.push('Actual signed-JWT request authentication rechecks current database state: cached active/student-access claims cannot bypass graduation limits or deactivation; synchronous warm transport cannot bypass the fresh gate.');


  const settingsPage=await load('src/app/(institution)/institution/settings/page.tsx');
  state.session=owner;
  let html=renderToStaticMarkup(await settingsPage.default());
  for(const label of ['Payment Gateways','Google Drive Backup','Data Management'])assert.ok(html.includes(label));
  state.session=delegated;html=renderToStaticMarkup(await settingsPage.default());
  for(const label of ['Payment Gateways','Google Drive Backup','Data Management','InstitutionSignatureUploader','CourseStreamingSettings'])assert.ok(!html.includes(label),label+' must not be exposed to delegated admins');
  assert.ok(!html.includes('DangerZone'));
  const backupsPage=await load('src/components/PlatformBackupsPage.tsx');
  state.session=employee;html=renderToStaticMarkup(await backupsPage.PlatformBackupsPage({basePath:'/employee/backups',searchParams:Promise.resolve({})}));
  assert.ok(!html.includes('CentralDatabaseBackupSettings'));assert.ok(!html.includes('InstitutionRestoreRequests'));assert.match(html,/data-download="false"/);
  state.session=root;html=renderToStaticMarkup(await backupsPage.PlatformBackupsPage({basePath:'/sa/backups',searchParams:Promise.resolve({})}));
  assert.ok(html.includes('CentralDatabaseBackupSettings'));assert.ok(html.includes('InstitutionRestoreRequests'));assert.match(html,/data-download="true"/);
  evidence.push('Actual server-rendered settings remove payment/backup/export/signature/streaming controls from delegated admins; actual employee backup page hides central security, restores and downloads while Root retains them. Client leaves are stubbed to inspect authorization props.');

  await writeFile('docs/role-boundaries-2026-10-06/role-results.json',JSON.stringify({passed:true,groups:evidence,permissionCases,directCases},null,2));
  console.log('Role boundary verification passed: '+permissionCases+' permission cases, '+directCases+' direct API cases and '+evidence.length+' integration groups.');
} finally {await memory.close();}
}
void main().catch(error=>{console.error(error);process.exitCode=1});
