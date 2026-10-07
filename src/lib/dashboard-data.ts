import { and, asc, desc, eq, gt, isNotNull, isNull, or, sql, type SQLWrapper } from 'drizzle-orm';
import { db } from '@/db';
import { assignments, classes, marks, sections, staff, staffAssignments, students, subjects, submissions, tests } from '@/db/schema';

// Aggregate bounded child queries in Postgres rather than acquiring a client
// for each query. Field aliases preserve the existing API's camelCase JSON.
export function jsonRows<T>(query: SQLWrapper) {
  return sql<T[]>`coalesce((select json_agg(row_to_json(child)) from (${query}) child), '[]'::json)`;
}

type StaffPeriod = { dayOfWeek: number; startTime: string; endTime: string; subjectName: string | null; className: string | null; sectionName: string | null };
type AssignmentPreview = { id: number; title: string; dueAt: string };
type StaffAssignmentPreview = AssignmentPreview & { className: string | null; sectionName: string | null; subjectName: string | null };

function prepareStaffDashboard() {
  const tenantId = sql.placeholder('tenantId');
  const staffId = sql.placeholder('staffId');
  const dayOfWeek = sql.placeholder('dayOfWeek');
  const now = sql.placeholder('now');
  const timetable = db.select({
    dayOfWeek: sql`${staffAssignments.dayOfWeek}`.as('dayOfWeek'),
    startTime: sql`${staffAssignments.startTime}`.as('startTime'),
    endTime: sql`${staffAssignments.endTime}`.as('endTime'),
    subjectName: sql`${subjects.name}`.as('subjectName'),
    className: sql`${classes.name}`.as('className'),
    sectionName: sql`${sections.name}`.as('sectionName'),
  }).from(staffAssignments)
    .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
    .leftJoin(sections, eq(staffAssignments.sectionId, sections.id))
    .leftJoin(classes, eq(sections.classId, classes.id))
    .where(and(eq(staffAssignments.staffId, staffId), eq(staffAssignments.institutionId, tenantId), eq(staffAssignments.dayOfWeek, dayOfWeek)));
  const previewSection = db.select({ sectionId: staffAssignments.sectionId }).from(staffAssignments)
    .where(and(eq(staffAssignments.staffId, staffId), eq(staffAssignments.institutionId, tenantId)))
    .orderBy(asc(staffAssignments.sectionId)).limit(1);
  const upcoming = db.select({
    id: assignments.id, title: assignments.title,
    dueAt: sql`to_char(${assignments.dueAt}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.as('dueAt'),
    className: sql`${classes.name}`.as('className'),
    sectionName: sql`${sections.name}`.as('sectionName'),
    subjectName: sql`${subjects.name}`.as('subjectName'),
  }).from(assignments)
    .innerJoin(classes, eq(assignments.classId, classes.id))
    .leftJoin(sections, eq(assignments.sectionId, sections.id))
    .leftJoin(subjects, eq(assignments.subjectId, subjects.id))
    .where(and(eq(assignments.institutionId, tenantId), eq(assignments.staffId, staffId),
      sql`${assignments.sectionId} = (${previewSection})`, gt(assignments.dueAt, now)))
    .orderBy(assignments.dueAt).limit(3);
  return db.select({ name: staff.name,
    timetable: jsonRows<StaffPeriod>(timetable),
    assignments: jsonRows<StaffAssignmentPreview>(upcoming),
  }).from(staff).where(and(eq(staff.id, staffId), eq(staff.institutionId, tenantId))).limit(1).prepare('');
}

let staffDashboard: ReturnType<typeof prepareStaffDashboard> | undefined;
export async function fetchStaffDashboardData(tenantId: number, staffId: number, dayOfWeek: number, now = new Date()) {
  const [row] = await (staffDashboard ??= prepareStaffDashboard()).execute({ tenantId, staffId, dayOfWeek, now });
  return row;
}

function prepareStudentDashboard() {
  const tenantId = sql.placeholder('tenantId');
  const studentId = sql.placeholder('studentId');
  const pending = db.select({ id: assignments.id, title: assignments.title,
    dueAt: sql`to_char(${assignments.dueAt}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.as('dueAt') })
    .from(assignments)
    .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, studentId), eq(submissions.institutionId, tenantId)))
    .where(and(eq(assignments.institutionId, tenantId), eq(assignments.classId, students.classId),
      or(eq(assignments.sectionId, students.sectionId), isNull(assignments.sectionId)), isNull(submissions.id)))
    .orderBy(assignments.dueAt).limit(5);
  const latest = db.select({ marksObtained: sql`${marks.marksObtained}`.as('marksObtained'), totalMarks: sql`${marks.totalMarks}`.as('totalMarks') })
    .from(marks).innerJoin(tests, eq(marks.testId, tests.id))
    .where(and(eq(marks.studentId, studentId), eq(marks.institutionId, tenantId), isNotNull(tests.resultsPublishedAt)))
    .orderBy(desc(tests.date), desc(marks.id)).limit(1);
  return db.select({
    name: students.name, classId: students.classId, sectionId: students.sectionId,
    campusId: students.campusId, createdAt: students.createdAt,
    academicStatus: students.academicStatus, expoPushToken: students.expoPushToken,
    assignments: sql<AssignmentPreview[]>`case when ${students.academicStatus} = 'GRADUATED' then '[]'::json else ${jsonRows<AssignmentPreview>(pending)} end`,
    latestMark: sql<{ marksObtained: number; totalMarks: number } | null>`case when ${students.academicStatus} = 'GRADUATED' then null else (select row_to_json(child) from (${latest}) child) end`,
  }).from(students).where(and(eq(students.id, studentId), eq(students.institutionId, tenantId))).limit(1).prepare('');
}

let studentDashboard: ReturnType<typeof prepareStudentDashboard> | undefined;
export async function fetchStudentDashboardData(tenantId: number, studentId: number) {
  const [row] = await (studentDashboard ??= prepareStudentDashboard()).execute({ tenantId, studentId });
  return row;
}
