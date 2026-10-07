import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NextRequest } from 'next/server.js';
import { PGlite } from '@electric-sql/pglite';
import { load, state, mocks } from './verify-employee-permissions.mjs';

state.predicates=[];
state.rows=[{id:1,name:'Fixture',value:0,status:'PENDING',studentId:3,staffId:4}];
mocks.db=`import { PgDialect } from 'drizzle-orm/pg-core';
 const state=globalThis.__employeePermissions;
 const chain={from:()=>chain,where:condition=>{state.predicates.push(new PgDialect().sqlToQuery(condition));return chain},
 limit:()=>chain,orderBy:()=>chain,offset:()=>chain,returning:()=>chain,
 values:value=>{state.writes.push(value);return chain},set:value=>{state.writes.push(value);return chain},
 onConflictDoUpdate:()=>chain,then:resolve=>resolve(state.rows)};
 export const db={select:()=>chain,insert:()=>chain,update:()=>chain,delete:()=>chain};`;
mocks.redis=`export const redis={status:'ready',del:async()=>1,unlink:async()=>1};
 export const getCachedOrFetch=async(_key,_ttl,fn)=>fn();
 export const invalidateStudentEnrichCache=async()=>{};`;
mocks['streaming-credentials'] += ` export const decryptStreamingCredentials=()=>null;`;
mocks.notifications=`export const processAnnouncementNotification=async()=>{}; export const createNotification=async()=>{};`;
mocks.cloudinary=`export default {api:{resource:async()=>({secure_url:'https://fixture/logo.png',format:'png',bytes:1000})}};`;
const roles=['INSTITUTION','INSTITUTION_ADMIN','EMPLOYEE','SUPER_ADMIN','STAFF','STUDENT','PARENT',null];
let cases=0;
function request(method,body){return new NextRequest('http://localhost/api/fixture?id=1',{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});}
async function matrix(entry,method,body,successStatus,ownerOnly=false){
 const handler=(await load(entry))[method];
 for(const role of roles){
  state.session=role?{role,userId:role==='INSTITUTION'?42:7,institutionId:42}:null;
  const response=await handler(request(method,body),{params:Promise.resolve({id:'1'})});
  const allowed=role==='INSTITUTION'||(!ownerOnly&&role==='INSTITUTION_ADMIN');
  assert.equal(response.status,allowed?successStatus:role?403:401,`${entry} ${method} ${role}`);
  cases++;
 }
}
for(const [entry,method,body,status] of [
 ['src/app/api/institution/admins/route.ts','GET',null,200],
 ['src/app/api/institution/holidays/route.ts','GET',null,200],
 ['src/app/api/institution/holidays/route.ts','POST',{date:'2026-10-05',name:'Holiday'},200],
 ['src/app/api/institution/holidays/route.ts','DELETE',{date:'2026-10-05'},200],
 ['src/app/api/institution/logo/route.ts','PATCH',{},400],
 ['src/app/api/institution/signature/route.ts','PATCH',{},400],
 ['src/app/api/institution/staff/route.ts','POST',{},400],
 ['src/app/api/institution/campuses/[id]/route.ts','DELETE',null,200],
 ['src/app/api/institution/staff/[id]/route.ts','DELETE',null,200],
 ['src/app/api/institution/public-events/route.ts','POST',{},400],
 ['src/app/api/institution/staff-attendance/route.ts','GET',null,400],
 ['src/app/api/institution/staff-attendance/route.ts','POST',{},400],
 ['src/app/api/institution/settings/google-drive/route.ts','PUT',{password:'fixture-password-12345'},200],
 ['src/app/api/institution/settings/google-drive/route.ts','DELETE',null,200],
 ['src/app/api/institution/restore-requests/[id]/route.ts','POST',{action:'approve',previewHash:'fixture'},200],
 ['src/app/api/institution/student-profile-requests/[id]/route.ts','PATCH',{status:'REJECTED',adminNote:'Test'},200],
 ['src/app/api/institution/staff-profile-requests/[id]/route.ts','PATCH',{status:'REJECTED',adminNote:'Test'},200],
]) await matrix(entry,method,body,status);
for(const [entry,method,body] of [
 ['src/app/api/institution/admins/route.ts','POST',{}],
 ['src/app/api/institution/admins/route.ts','DELETE',null],
 ['src/app/api/institution/settings/payment-gateway/route.ts','PUT',{}],
 ['src/app/api/institution/settings/payment-gateway/route.ts','GET',null],
 ['src/app/api/institution/settings/payment-gateway/route.ts','DELETE',{}],
 ['src/app/api/institution/settings/payment-gateway/test/route.ts','POST',{}],
]) {
 await matrix(entry,method,body,method==='GET'||(entry.includes('/admins/')&&method==='DELETE')?200:400,true);
}
const account=(await load('src/app/api/institution/account/route.ts')).DELETE;
state.session={role:'INSTITUTION_ADMIN',userId:7,institutionId:42};
assert.equal((await account(request('DELETE',{}))).status,401);
const actions=await load('src/app/actions/institution-actions.ts');
await assert.rejects(actions.createInstitutionAdminAction(new FormData()),/Unauthorized/);
await assert.rejects(actions.deleteInstitutionAdminAction(1),/Unauthorized/);
const classForm=new FormData();classForm.set('name','Class fixture');classForm.set('level','2');
assert.deepEqual(await actions.createClassAction(classForm),{success:true});
assert.ok(state.writes.some(value=>value.name==='Class fixture'&&value.institutionId===42));
const logo=(await load('src/app/api/institution/logo/route.ts')).PATCH;
assert.equal((await logo(request('PATCH',{publicId:'lms-uploads/tenant-42/institution-admin/user-7/logo'}))).status,200);
assert.ok(state.predicates.some(query=>query.sql.includes('institutions')&&query.params.includes(42)));
const deniedTenant=state.predicates.filter(query=>query.sql.includes('institution_id')&&query.params.includes(7));
assert.equal(deniedTenant.length,0,'admin identity must never be used as tenant ID');
assert.ok(state.predicates.some(query=>query.sql.includes('institution_id')&&query.params.includes(42)));
assert.ok(state.writes.some(value=>value.reviewedBy===null&&value.reviewedByInstitutionAdmin===7),'profile review retains actual admin attribution');
assert.ok(state.writes.some(value=>value.institutionId===42&&value.senderRole==='INSTITUTION_ADMIN'&&value.senderId===7));

function elements(value){
 if(!value||typeof value!=='object') return [];
 if(Array.isArray(value))return value.flatMap(elements);
 return [value,...elements(value.props?.children)];
}
const adminsPage=(await load('src/app/(institution)/institution/admins/page.tsx')).default;
const delegatedTree=elements(await adminsPage());
assert.equal(delegatedTree.some(element=>element.type==='form'||element.type?.name==='InstitutionAdminForm'),false);
state.session={role:'INSTITUTION',userId:42,institutionId:42};
assert.ok(elements(await adminsPage()).some(element=>element.type==='form'));
const settingsPage=(await load('src/app/(institution)/institution/settings/page.tsx')).default;
state.session={role:'INSTITUTION_ADMIN',userId:7,institutionId:42};
const adminSettings=elements(await settingsPage());
assert.equal(adminSettings.some(element=>['DangerZone','EasypaisaGatewaySettings','JazzCashGatewaySettings','HBLPayGatewaySettings'].includes(element.type?.name)),false);
assert.ok(adminSettings.some(element=>element.type?.name==='InstitutionRestoreRequests'));
state.session={role:'INSTITUTION',userId:42,institutionId:42};
const ownerSettings=elements(await settingsPage());
assert.ok(ownerSettings.some(element=>element.type?.name==='DangerZone'));
assert.ok(ownerSettings.some(element=>element.type?.name==='EasypaisaGatewaySettings'));
const memory=await PGlite.create();
try {
 await memory.exec(`CREATE TABLE institutions(id integer PRIMARY KEY); INSERT INTO institutions VALUES(42),(7);
 CREATE TABLE institution_admins(id integer PRIMARY KEY); INSERT INTO institution_admins VALUES(7);
 CREATE TABLE student_profile_change_requests(id integer PRIMARY KEY, reviewed_by integer REFERENCES institutions(id));
 CREATE TABLE staff_profile_change_requests(id integer PRIMARY KEY, reviewed_by integer REFERENCES institutions(id));`);
 const migration=await readFile(new URL('../drizzle/0063_institution_admin_profile_review.sql',import.meta.url),'utf8');
 await memory.exec(migration);await memory.exec(migration);
 for(const table of ['student_profile_change_requests','staff_profile_change_requests']){
  await memory.exec(`INSERT INTO ${table} VALUES(1,NULL,7)`);
  await assert.rejects(memory.exec(`INSERT INTO ${table} VALUES(2,NULL,99)`),/foreign key/);
 }
 await memory.exec('DELETE FROM institution_admins WHERE id=7');
 assert.equal((await memory.query('SELECT reviewed_by_institution_admin FROM student_profile_change_requests')).rows[0].reviewed_by_institution_admin,null);
 assert.equal((await memory.query('SELECT id FROM institutions WHERE id=7')).rows.length,1);
} finally {await memory.close();}
console.log(`Institution-admin parity passed: ${cases} API role cases, three owner-only exceptions, tenant predicates, review actor attribution and replay-safe migration/FKs.`);
