import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { attendances, classes, students, tests, marks } from '@/db/schema';
import { and, eq, gte, desc, sql } from 'drizzle-orm';
import { requireRole, getTenantContext } from '@/lib/rbac';
import { getCachedOrFetch } from '@/lib/redis';

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const instId = getTenantContext(session);
  const campusIdParam = req.nextUrl.searchParams.get('campusId');

  // Same validation as /api/institution/dashboard, and for the same two reasons:
  // an unvalidated value reached `Number()` (so `?campusId=abc` produced NaN and a
  // 500), and it was interpolated into three Valkey keys, so each distinct string
  // minted three new entries whose misses cost an attendance group-by, a
  // class-distribution join and an exam-average aggregate.
  let campusId: number | null = null;
  if (campusIdParam !== null && campusIdParam !== '') {
    campusId = Number(campusIdParam);
    if (!Number.isInteger(campusId) || campusId <= 0) {
      return NextResponse.json({ error: 'campusId must be a positive integer' }, { status: 400 });
    }
  }

  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  // attendances does not have campusId, we join students
  const campusFilterStudent = campusId !== null ? eq(students.campusId, campusId) : undefined;
  const campusFilterClass = undefined; // classes do not have campusId

  const [recentAttendance, classDistRows, examPerfRows] = await Promise.all([
    getCachedOrFetch(`cache:dashboard:attendance:${instId}:${last7Days[0]}:${campusId ?? 'all'}`, 60, () => {
      const q = db.select({ date: attendances.date, status: attendances.status, value: sql<number>`count(*)` })
        .from(attendances)
        .leftJoin(students, eq(attendances.studentId, students.id));
        
      if (campusFilterStudent) {
        return q.where(and(eq(attendances.institutionId, instId), gte(attendances.date, last7Days[0]), campusFilterStudent))
          .groupBy(attendances.date, attendances.status);
      } else {
        return q.where(and(eq(attendances.institutionId, instId), gte(attendances.date, last7Days[0])))
          .groupBy(attendances.date, attendances.status);
      }
    }),
    getCachedOrFetch(`cache:dashboard:class-dist:${instId}:${campusId ?? 'all'}`, 60, () => {
      const q = db.select({
        name: classes.name,
        value: sql<number>`count(${students.id})`
      })
      .from(classes)
      .leftJoin(students, campusFilterStudent ? and(eq(students.classId, classes.id), campusFilterStudent) : eq(students.classId, classes.id))
      .where(eq(classes.institutionId, instId))
      .groupBy(classes.id, classes.name)
      .orderBy(classes.level);
      return q;
    }),
    getCachedOrFetch(`cache:dashboard:exam-perf:${instId}:${campusId ?? 'all'}`, 60, () => {
      const q = db.select({
        title: tests.title,
        average: sql<number>`avg(${marks.marksObtained} / ${marks.totalMarks} * 100)`
      })
      .from(tests)
      .innerJoin(marks, eq(marks.testId, tests.id))
      .leftJoin(students, eq(marks.studentId, students.id));

      if (campusFilterStudent) {
         return q.where(and(eq(tests.institutionId, instId), campusFilterStudent))
          .groupBy(tests.id, tests.title, tests.createdAt)
          .orderBy(desc(tests.createdAt))
          .limit(5);
      } else {
         return q.where(eq(tests.institutionId, instId))
          .groupBy(tests.id, tests.title, tests.createdAt)
          .orderBy(desc(tests.createdAt))
          .limit(5);
      }
    }),
  ]);

  const trendMap = new Map<string, { date: string; PRESENT: number; ABSENT: number; LEAVE: number; LATE: number }>();
  for (const date of last7Days) {
    const d = new Date(date);
    const shortDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    trendMap.set(date, { date: shortDate, PRESENT: 0, ABSENT: 0, LEAVE: 0, LATE: 0 });
  }

  for (const record of recentAttendance) {
    const entry = trendMap.get(record.date);
    if (entry && record.status) {
      const key = record.status as keyof Omit<typeof entry, 'date'>;
      entry[key] = ((entry[key] as number) || 0) + Number(record.value);
    }
  }

  const trendsData = Array.from(trendMap.values());

  const examPerfData = examPerfRows.map((r) => ({
    title: r.title.length > 10 ? r.title.substring(0, 10) + '...' : r.title,
    average: Number(r.average) || 0,
  })).reverse();

  const classDistData = classDistRows.map((r) => ({ name: r.name, value: Number(r.value) }));

  return NextResponse.json({
    attendanceTrends: trendsData,
    classDistribution: classDistData,
    examPerformance: examPerfData,
  });
});
