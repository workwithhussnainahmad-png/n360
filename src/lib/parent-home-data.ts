import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { attendances, diaries, feeInvoices, marks, staff, staffAssignments, subjects, tests } from '@/db/schema';
import type { ParentPortalContext } from './parent-access';
import { jsonRows } from './dashboard-data';

/** Aggregate the six home panels without occupying six pool slots per parent. */
export async function getParentHomeData(institutionId: number, child: NonNullable<ParentPortalContext['selectedChild']>,
  period: { from: string; to: string }, dayOfWeek = new Date().getDay()) {
  const attendance = db.select({
    total: sql<number>`count(*)::int`.as('total'),
    attended: sql<number>`count(*) filter (where ${attendances.status} in ('PRESENT', 'LATE'))::int`.as('attended'),
  }).from(attendances).where(and(eq(attendances.institutionId, institutionId), eq(attendances.studentId, child.id),
    gte(attendances.date, period.from), lte(attendances.date, period.to)));
  const results = db.select({ id: marks.id, title: tests.title, type: tests.type, date: tests.date,
    subject: sql<string>`${subjects.name}`.as('subject'),
    obtained: sql<number>`${marks.marksObtained}`.as('obtained'), total: sql<number>`${marks.totalMarks}`.as('total'),
  }).from(marks).innerJoin(tests, eq(marks.testId, tests.id)).innerJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(and(eq(marks.institutionId, institutionId), eq(marks.studentId, child.id), isNotNull(tests.resultsPublishedAt),
      gte(tests.date, period.from), lte(tests.date, period.to))).orderBy(desc(tests.date), desc(marks.id)).limit(10);
  const fees = db.select({ total: sql<number>`${feeInvoices.totalAmount}`.as('total'), paid: sql<number>`${feeInvoices.paidAmount}`.as('paid') })
    .from(feeInvoices).where(and(eq(feeInvoices.institutionId, institutionId), eq(feeInvoices.studentId, child.id),
      inArray(feeInvoices.status, ['DUE', 'PARTIAL']))).limit(24);
  const todayClasses = db.select({ id: staffAssignments.id,
    start: sql<string>`${staffAssignments.startTime}`.as('start'), end: sql<string>`${staffAssignments.endTime}`.as('end'),
    subject: sql<string | null>`${subjects.name}`.as('subject'), teacher: sql<string | null>`${staff.name}`.as('teacher'),
    isBreak: sql<boolean>`${staffAssignments.isBreak}`.as('isBreak'),
  }).from(staffAssignments).leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id)).leftJoin(staff, eq(staffAssignments.staffId, staff.id))
    .where(and(eq(staffAssignments.institutionId, institutionId), eq(staffAssignments.sectionId, child.sectionId),
      eq(staffAssignments.dayOfWeek, dayOfWeek))).orderBy(asc(staffAssignments.startTime));
  const diary = db.select({ id: diaries.id, date: diaries.date, content: diaries.content,
    subject: sql<string | null>`${subjects.name}`.as('subject') }).from(diaries).leftJoin(subjects, eq(diaries.subjectId, subjects.id))
    .where(and(eq(diaries.institutionId, institutionId), eq(diaries.classId, child.classId),
      gte(diaries.date, period.from), lte(diaries.date, period.to))).orderBy(desc(diaries.date), desc(diaries.id)).limit(10);
  const upcomingTests = db.select({ id: tests.id, title: tests.title, type: tests.type, date: tests.date,
    subject: sql<string>`${subjects.name}`.as('subject') }).from(tests).innerJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(and(eq(tests.institutionId, institutionId), eq(tests.classId, child.classId),
      or(eq(tests.sectionId, child.sectionId), isNull(tests.sectionId)), gte(tests.date, period.from), lte(tests.date, period.to)))
    .orderBy(asc(tests.date)).limit(10);
  const [data] = await db.select({
    attendance: sql<Awaited<typeof attendance>[number]>`(select row_to_json(child) from (${attendance}) child)`,
    recentResults: jsonRows<Awaited<typeof results>[number]>(results), fees: jsonRows<Awaited<typeof fees>[number]>(fees),
    todayClasses: jsonRows<Awaited<typeof todayClasses>[number]>(todayClasses),
    diary: jsonRows<Awaited<typeof diary>[number]>(diary), upcomingTests: jsonRows<Awaited<typeof upcomingTests>[number]>(upcomingTests),
  }).from(sql`(select 1) as anchor`);
  return data;
}
