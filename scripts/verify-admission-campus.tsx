import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { SQL, eq } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest, NextResponse } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import * as schema from '../src/db/schema';

async function main() {
  process.env.NEXT_PUBLIC_APP_DOMAIN = 'nisaab360.app';
  const memory = await PGlite.create();
  const importQueries: Array<{ query: string; params: unknown[] }> = [];
  const testDb = drizzle(memory, { logger: { logQuery(query, params) { importQueries.push({ query, params }); } } });
  const state = { db: testDb, NextRequest, NextResponse, institutionId: 1, applicantId: 0, sessionVersion: 0, emails: [] as unknown[], parentTenant: 0 };
  (globalThis as typeof globalThis & { __admissionFixture: typeof state }).__admissionFixture = state;
  const mocks: Record<string, string> = {
    db: 'export const db=globalThis.__admissionFixture.db;',
    'next/server': 'export const NextRequest=globalThis.__admissionFixture.NextRequest;export const NextResponse=globalThis.__admissionFixture.NextResponse;export const after=()=>{};',
    'next/navigation': 'export const redirect=url=>{throw new Error("REDIRECT:"+url)};',
    'next/link': 'import {createElement} from "react";export default function Link({children,...props}){return createElement("a",props,children)}',
    rbac: `export const requireRole=(_roles,fn)=>async(req,context={})=>fn(req,{...context,session:{role:'INSTITUTION',userId:globalThis.__admissionFixture.institutionId,institutionId:globalThis.__admissionFixture.institutionId}});export const getTenantContext=session=>session.institutionId;`,
    'argon2-pool': `export const hashPassword=async password=>'fixture:'+password;export const verifyPassword=async(hash,password)=>hash==='fixture:'+password;`,
    'rate-limit': 'export const withRateLimit=async()=>({success:true});',
    'public-site-domain': `export const getPublicSiteBaseDomain=async()=>'nisaab360.app';`,
    'institution-tenant': `export const resolveInstitutionTenant=async slug=>slug==='school'?{kind:'active',tenant:{id:1,name:'School',admissionsEnabled:true}}:{kind:'not_found'};export const invalidateInstitutionTenantCache=async()=>{};`,
    'admission-auth': `export const getAdmissionSessionFromRequest=async()=>({applicantId:globalThis.__admissionFixture.applicantId,institutionId:1,sessionVersion:globalThis.__admissionFixture.sessionVersion});export const createAdmissionSessionToken=async()=>'fixture-token';export const setAdmissionSessionCookie=async()=>{};`,
    auth: 'export const revokeAllSessions=async()=>{};export const getSession=async()=>({role:"INSTITUTION",userId:globalThis.__admissionFixture.institutionId,institutionId:globalThis.__admissionFixture.institutionId});',
    user: 'export const invalidateUserValidity=async()=>{};',
    'email-outbox': 'export const enqueueEmail=async message=>{globalThis.__admissionFixture.emails.push(message)};',
    email: 'export const AdmissionCredentialEmail=()=>"fixture";export const AdmissionEnrollmentEmail=()=>"fixture";export const AdmissionUpdateEmail=()=>"fixture";export const ParentAccountActivationEmail=()=>"fixture";',
    audit: 'export const logAudit=async()=>{};',
    redis: 'export const invalidateInstitutionRosterCaches=async()=>{};',
    'parent-identity': 'export const prepareParentActivation=async()=>({temporaryPassword:"fixture",passwordHash:"fixture"});export const syncStudentGuardian=async(_tx,input)=>{globalThis.__admissionFixture.parentTenant=input.institutionId;return null};',
    cloudinary: 'export default {utils:{api_sign_request:()=>"fixture-signature"},api:{resource:async()=>({type:"authenticated",format:"pdf",bytes:100})}};',
  };
  async function load(entry: string) {
    const result = await build({ entryPoints: [entry], bundle: true, jsx: 'automatic', write: false, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent', plugins: [{ name: 'admission-campus-fixture', setup(builder) {
      builder.onResolve({ filter: /^(next\/(server|navigation|link)$|@\/db$|@\/lib\/|\.\/|\.\.\/)/ }, args => {
        const absolute = args.path.startsWith('@/') ? path.resolve('src', args.path.slice(2)) : path.resolve(args.resolveDir, args.path);
        const key = args.path.startsWith('next/') ? args.path : absolute === path.resolve('src/db') ? 'db' : path.dirname(absolute) === path.resolve('src/lib') ? path.basename(absolute).replace(/\.ts$/, '') : '';
        if (Object.hasOwn(mocks, key)) return { path: key, namespace: 'fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
    } }] });
    // Bundled fixture exports contain several differently typed route/component functions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loaded = { exports: {} as Record<string, any> };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(path.resolve('package.json')), loaded, loaded.exports);
    return loaded.exports;
  }
  try {
    const dialect = new PgDialect();
    for (const table of [schema.institutions, schema.campuses, schema.admissionCycles, schema.admissionOfferings, schema.admissionApplicantAccounts, schema.admissionApplications, schema.admissionDocumentRequests, schema.admissionAppointments, schema.admissionApplicationEvents, schema.admissionFeePayments, schema.admissionEnrollments, schema.students, schema.classes, schema.sections, schema.studentAdmissionCounters, schema.auditLogs, schema.admissionFeeProofs, schema.feePaymentSubmissions, schema.feeInvoices]) {
      const config = getTableConfig(table);
      const columns = config.columns.filter(column => config.name !== 'admission_applications' || !['intake_institution_id', 'campus_id', 'campus_name'].includes(column.name)).map(column => {
        const type = column.columnType === 'PgEnumColumn' ? 'text' : column.getSQLType();
        const value = column.default;
        const defaultValue = value === undefined ? '' : ' DEFAULT ' + (value instanceof SQL ? dialect.sqlToQuery(value).sql : typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : typeof value === 'object' ? `'${JSON.stringify(value)}'::jsonb` : String(value));
        return `"${column.name}" ${type}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}${defaultValue}`;
      });
      await memory.exec(`CREATE TABLE "${config.name}" (${columns.join(',')});`);
    }
    await memory.exec(`CREATE UNIQUE INDEX applicant_tenant ON admission_applicant_accounts(id,institution_id);
      CREATE UNIQUE INDEX applicant_email ON admission_applicant_accounts(institution_id,lower(guardian_email));
      CREATE UNIQUE INDEX offering_tenant ON admission_offerings(id,institution_id,cycle_id);
      CREATE UNIQUE INDEX docs_unique ON admission_document_requests(application_id,document_name);
      CREATE UNIQUE INDEX appointments_unique ON admission_appointments(application_id,type);
      CREATE UNIQUE INDEX fees_unique ON admission_fee_payments(application_id);
      CREATE UNIQUE INDEX counter_unique ON student_admission_counters(institution_id,admission_year);
      CREATE UNIQUE INDEX enrolled_unique ON admission_enrollments(application_id);
      CREATE UNIQUE INDEX application_tenant ON admission_applications(id,institution_id);
      CREATE UNIQUE INDEX student_tenant ON students(id,institution_id);
      ALTER TABLE admission_enrollments ADD FOREIGN KEY(application_id,institution_id) REFERENCES admission_applications(id,institution_id);
      ALTER TABLE admission_enrollments ADD FOREIGN KEY(student_id,institution_id) REFERENCES students(id,institution_id);`);
    for (const [id, parentId, campusName, status] of [[1, null, 'Main', 'APPROVED'], [2, 1, 'Green', 'APPROVED'], [3, 1, 'West', 'APPROVED'], [4, null, 'Other', 'APPROVED'], [5, 1, 'Suspended', 'REJECTED']] as const) {
      await testDb.insert(schema.institutions).values({ id, parentInstitutionId: parentId, campusName, name: 'School', type: 'SCHOOL', username: id === 1 ? 'school' : `campus${id}`, country: 'Pakistan', city: 'Lahore', address: 'Fixture address', contactEmail: `office${id}@example.test`, contactPhone: '03000000000', registrationNumber: `fixture-${id}`, pricingPlan: 'STANDARD', logoKey: 'fixture', proofDocumentKey: 'fixture', adminPasswordHash: 'fixture', status, publicSlug: id === 1 ? 'school' : null });
      await testDb.insert(schema.campuses).values({ id, institutionId: id, name: campusName });
    }
    await testDb.insert(schema.admissionCycles).values({ id: 1, institutionId: 1, name: 'Fall', academicYear: '2026', status: 'OPEN', requiredDocuments: [{ name: 'A', instructions: null }], admissionFeeAmount: 1000 });
    await testDb.insert(schema.admissionOfferings).values({ id: 1, institutionId: 1, cycleId: 1, title: 'Class 9' });
    await testDb.insert(schema.admissionApplicantAccounts).values({ id: 1, institutionId: 1, guardianEmail: 'legacy@example.test', passwordHash: 'fixture:legacy' });
    await memory.exec("SELECT setval(pg_get_serial_sequence('admission_applicant_accounts','id'),1);");
    await memory.exec(`INSERT INTO admission_applications(institution_id,cycle_id,offering_id,applicant_id,application_number,student_name,date_of_birth,gender,guardian_name,guardian_email,guardian_phone)
      VALUES(1,1,1,1,'LEGACY','Legacy Student','2010-01-01','MALE','Parent','legacy@example.test','03000000000');`);
    const migration = await readFile('drizzle/0067_admission_campus_intake.sql', 'utf8');
    await memory.exec(migration);
    const legacy = (await testDb.select().from(schema.admissionApplications))[0];
    assert.equal(legacy.intakeInstitutionId, 1); assert.equal(legacy.campusId, 1); assert.equal(legacy.campusName, 'Main');
    await memory.exec(migration);
    assert.deepEqual((await testDb.select().from(schema.admissionApplications))[0], legacy);
    console.log('PASS: additive migration preserves legacy applications and replays safely');

    await memory.exec('CREATE TABLE nisaab360_supplemental_migrations (name text PRIMARY KEY, sha256 text NOT NULL);');
    const availabilityMigration = await readFile('drizzle/0068_admission_campus_availability.sql', 'utf8');
    await memory.exec(availabilityMigration);
    assert.deepEqual((await testDb.select().from(schema.admissionCycleCampuses)).map(row => [row.campusId, row.isOpen]), [[1, true]]);
    await memory.exec("INSERT INTO nisaab360_supplemental_migrations VALUES ('0068_admission_campus_availability.sql','fixture');");
    await testDb.update(schema.admissionCycleCampuses).set({ isOpen: false });
    await memory.exec(availabilityMigration);
    assert.equal((await testDb.select().from(schema.admissionCycleCampuses))[0].isOpen, false);
    await testDb.insert(schema.admissionCycles).values({ id: 2, institutionId: 1, name: 'Future intake', academicYear: '2027', status: 'OPEN' });
    await memory.exec(availabilityMigration);
    assert.equal((await testDb.select().from(schema.admissionCycleCampuses).where(eq(schema.admissionCycleCampuses.cycleId, 2))).length, 0);
    await testDb.delete(schema.admissionCycles).where(eq(schema.admissionCycles.id, 2));
    await testDb.update(schema.admissionCycleCampuses).set({ isOpen: true });
    console.log('PASS: availability migration preserves only existing Main intake and never reopens a closed campus');

    const campusService = await load('src/lib/admission-campus.ts');
    await testDb.insert(schema.campuses).values({ id: 6, institutionId: 1, name: 'Awaiting workspace setup' });
    assert.deepEqual((await campusService.listAdmissionCampuses(1)).map((campus: { id: number }) => campus.id), [1, 2, 3]);
    assert.equal(campusService.selectAdmissionCampus(await campusService.listAdmissionCampuses(4)).id, 4);
    const publicRoute = await load('src/app/api/public/admissions/route.ts');
    const body = { offeringId: 1, campusId: 2, studentName: 'Campus Student', dateOfBirth: '2010-01-01', gender: 'MALE', guardianName: 'Guardian', guardianEmail: 'parent@example.test', guardianPhone: '03001234567', previousInstitution: '', previousClassMarks: '', medicalInformation: '', notes: '' };
    const request = (url: string, method: string, data?: unknown) => new NextRequest(url, { method, headers: { host: 'school.nisaab360.app', 'content-type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const availability = await load('src/app/api/institution/admissions/campuses/route.ts');
    assert.deepEqual((await campusService.listOpenAdmissionCampuses(1, 1)).map((campus: { id: number }) => campus.id), [1]);
    assert.equal((await publicRoute.POST(request('http://school.nisaab360.app/api/public/admissions', 'POST', body))).status, 409);
    state.institutionId = 2;
    assert.equal((await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: true, campusId: 1 }))).status, 400);
    assert.equal((await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: true }))).status, 200);
    state.institutionId = 3;
    assert.equal((await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: true }))).status, 200);
    state.institutionId = 4;
    assert.equal((await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: true }))).status, 404);
    await assert.rejects(testDb.insert(schema.admissionCycleCampuses).values({ cycleId: 1, campusId: 4, institutionId: 4, isOpen: true }));
    state.institutionId = 1;
    for (const campusId of [null, 4, 5, 6, 999]) assert.equal((await publicRoute.POST(request('http://school.nisaab360.app/api/public/admissions', 'POST', { ...body, campusId }))).status, 400);
    const submitted = await publicRoute.POST(request('http://school.nisaab360.app/api/public/admissions', 'POST', body));
    assert.equal(submitted.status, 201, await submitted.clone().text());
    const receipt = await submitted.json();
    const [application] = await testDb.select().from(schema.admissionApplications).where(eq(schema.admissionApplications.applicationNumber, receipt.application.applicationNumber));
    assert.equal(application.institutionId, 2); assert.equal(application.intakeInstitutionId, 1); assert.equal(application.campusId, 2); assert.equal(application.campusName, 'Green');
    assert.equal((await publicRoute.POST(request('http://school.nisaab360.app/api/public/admissions', 'POST', { ...body, campusId: 3 }))).status, 409);
    state.applicantId = application.applicantId!;
    const accountService = await load('src/lib/admission-account.ts');
    const account = await accountService.getActiveApplicantAccount({ applicantId: state.applicantId, institutionId: 1, sessionVersion: 0 }, 1);
    assert.equal(account.id, state.applicantId);
    console.log('PASS: required multi-campus selection rejects unrelated/inactive campuses; campus queue and public account stay separate');

    const queue = await load('src/app/api/institution/admissions/applications/route.ts');
    const detail = await load('src/app/api/institution/admissions/applications/[id]/route.ts');
    const ctx = { params: Promise.resolve({ id: String(application.id) }) };
    for (const institutionId of [1, 3, 4]) {
      state.institutionId = institutionId;
      const list = await (await queue.GET(request('http://localhost/api/institution/admissions/applications', 'GET'))).json();
      assert.ok(!list.applications.some((row: { id: number }) => row.id === application.id));
      assert.equal((await detail.PATCH(request('http://localhost/api/institution/admissions/applications/id', 'PATCH', { action: 'startReview' }), ctx)).status, 404);
    }
    state.institutionId = 2;
    assert.equal((await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: false }))).status, 200);
    assert.equal((await publicRoute.POST(request('http://school.nisaab360.app/api/public/admissions', 'POST', { ...body, studentName: 'Stale Form Student' }))).status, 409);
    assert.equal((await queue.POST(request('http://localhost/api/institution/admissions/applications', 'POST', { ...body, studentName: 'Closed Offline Student' }))).status, 409);
    const list = await (await queue.GET(request('http://localhost/api/institution/admissions/applications?meta=1', 'GET'))).json();
    assert.equal(list.applications[0].campusName, 'Green'); assert.equal(list.cycles[0].id, 1);
    assert.equal((await detail.PATCH(request('http://localhost/api/institution/admissions/applications/id', 'PATCH', { action: 'resetApplicantPassword' }), ctx)).status, 403);
    assert.equal((await detail.PATCH(request('http://localhost/api/institution/admissions/applications/id', 'PATCH', { action: 'startReview' }), ctx)).status, 200);
    assert.equal((await testDb.select().from(schema.admissionApplicantAccounts).where(eq(schema.admissionApplicantAccounts.id, state.applicantId)))[0].passwordHash, account.passwordHash);
    const login = await load('src/app/api/public/admissions/auth/login/route.ts');
    assert.equal((await login.POST(request('http://school.nisaab360.app/api/public/admissions/auth/login', 'POST', { email: body.guardianEmail, password: receipt.applicantAccount.temporaryPassword }))).status, 200);
    console.log('PASS: only selected campus reviews; shared credential reset is denied; original public applicant login works');
    assert.equal((await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: true }))).status, 200);
    console.log('PASS: campus closure blocks stale online and offline entry while existing reviews and login continue');

    const bulkSubmission = await publicRoute.POST(request('http://school.nisaab360.app/api/public/admissions', 'POST', { ...body, campusId: 3, studentName: 'Second Campus Student' }));
    assert.equal(bulkSubmission.status, 201);
    state.institutionId = 3;
    const bulk = await load('src/app/api/institution/admissions/applications/bulk-accept/route.ts');
    assert.equal((await bulk.POST(request('http://localhost/api/institution/admissions/applications/bulk-accept', 'POST', { confirm: true }))).status, 200);
    assert.equal((await testDb.select().from(schema.admissionApplicantAccounts).where(eq(schema.admissionApplicantAccounts.id, state.applicantId)))[0].passwordHash, account.passwordHash);
    state.institutionId = 2;
    assert.equal((await queue.POST(request('http://localhost/api/institution/admissions/applications', 'POST', { ...body, studentName: 'Manual Student', campusId: 3 }))).status, 400);
    assert.equal((await queue.POST(request('http://localhost/api/institution/admissions/applications', 'POST', { ...body, studentName: 'Manual Student', guardianEmail: 'manual@example.test' }))).status, 201);
    const config = await load('src/app/api/institution/admissions/route.ts');
    const configBefore = { cycles: await testDb.select().from(schema.admissionCycles), offerings: await testDb.select().from(schema.admissionOfferings) };
    assert.equal((await config.GET(request('http://localhost/api/institution/admissions', 'GET'))).status, 403);
    for (const action of ['createCycle', 'updateCycle', 'deleteCycle', 'createOffering', 'updateOffering', 'deleteOffering', 'setCycleStatus', 'archiveCycle', 'restoreCycle']) {
      assert.equal((await config.POST(request('http://localhost/api/institution/admissions', 'POST', { action, cycleId: 1, offeringId: 1, institutionId: 1, status: 'CLOSED' }))).status, 403);
    }
    assert.deepEqual({ cycles: await testDb.select().from(schema.admissionCycles), offerings: await testDb.select().from(schema.admissionOfferings) }, configBefore);
    const intakeOptions = await (await config.GET(request('http://localhost/api/institution/admissions?intake=1', 'GET'))).json();
    assert.equal(intakeOptions.campuses[0].id, 2); assert.equal(intakeOptions.offerings[0].id, 1);
    assert.equal((await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: false }))).status, 200);
    const closedOptions = await (await config.GET(request('http://localhost/api/institution/admissions?intake=1', 'GET'))).json();
    assert.equal(closedOptions.cycles.length, 0); assert.equal(closedOptions.offerings.length, 0);
    console.log('PASS: bulk acceptance preserves shared credentials; offline entry uses own campus and inherited offering');

    process.env.CLOUDINARY_CLOUD_NAME = 'fixture'; process.env.CLOUDINARY_API_KEY = 'fixture'; process.env.CLOUDINARY_API_SECRET = 'fixture';
    const [document] = await testDb.select().from(schema.admissionDocumentRequests).where(eq(schema.admissionDocumentRequests.applicationId, application.id));
    const documentRoute = await load('src/app/api/public/admissions/documents/[id]/route.ts');
    const docCtx = { params: Promise.resolve({ id: String(document.id) }) };
    const signature = await documentRoute.POST(request('http://school.nisaab360.app/api/public/admissions/documents/id', 'POST', { action: 'signature' }), docCtx);
    assert.equal(signature.status, 200); assert.equal((await signature.json()).folder, `admission-documents/2/${application.id}/${document.id}`);
    state.applicantId = 1;
    assert.equal((await documentRoute.POST(request('http://school.nisaab360.app/api/public/admissions/documents/id', 'POST', { action: 'signature' }), docCtx)).status, 401);
    state.applicantId = application.applicantId!;
    assert.equal((await documentRoute.POST(request('http://school.nisaab360.app/api/public/admissions/documents/id', 'POST', { action: 'complete', publicId: `admission-documents/2/${application.id}/${document.id}/fixture`, format: 'pdf', resourceType: 'image' }), docCtx)).status, 200);
    await testDb.update(schema.admissionApplications).set({ status: 'FEE_PENDING' }).where(eq(schema.admissionApplications.id, application.id));
    await testDb.insert(schema.admissionFeePayments).values({ institutionId: 2, applicationId: application.id, amount: 1000, instructions: 'Fixture', status: 'PENDING' });
    await testDb.update(schema.institutions).set({ feePaymentMethods: [{ id: 'fixture-easypaisa', providerName: 'Easypaisa', accountTitle: 'Fixture', accountNumber: '03000000000', qrUrl: null }] }).where(eq(schema.institutions.id, 2));
    const feeRoute = await load('src/app/api/public/admissions/fees/[applicationId]/route.ts');
    const feeCtx = { params: Promise.resolve({ applicationId: String(application.id) }) };
    const feeSignature = await feeRoute.POST(request('http://school.nisaab360.app/api/public/admissions/fees/id', 'POST', { action: 'signature' }), feeCtx);
    assert.equal(feeSignature.status, 200); assert.equal((await feeSignature.json()).folder, `admission-fees/2/${application.id}`);
    assert.equal((await feeRoute.POST(request('http://school.nisaab360.app/api/public/admissions/fees/id', 'POST', { action: 'complete', publicId: `admission-fees/2/${application.id}/fixture`, format: 'pdf', resourceType: 'image', payerReference: 'fixture-ref', payerSourceBank: 'fixture-bank', paymentAccountId: 'fixture-easypaisa' }), feeCtx)).status, 200);
    assert.equal((await testDb.select().from(schema.admissionApplications).where(eq(schema.admissionApplications.id, application.id)))[0].status, 'FEE_VERIFICATION');
    console.log('PASS: document and payment proofs authorize through public account but store only in selected campus; wrong applicant denied');

    await testDb.insert(schema.classes).values([{ id: 1, institutionId: 1, name: '9', level: 9 }, { id: 2, institutionId: 2, name: '9', level: 9 }]);
    await testDb.update(schema.admissionApplications).set({ status: 'FEE_VERIFIED' }).where(eq(schema.admissionApplications.id, application.id));
    await testDb.update(schema.admissionFeePayments).set({ status: 'VERIFIED' }).where(eq(schema.admissionFeePayments.applicationId, application.id));
    const enrollment = { action: 'enrollStudent', campusId: 2, classId: 2, sectionId: null, classRollNumber: '01', yearOfJoining: 2026 };
    for (const invalid of [{ ...enrollment, campusId: 1 }, { ...enrollment, classId: 1 }]) assert.equal((await detail.PATCH(request('http://localhost/api/institution/admissions/applications/id', 'PATCH', invalid), ctx)).status, 400);
    const enrolled = await detail.PATCH(request('http://localhost/api/institution/admissions/applications/id', 'PATCH', enrollment), ctx);
    assert.equal(enrolled.status, 200, await enrolled.clone().text());
    const student = (await testDb.select().from(schema.students))[0];
    assert.equal(student.institutionId, 2); assert.equal(student.campusId, 2); assert.equal(student.classId, 2);
    assert.match(student.loginRollNumber, /@school\.green\.nisaab360\.app$/);
    assert.equal(state.parentTenant, 2);
    assert.ok(await accountService.getActiveApplicantAccount({ applicantId: state.applicantId, institutionId: 1, sessionVersion: 0 }, 1));
    console.log('PASS: enrollment, class, campus, parent link and permanent login namespace belong to selected workspace; seven-day portal handover remains available');

    const offline = await load('src/app/sites/[slug]/[[...path]]/OfflineAdmissionForm.tsx');
    const html = renderToStaticMarkup(offline.OfflineAdmissionForm({ campusName: 'Green', institution: { name: 'School', logoUrl: null }, offerings: [{ id: 1, title: '9' }], accentColor: '#123456', cycle: { name: 'Fall', academicYear: '2026', requiredDocuments: [] } }));
    assert.match(html, /Campus name:.*Green/); assert.ok(!html.includes('<select'));
    const online = await load('src/app/sites/[slug]/[[...path]]/AdmissionIntakeForms.tsx');
    const props = { institution: { name: 'School', logoUrl: null }, offerings: [{ id: 1, title: '9' }], accentColor: '#123456', today: '2026-10-07', cycle: { name: 'Fall', academicYear: '2026', requiredDocuments: [] } };
    const multi = renderToStaticMarkup(createElement(online.AdmissionIntakeForms, { ...props, campuses: [{ id: 1, name: 'Main' }, { id: 2, name: 'Green' }] }));
    const single = renderToStaticMarkup(createElement(online.AdmissionIntakeForms, { ...props, campuses: [{ id: 1, name: 'Main' }] }));
    assert.match(multi, /Select Campus/); assert.match(multi, /name="campusId"/); assert.ok(!single.includes('Select Campus')); assert.match(single, /Campus name:.*Main/);
    state.institutionId = 3;
    await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: false }));
    assert.deepEqual((await campusService.listOpenAdmissionCampuses(1, 1)).map((campus: { id: number }) => campus.id), [1]);
    const automatic = await publicRoute.POST(request('http://school.nisaab360.app/api/public/admissions', 'POST', { ...body, campusId: null, studentName: 'Auto Campus Student', guardianEmail: 'auto@example.test' }));
    assert.equal(automatic.status, 201); assert.equal((await automatic.json()).application.campusName, 'Main');
    state.institutionId = 1;
    await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: false }));
    assert.equal((await campusService.listOpenAdmissionCampuses(1, 1)).length, 0);
    assert.equal((await publicRoute.POST(request('http://school.nisaab360.app/api/public/admissions', 'POST', { ...body, campusId: null, studentName: 'No Campus Student' }))).status, 409);
    console.log('PASS: closed campuses disappear from offline choices; enrollment continues after closure; one open campus auto-selects and zero open campuses reject intake');
    await assert.rejects(memory.exec(`UPDATE admission_applications SET institution_id=4,campus_id=4 WHERE id=${application.id}`), /Admission campus/);
    await assert.rejects(memory.exec(`UPDATE admission_applications SET campus_id=1 WHERE id=${application.id}`), /foreign key/);
    console.log('PASS: online multiple/single-campus UI, printable campus name, and database family/campus constraints');
    const admissionsPage = await load('src/app/(institution)/institution/admissions/page.tsx');
    const pageProps = (section?: string) => ({ searchParams: Promise.resolve({ section }) });
    for (const institutionId of [2, 3]) {
      state.institutionId = institutionId;
      const campusPage = renderToStaticMarkup(await admissionsPage.default(pageProps()));
      assert.ok(!campusPage.includes('Admissions setup')); assert.ok(!campusPage.includes('section=setup'));
      assert.match(campusPage, /Campus admissions/); assert.match(campusPage, /Review applications/); assert.match(campusPage, /Offline applications/);
      await assert.rejects(admissionsPage.default(pageProps('setup')), /REDIRECT:\/institution\/admissions\?section=status/);
    }
    state.institutionId = 1;
    const mainPage = renderToStaticMarkup(await admissionsPage.default(pageProps()));
    assert.match(mainPage, /Admissions setup/); assert.match(mainPage, /section=setup/);
    assert.equal((await config.GET(request('http://localhost/api/institution/admissions', 'GET'))).status, 200);
    assert.equal((await config.POST(request('http://localhost/api/institution/admissions', 'POST', { action: 'setCycleStatus', cycleId: 1, status: 'CLOSED' }))).status, 200);
    const archiveMigration = await readFile('drizzle/0072_admission_cycle_archive.sql', 'utf8');
    await memory.exec(archiveMigration);
    const frozenMigration = await readFile('drizzle/0073_fee_snapshots_and_archive_write_guards.sql', 'utf8');
    await memory.exec(frozenMigration);
    const historyTables = [schema.admissionApplicantAccounts, schema.admissionApplications, schema.admissionDocumentRequests, schema.admissionAppointments, schema.admissionApplicationEvents, schema.admissionFeePayments, schema.admissionFeeProofs, schema.admissionEnrollments, schema.students];
    const snapshot = () => Promise.all(historyTables.map(table => testDb.select().from(table)));
    const beforeArchive = await snapshot();
    assert.equal((await config.POST(request('http://localhost/api/institution/admissions', 'POST', { action: 'deleteCycle', cycleId: 1 }))).status, 409);
    assert.equal((await config.POST(request('http://localhost/api/institution/admissions', 'POST', { action: 'deleteOffering', offeringId: 1 }))).status, 409);
    await assert.rejects(memory.exec('DELETE FROM admission_cycles WHERE id=1'), /archive it instead/);
    await assert.rejects(memory.exec('DELETE FROM admission_offerings WHERE id=1'), /cannot be deleted/);
    await testDb.update(schema.admissionCycles).set({ status: 'OPEN' }).where(eq(schema.admissionCycles.id, 1));
    await testDb.update(schema.admissionCycleCampuses).set({ isOpen: true });
    const archive = () => config.POST(request('http://localhost/api/institution/admissions', 'POST', { action: 'archiveCycle', cycleId: 1 }));
    assert.equal((await archive()).status, 200);
    assert.deepEqual(await snapshot(), beforeArchive);
    for (const table of ['admission_applications', 'admission_document_requests', 'admission_appointments', 'admission_application_events', 'admission_fee_payments', 'admission_fee_proofs', 'admission_enrollments']) {
      const rows = await memory.query<{ count: number }>('SELECT count(*)::int AS count FROM '+table);
      if (rows.rows[0].count) await assert.rejects(memory.exec('UPDATE '+table+' SET id=id'), /Restore this archived/);
    }
    await assert.rejects(memory.exec("INSERT INTO admission_appointments(institution_id,application_id,type,scheduled_at,location) VALUES(2,"+application.id+",'TEST',now(),'Fixture')"), /Restore this archived/);
    state.institutionId = 2;
    assert.equal((await detail.PATCH(request('http://localhost/api/institution/admissions/applications/id','PATCH',{action:'startReview'}),ctx)).status,409);
    const frozenBulk = await (await bulk.POST(request('http://localhost/api/institution/admissions/applications/bulk-accept','POST',{confirm:true}))).json();
    assert.equal(frozenBulk.accepted,0);
    assert.equal((await documentRoute.POST(request('http://school.nisaab360.app/api/public/admissions/documents/id','POST',{action:'signature'}),docCtx)).status,409);
    assert.equal((await feeRoute.POST(request('http://school.nisaab360.app/api/public/admissions/fees/id','POST',{action:'signature'}),feeCtx)).status,409);
    assert.deepEqual(await snapshot(),beforeArchive);
    state.institutionId = 1;
    const archivedCycle = (await testDb.select().from(schema.admissionCycles))[0];
    assert.equal(archivedCycle.status, 'CLOSED'); assert.ok(archivedCycle.archivedAt);
    assert.ok((await testDb.select().from(schema.admissionCycleCampuses)).every(row => !row.isOpen));
    assert.equal((await (await availability.GET(request('http://localhost/api/institution/admissions/campuses', 'GET'))).json()).cycles.length, 0);
    assert.equal((await availability.POST(request('http://localhost/api/institution/admissions/campuses', 'POST', { cycleId: 1, isOpen: true }))).status, 404);
    assert.equal((await (await config.GET(request('http://localhost/api/institution/admissions', 'GET'))).json()).cycles.length, 0);
    assert.equal((await (await config.GET(request('http://localhost/api/institution/admissions?archived=1&search=Fall', 'GET'))).json()).total, 1);
    assert.equal((await config.POST(request('http://localhost/api/institution/admissions', 'POST', { action: 'setCycleStatus', cycleId: 1, status: 'OPEN' }))).status, 409);
    await assert.rejects(memory.exec("UPDATE admission_cycles SET status='OPEN' WHERE id=1"), /archive_closed/);
    assert.equal((await archive()).status, 200); assert.equal((await testDb.select().from(schema.auditLogs)).length, 1);
    state.institutionId = 2;
    const activeQueue = await (await queue.GET(request('http://localhost/api/institution/admissions/applications', 'GET'))).json();
    assert.equal(activeQueue.pagination.total, 0);
    const historyQueue = await (await queue.GET(request('http://localhost/api/institution/admissions/applications?history=1&cycle=1', 'GET'))).json();
    assert.ok(historyQueue.applications.some((row: { status: string }) => row.status === 'ENROLLED'));
    assert.ok(historyQueue.applications.every((row: { campusId: number }) => row.campusId === 2));
    state.institutionId = 4;
    assert.equal((await queue.GET(request('http://localhost/api/institution/admissions/applications?history=1&cycle=1', 'GET'))).status, 404);
    assert.equal((await config.POST(request('http://localhost/api/institution/admissions', 'POST', { action: 'restoreCycle', cycleId: 1 }))).status, 404);
    state.institutionId = 1;
    await memory.exec(archiveMigration); await memory.exec(frozenMigration); assert.deepEqual(await snapshot(), beforeArchive);
    const archiveService = await load('src/lib/admission-cycle-archive.ts');
    await memory.exec("ALTER TABLE audit_logs ADD CONSTRAINT fixture_audit_failure CHECK(action <> 'RESTORE_ADMISSION_CYCLE')");
    await assert.rejects(archiveService.setAdmissionCycleArchived({ institutionId: 1, cycleId: 1, archived: false, actorId: 1, actorRole: 'INSTITUTION', ip: '127.0.0.1' }));
    assert.ok((await testDb.select().from(schema.admissionCycles))[0].archivedAt);
    await memory.exec('ALTER TABLE audit_logs DROP CONSTRAINT fixture_audit_failure');
    assert.equal((await config.POST(request('http://localhost/api/institution/admissions', 'POST', { action: 'restoreCycle', cycleId: 1 }))).status, 200);
    const restored = (await testDb.select().from(schema.admissionCycles))[0];
    assert.equal(restored.archivedAt, null); assert.equal(restored.status, 'CLOSED');
    assert.ok((await testDb.select().from(schema.admissionCycleCampuses)).every(row => !row.isOpen));
    assert.deepEqual(await snapshot(), beforeArchive); assert.equal((await testDb.select().from(schema.auditLogs)).length, 2);
    console.log('PASS: archive/restore retains all history, closes campus intake, filters active lists, includes enrolled history, guards ownership/deletion, replays safely and rolls back on audit failure');
    const parser = await load('src/lib/student-import-csv.ts');
    const parsedCsv = parser.parseStudentCsv('firstName,lastName,notes\n"Ada, A.",Example,"first line\nsecond line"\n');
    assert.equal(parsedCsv.errors.length,0);assert.equal(parsedCsv.rows[0].values.firstname,'Ada, A.');assert.equal(parsedCsv.rows[0].values.notes,'first line\nsecond line');
    assert.ok(parser.parseStudentCsv('a,b\n"unclosed,b').errors.length>0);assert.ok(parser.parseStudentCsv('a,a\n1,2').errors.length>0);assert.ok(parser.parseStudentCsv('a,b\n1,2,3').errors.length>0);
    await memory.exec('CREATE UNIQUE INDEX import_roll_unique ON students(institution_id,class_id,class_roll_number)');
    const importer = await load('src/app/api/institution/students/import/route.ts');
    const csvHeader='firstName,lastName,campusId,classId,gender,yearOfJoining,classRollNumber\n';
    const importCsv = (csv:string) => {const form=new FormData();form.set('file',new File([csv],'students.csv',{type:'text/csv'}));return importer.POST(new NextRequest('http://localhost/api/institution/students/import',{method:'POST',body:form}));};
    const importSnapshot=()=>Promise.all([testDb.select().from(schema.students),testDb.select().from(schema.sections),testDb.select().from(schema.studentAdmissionCounters)]);
    const beforeImport=await importSnapshot();
    const duplicateCsv=await importCsv(csvHeader+'First,Example,1,1,MALE,2026,TEST-1\nSecond,Example,1,1,MALE,2026,TEST-1\n');
    assert.equal(duplicateCsv.status,409);const duplicateErrors=(await duplicateCsv.json()).errors;assert.ok(duplicateErrors.some((e:string)=>e.startsWith('Row 2:')));assert.ok(duplicateErrors.some((e:string)=>e.startsWith('Row 3:')));assert.deepEqual(await importSnapshot(),beforeImport);
    const validCsv=await importCsv(csvHeader+'"Ada, A.",Example,1,1,FEMALE,2026,TEST-1\n');assert.equal(validCsv.status,201,await validCsv.clone().text());
    const afterImport=await importSnapshot();
    const storedDuplicate=await importCsv(csvHeader+'Third,Example,1,1,MALE,2026,TEST-2\nFourth,Example,1,1,MALE,2026,TEST-1\n');assert.equal(storedDuplicate.status,409);assert.match((await storedDuplicate.json()).errors[0],/Row 3:.*already exists/);assert.deepEqual(await importSnapshot(),afterImport);
    await memory.exec("ALTER TABLE students ADD CONSTRAINT fixture_import_failure CHECK(name <> 'Reject Insert')");
    const failedInsert=await importCsv(csvHeader+'Reject,Insert,1,1,MALE,2026,TEST-2\n');assert.equal(failedInsert.status,500);assert.deepEqual(await importSnapshot(),afterImport);
    await memory.exec('ALTER TABLE students DROP CONSTRAINT fixture_import_failure');
    importQueries.length = 0;
    const bulkCsv = await importCsv(csvHeader + Array.from({ length: 500 }, (_, i) => `Bulk,Student${i},1,1,MALE,2026,BULK-${i}\n`).join(''));
    assert.equal(bulkCsv.status, 201, await bulkCsv.clone().text());
    assert.equal((await bulkCsv.json()).imported, 500);
    assert.equal(importQueries.filter(row => row.query.startsWith('select') && row.params.includes('Whole Class')).length, 1);
    console.log('PASS: 500-row single-class import resolves Whole Class once');
    console.log('PASS: CSV quoting/multiline/malformed headers, exact within-file/existing duplicate rows, successful import and full insert/sequence rollback');
    console.log('PASS: only Main renders setup and changes shared configuration; child setup URLs redirect, all configuration actions deny with unchanged data, campus intake/review/offline flow remains available');
  } finally { await memory.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
