/** Real SQL against an isolated PostgreSQL-compatible fixture; no production writes. */
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';

async function main() {
  process.env.NEXT_PHASE = 'phase-production-build';
  const { db, pool, readinessPool } = await import('../src/db');
  const schema = await import('../src/db/schema');
  const { fetchStaffDashboardData, fetchStudentDashboardData } = await import('../src/lib/dashboard-data');
  const memory = await PGlite.create();
  let queries = 0;
  const originalSelect = db.select;
  try {
    for (const table of [schema.staff, schema.students, schema.staffAssignments, schema.subjects,
      schema.sections, schema.classes, schema.assignments, schema.submissions, schema.marks, schema.tests]) {
      const config = getTableConfig(table);
      const columns = config.columns.map(column => `"${column.name}" ${column.columnType === 'PgEnumColumn' ? 'text' : column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`);
      await memory.exec(`CREATE TABLE "${config.name}" (${columns.join(',')})`);
    }
    const fixture = drizzle(memory, { schema, logger: { logQuery: () => { queries++; } } });
    Object.assign(db, { select: fixture.select.bind(fixture) });
    const now = new Date('2026-09-28T12:00:00.000Z');
    const due = new Date('2026-10-10T12:30:00.000Z');
    // Only the columns exercised by these queries need values; fixture tables
    // deliberately omit unrelated constraints and relationships.
    await memory.exec(`
      insert into staff(id,institution_id,name) values (101,1,'Fixture Teacher'),(201,2,'Other Teacher'),(301,1,'Unassigned Teacher');
      insert into students(id,institution_id,name,class_id,section_id,academic_status) values
        (102,1,'Fixture Student',1,10,'ACTIVE'),(103,1,'Graduate Student',1,10,'GRADUATED'),(202,2,'Other Student',2,99,'ACTIVE');
      insert into classes(id,institution_id,name) values(1,1,'Class One'),(2,2,'Other Class');
      insert into sections(id,institution_id,class_id,name) values(10,1,1,'First'),(20,1,1,'Second'),(99,2,2,'Other');
      insert into subjects(id,institution_id,name) values(1,1,'Math');
      insert into staff_assignments(id,institution_id,staff_id,section_id,subject_id,day_of_week,start_time,end_time) values
        (1,1,101,20,1,1,'09:00','10:00'),(2,1,101,10,1,1,'10:00','11:00'),
        (3,1,101,10,1,2,'11:00','12:00'),(4,2,101,99,1,1,'12:00','13:00');
      insert into assignments(id,institution_id,staff_id,class_id,section_id,title,due_at) values
        (1,1,101,1,10,'First section','2026-10-10 12:30:00'),
        (2,1,101,1,20,'Other section','2026-10-11 12:30:00'),
        (3,1,101,1,null,'Whole class','2026-10-12 12:30:00'),
        (4,2,101,1,10,'Other tenant','2026-10-09 12:30:00'),
        (5,1,101,1,10,'Submitted','2026-10-13 12:30:00'),
        (6,1,201,1,10,'Another teacher','2026-10-14 12:30:00'),
        (7,1,101,1,10,'Past assignment','2026-09-01 12:30:00');
      insert into submissions(id,institution_id,assignment_id,student_id) values(1,1,5,102),(2,2,1,102),(3,1,6,202);
      insert into tests(id,institution_id,date,results_published_at) values
        (1,1,'2026-09-01','2026-09-02'),(2,1,'2026-09-20',null),(3,2,'2026-09-21','2026-09-22');
      insert into marks(id,institution_id,student_id,test_id,marks_obtained,total_marks) values
        (1,1,102,1,70,100),(2,1,102,1,80,100),(3,1,102,2,99,100),(4,2,102,3,100,100);
    `);

    queries = 0;
    const staff = await fetchStaffDashboardData(1, 101, 1, now);
    assert.equal(queries, 1, 'Staff identity, timetable, section selection and assignments need one database round trip');
    assert.equal(staff?.name, 'Fixture Teacher');
    assert.equal(staff.timetable.length, 2, 'Only this staff member, tenant and weekday are included');
    assert.ok(staff.timetable.every(row => row.dayOfWeek === 1 && row.subjectName === 'Math'));
    assert.deepEqual(staff.assignments.map(row => row.id), [1, 5], 'Preview still uses only the first assigned section, future dates and this teacher');
    assert.equal(new Date(staff.assignments[0].dueAt).toISOString(), due.toISOString());
    assert.equal(staff.assignments[0].className, 'Class One');
    assert.equal(staff.assignments[0].sectionName, 'First');
    assert.deepEqual((await fetchStaffDashboardData(1, 301, 1, now))?.assignments, []);
    assert.equal(await fetchStaffDashboardData(2, 101, 1, now), undefined);
    assert.equal(await fetchStaffDashboardData(1, -1, 1, now), undefined);

    queries = 0;
    const student = await fetchStudentDashboardData(1, 102);
    assert.equal(queries, 1, 'Student identity, pending assignments and latest published mark need one round trip');
    assert.equal(student?.name, 'Fixture Student');
    assert.deepEqual(student.assignments.map(row => row.id), [7, 1, 3, 6], 'Preserve pending assignment order, class-wide visibility and student/tenant-scoped submission exclusion');
    assert.deepEqual(student.latestMark, { marksObtained: 80, totalMarks: 100 }, 'Unpublished/cross-tenant results excluded; newest mark wins ties');
    const graduate = await fetchStudentDashboardData(1, 103);
    assert.equal(graduate?.academicStatus, 'GRADUATED');
    assert.deepEqual(graduate.assignments, []);
    assert.equal(graduate.latestMark, null);
    assert.equal(await fetchStudentDashboardData(2, 102), undefined);
    assert.equal(await fetchStudentDashboardData(1, -1), undefined);
    assert.equal((await fetchStudentDashboardData(2, 202))?.latestMark, null);

    // The existing caps still apply when there are more matching records.
    await memory.exec(`insert into assignments(id,institution_id,staff_id,class_id,section_id,title,due_at)
      select n,1,101,1,10,'Additional',timestamp '2026-10-15 12:30:00' + n * interval '1 day' from generate_series(20,25) n`);
    assert.equal((await fetchStaffDashboardData(1, 101, 1, now))?.assignments.length, 3);
    assert.equal((await fetchStudentDashboardData(1, 102))?.assignments.length, 5);
    console.log('Dashboard SQL checks passed: one round trip per personal payload, tenant isolation, periods/section selection, pending submissions, published marks, graduates, missing accounts, dates and preview caps. Isolated fixture only; no HTTP, k6 or fixture token generation.');
  } finally {
    db.select = originalSelect;
    await memory.close();
    await Promise.all([pool.end(), readinessPool.end()]);
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
