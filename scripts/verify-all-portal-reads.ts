/** Real SQL in isolated fixtures. No production writes, HTTP, k6 or tokens. */
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { JWTPayload } from '../src/lib/auth-types';

async function main() {
  process.env.NEXT_PHASE = 'phase-production-build';
  const { db, pool, readinessPool } = await import('../src/db');
  const schema = await import('../src/db/schema');
  const { redis } = await import('../src/lib/redis');
  const { getParentPortalContext, ParentChildAccessError } = await import('../src/lib/parent-access');
  const { getParentHomeData } = await import('../src/lib/parent-home-data');
  const { getInstitutionAcademicsData } = await import('../src/lib/institution-academics-data');
  const { getActiveApplicantAccount } = await import('../src/lib/admission-account');
  const { getVisibleAnnouncements } = await import('../src/lib/announcements');
  const { getPublicSiteBaseDomain, invalidatePublicSiteBaseDomainCache } = await import('../src/lib/public-site-domain');
  const { verifyUserExists, invalidateUserValidity } = await import('../src/lib/user');
  const memory = await PGlite.create();
  let queries = 0;
  const select = db.select, remove = db.delete;
  const store = new Map<string, string>();
  Object.assign(redis, { status: 'ready', get: async (key: string) => store.get(key) ?? null,
    setex: async (key: string, _ttl: number, value: string) => { store.set(key, value); },
    del: async (key: string) => Number(store.delete(key)) });
  try {
    for (const table of [schema.parentAccounts, schema.parentStudents, schema.institutions, schema.students,
      schema.classes, schema.sections, schema.campuses, schema.staff, schema.subjects, schema.staffAssignments,
      schema.attendances, schema.marks, schema.tests, schema.feeInvoices, schema.diaries, schema.announcements,
      schema.announcementReads, schema.admissionApplicantAccounts, schema.admissionApplications,
      schema.admissionEnrollments, schema.systemSettings]) {
      const config = getTableConfig(table);
      const columns = config.columns.map(column => `"${column.name}" ${column.columnType === 'PgEnumColumn' ? 'text' : column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`);
      await memory.exec(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
    }
    const fixture = drizzle(memory, { schema, logger: { logQuery: () => { queries++; } } });
    Object.assign(db, { select: fixture.select.bind(fixture), delete: fixture.delete.bind(fixture) });
    await memory.exec(`
      insert into institutions(id,name,username,status) values(1,'Fixture Institution','fixture','APPROVED'),(2,'Other','other','APPROVED');
      insert into parent_accounts(id,institution_id,name,email,password_hash,status) values(1,1,'Parent','fixture@example.invalid','fixture','ACTIVE'),(2,2,'Other Parent','other@example.invalid','fixture','ACTIVE');
      insert into classes(id,institution_id,name,level,is_final_class,is_graduated_archive) values(1,1,'Class One',1,true,false),(2,2,'Other Class',1,false,false),(3,1,'Archived',2,false,true);
      insert into sections(id,institution_id,class_id,name,class_teacher_id) values(10,1,1,'First',101),(20,2,2,'Other',201);
      insert into staff(id,institution_id,name,created_at,is_active) values(101,1,'Teacher','2026-01-01',true),(201,2,'Other Teacher','2026-01-01',true);
      insert into subjects(id,institution_id,name,code) values(1,1,'Math','M'),(2,2,'Other','O');
      insert into students(id,institution_id,name,login_roll_number,class_id,section_id,academic_status,created_at) values(102,1,'Child','FIX-102',1,10,'ACTIVE','2026-01-01'),(202,2,'Other Child','FIX-202',2,20,'ACTIVE','2026-01-01');
      insert into parent_students(id,institution_id,parent_id,student_id) values(1,1,1,102),(2,1,1,202);
      insert into staff_assignments(id,institution_id,staff_id,section_id,subject_id,day_of_week,start_time,end_time,is_break) values(1,1,101,10,1,2,'09:00','10:00',false);
      insert into attendances(id,institution_id,student_id,date,status) values(1,1,102,'2026-09-01','PRESENT'),(2,1,102,'2026-09-02','LATE'),(3,1,102,'2026-09-03','ABSENT'),(4,2,102,'2026-09-04','PRESENT');
      insert into tests(id,institution_id,class_id,section_id,subject_id,title,type,date,results_published_at) values(1,1,1,10,1,'Published','TEST','2026-09-20','2026-09-21'),(2,1,1,null,1,'Hidden','TEST','2026-09-21',null);
      insert into marks(id,institution_id,student_id,test_id,marks_obtained,total_marks) values(1,1,102,1,80,100),(2,1,102,2,99,100),(3,2,102,1,100,100);
      insert into fee_invoices(id,institution_id,student_id,total_amount,paid_amount,status) values(1,1,102,1000,100,'PARTIAL'),(2,2,102,5000,0,'DUE');
      insert into diaries(id,institution_id,class_id,subject_id,date,content) values(1,1,1,1,'2026-09-20','Fixture diary');
      insert into announcements(id,institution_id,title,content,sender_role,sender_id,target_type,target_class_id,target_section_id,created_at) values
        (1,1,'All','First','INSTITUTION',1,'ALL',null,null,'2026-09-21'),
        (2,1,'Class','Second','INSTITUTION',1,'CLASS',1,null,'2026-09-22'),
        (3,1,'Section','Third','INSTITUTION',1,'SECTION',null,10,'2026-09-23'),
        (4,2,'Other','Other','INSTITUTION',2,'ALL',null,null,'2026-09-24'),
        (5,1,'Too early','Old','INSTITUTION',1,'ALL',null,null,'2025-01-01'),
        (6,1,'Staff sender','Excluded','STAFF',101,'ALL',null,null,'2026-09-25');
      insert into admission_applicant_accounts(id,institution_id,session_version,guardian_email,password_hash) values(1,1,3,'applicant@example.invalid','fixture'),(2,1,4,'old@example.invalid','fixture'),(3,2,3,'other@example.invalid','fixture');
      insert into admission_applications(id,institution_id,applicant_id,status) values(1,1,1,'SUBMITTED'),(2,1,2,'ENROLLED'),(3,2,3,'SUBMITTED');
      insert into system_settings(id,public_site_base_domain) values(1,'fixture.invalid');
    `);
    const session = { role: 'PARENT', userId: 1, institutionId: 1 } as JWTPayload;
    queries = 0;
    const context = await getParentPortalContext(session, 102, { selectedOnly: true });
    assert.equal(queries, 1);
    assert.deepEqual(context.children.map(child => child.id), [102]);
    assert.equal(context.selectedChild?.className, 'Class One');
    assert.equal(context.selectedChild?.loginRollNumber, 'FIX-102');
    assert.equal(context.selectedChild?.createdAt.toISOString(), '2026-01-01T00:00:00.000Z');
    await assert.rejects(getParentPortalContext(session, 202), ParentChildAccessError);
    await assert.rejects(getParentPortalContext(session, 'abc'), ParentChildAccessError);
    await assert.rejects(getParentPortalContext({ ...session, institutionId: 2 }, 102), ParentChildAccessError);
    queries = 0;
    const home = await getParentHomeData(1, context.selectedChild!, { from: '2026-09-01', to: '2026-09-30' }, 2);
    assert.equal(queries, 1, 'Six home panels share one acquisition');
    assert.deepEqual(home.attendance, { total: 3, attended: 2 });
    assert.deepEqual(home.recentResults.map(row => [row.id, row.obtained, row.total, row.subject]), [[1, 80, 100, 'Math']]);
    assert.deepEqual(home.fees, [{ total: 1000, paid: 100 }]);
    assert.equal(home.todayClasses[0].teacher, 'Teacher');
    assert.equal(home.todayClasses[0].isBreak, false);
    assert.equal(home.diary[0].subject, 'Math');
    queries = 0;
    const academics = await getInstitutionAcademicsData(1);
    assert.equal(queries, 1);
    assert.deepEqual(academics.subjects, [{ id: 1, name: 'Math', code: 'M' }]);
    assert.deepEqual(academics.classes, [{ id: 1, name: 'Class One', level: 1, isFinalClass: true }]);
    assert.equal(academics.sections[0].classTeacherName, 'Teacher');
    await memory.exec("update staff set name='Changed Teacher' where id=101");
    assert.equal((await getInstitutionAcademicsData(1)).sections[0].classTeacherName, 'Changed Teacher', 'Configuration remains fresh');
    const applicant = { applicantId: 1, institutionId: 1, sessionVersion: 3, kind: 'ADMISSION_APPLICANT' } as const;
    queries = 0;
    assert.equal((await getActiveApplicantAccount(applicant, 1))?.id, 1);
    assert.equal(queries, 1);
    assert.equal(await getActiveApplicantAccount({ ...applicant, sessionVersion: 2 }, 1), null);
    assert.equal(await getActiveApplicantAccount(applicant, 2), null);
    assert.equal(await getActiveApplicantAccount({ ...applicant, applicantId: 2, sessionVersion: 4 }, 1), null);
    await memory.exec("update admission_applicant_accounts set session_version=4 where id=1");
    assert.equal(await getActiveApplicantAccount(applicant, 1), null, 'Revocation remains fresh');
    queries = 0;
    const staffSession = { role: 'STAFF', userId: 101, institutionId: 1 } as JWTPayload;
    assert.equal((await getVisibleAnnouncements(staffSession, 1, undefined, { includeReadStatus: false })).length, 1);
    assert.equal(queries, 1, 'Staff notices and assignment scope share one query');
    const allNotices = await getVisibleAnnouncements(staffSession, 30, undefined, { includeReadStatus: false });
    assert.deepEqual(allNotices.map(item => item.id), [3, 2, 1], 'Preview cache cannot truncate full notices; tenant, sender, dates and scope preserved');
    await memory.exec('delete from parent_students where parent_id=1');
    await assert.rejects(getParentPortalContext(session, 102), ParentChildAccessError, 'Unlinking a child immediately revokes access');
    invalidatePublicSiteBaseDomainCache();
    queries = 0;
    assert.ok((await Promise.all(Array.from({ length: 8 }, () => getPublicSiteBaseDomain()))).every(value => value === 'fixture.invalid'));
    assert.equal(queries, 1, 'Public/applicant domain miss is coalesced');
    queries = 0;
    await invalidateUserValidity('STAFF', 101);
    assert.ok((await Promise.all(Array.from({ length: 8 }, () => verifyUserExists('STAFF', 101)))).every(Boolean));
    assert.equal(queries, 1, 'Account validity miss is coalesced');
    await invalidateUserValidity('STAFF', 101);
    const validityKey = 'auth:user-validity:STAFF:101';
    store.set(validityKey, '1');
    const originalGet = redis.get;
    let captured!: () => void, release!: () => void;
    const reading = new Promise<void>(resolve => { captured = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    Object.assign(redis, { get: async (key: string) => {
      const value = store.get(key) ?? null; captured(); await held; return value;
    } });
    const pending = verifyUserExists('STAFF', 101);
    await reading;
    await memory.exec('update staff set is_active=false where id=101');
    await invalidateUserValidity('STAFF', 101);
    release(); await pending; redis.get = originalGet;
    assert.equal(await verifyUserExists('STAFF', 101), false, 'Invalidation during an in-flight read cannot restore revoked local validity');
    console.log('All-portal SQL checks passed: fresh parent/child guard 2→1, home panels 6→1, institution academics 3→1, applicant eligibility 2→1, staff notices 3→1, preview/full cache isolation, published results, tenant isolation, Date/JSON contracts, child unlink, session revocation and shared miss coalescing. Isolated fixtures only.');
  } finally {
    db.select = select; db.delete = remove;
    await memory.close();
    await Promise.all([pool.end(), readinessPool.end()]);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
