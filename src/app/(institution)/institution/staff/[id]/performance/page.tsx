import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { ArrowLeft, BarChart3, BookOpen, CalendarRange, Users } from "lucide-react";
import { db } from "@/db";
import { classes, marks, sections, staff, staffAssignments, students, subjects, tests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import type { TeacherPerformancePoint } from "@/components/institution/TeacherPerformanceChart";
import { TeacherPerformancePanels, type TeacherPerformanceGroup } from "./TeacherPerformancePanels";

const PERIODS = [3, 6, 12] as const;
const TEST_TYPES = ["DAILY", "WEEKLY", "MONTHLY"] as const;

function dateMonthsAgo(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

export default async function TeacherPerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ months?: string }>;
}) {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) redirect("/login");
  const institutionId = session.institutionId || session.userId;
  const staffId = Number((await params).id);
  if (!Number.isInteger(staffId) || staffId <= 0) notFound();
  const requestedMonths = Number((await searchParams).months || "6");
  const months = PERIODS.includes(requestedMonths as (typeof PERIODS)[number]) ? requestedMonths : 6;

  const [teacher] = await db.select({ id: staff.id, name: staff.name, email: staff.email, isActive: staff.isActive })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.institutionId, institutionId), isNull(staff.deletedAt)))
    .limit(1);
  if (!teacher) notFound();

  const assignmentPairs = db.selectDistinct({
    sectionId: staffAssignments.sectionId,
    subjectId: staffAssignments.subjectId,
  })
    .from(staffAssignments)
    .where(and(
      eq(staffAssignments.institutionId, institutionId),
      eq(staffAssignments.staffId, staffId),
      eq(staffAssignments.isBreak, false),
      isNotNull(staffAssignments.subjectId),
    ))
    .as("teacher_assignment_pairs");

  const [assignments, resultRows] = await Promise.all([
    db.select({
      sectionId: assignmentPairs.sectionId,
      subjectId: assignmentPairs.subjectId,
      className: classes.name,
      sectionName: sections.name,
      subjectName: subjects.name,
    })
      .from(assignmentPairs)
      .innerJoin(sections, and(eq(sections.id, assignmentPairs.sectionId), eq(sections.institutionId, institutionId)))
      .innerJoin(classes, and(eq(classes.id, sections.classId), eq(classes.institutionId, institutionId)))
      .innerJoin(subjects, and(eq(subjects.id, assignmentPairs.subjectId), eq(subjects.institutionId, institutionId)))
      .orderBy(classes.name, sections.name, subjects.name),
    db.select({
      sectionId: assignmentPairs.sectionId,
      subjectId: assignmentPairs.subjectId,
      testId: tests.id,
      title: tests.title,
      type: tests.type,
      date: tests.date,
      average: sql<number>`round(avg(case when ${marks.totalMarks} > 0 then ${marks.marksObtained} * 100.0 / ${marks.totalMarks} end)::numeric, 1)::float`,
      studentCount: sql<number>`count(${marks.id})::int`,
    })
      .from(assignmentPairs)
      .innerJoin(sections, and(eq(sections.id, assignmentPairs.sectionId), eq(sections.institutionId, institutionId)))
      .innerJoin(tests, and(
        eq(tests.institutionId, institutionId),
        eq(tests.classId, sections.classId),
        eq(tests.subjectId, assignmentPairs.subjectId),
        or(isNull(tests.sectionId), eq(tests.sectionId, assignmentPairs.sectionId)),
      ))
      .innerJoin(marks, and(eq(marks.testId, tests.id), eq(marks.institutionId, institutionId)))
      .innerJoin(students, and(
        eq(students.id, marks.studentId),
        eq(students.institutionId, institutionId),
        eq(students.sectionId, assignmentPairs.sectionId),
        isNull(students.deletedAt),
      ))
      .where(and(
        isNotNull(tests.resultsPublishedAt),
        inArray(tests.type, [...TEST_TYPES]),
        gte(tests.date, dateMonthsAgo(months)),
      ))
      .groupBy(assignmentPairs.sectionId, assignmentPairs.subjectId, tests.id, tests.title, tests.type, tests.date)
      .orderBy(asc(tests.date), asc(tests.id)),
  ]);

  const pointsByAssignment = new Map<string, TeacherPerformancePoint[]>();
  for (const row of resultRows) {
    const key = `${row.sectionId}:${row.subjectId}`;
    const points = pointsByAssignment.get(key) || [];
    points.push({
      id: row.testId,
      label: new Date(`${row.date}T00:00:00Z`).toLocaleDateString("en-PK", { day: "2-digit", month: "short", timeZone: "UTC" }),
      title: row.title,
      type: row.type,
      average: Number(row.average || 0),
      students: Number(row.studentCount || 0),
    });
    pointsByAssignment.set(key, points);
  }

  const allPoints = Array.from(pointsByAssignment.values()).flat();
  const assessedStudents = allPoints.reduce((sum, point) => sum + point.students, 0);
  const overallAverage = assessedStudents
    ? Math.round(allPoints.reduce((sum, point) => sum + point.average * point.students, 0) / assessedStudents)
    : null;
  const performanceGroups: TeacherPerformanceGroup[] = assignments.map((assignment) => {
    const key = `${assignment.sectionId}:${assignment.subjectId}`;
    const points = pointsByAssignment.get(key) || [];
    const resultCount = points.reduce((sum, point) => sum + point.students, 0);
    const average = resultCount ? Math.round(points.reduce((sum, point) => sum + point.average * point.students, 0) / resultCount) : null;
    return { key, className: assignment.className, sectionName: assignment.sectionName, subjectName: assignment.subjectName, average, points };
  });

  return (
    <div className="animate-fade-in space-y-7">
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/institution/staff" className="mb-4 inline-flex items-center text-sm font-semibold text-brand-700 hover:text-brand-950"><ArrowLeft className="mr-2 h-4 w-4" /> Staff directory</Link>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">Teacher performance</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-brand-950">{teacher.name}</h1>
          <p className="mt-1 text-sm text-stone-500">{teacher.email} · {teacher.isActive ? "Active" : "Disabled"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((period) => <Link key={period} href={`/institution/staff/${staffId}/performance?months=${period}`} className={`rounded-md border px-3 py-2 text-sm font-semibold ${months === period ? "border-brand-800 bg-brand-800 text-white" : "border-stone-300 bg-white text-stone-600 hover:border-brand-500"}`}>{period} months</Link>)}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Teaching assignments" value={String(assignments.length)} icon={BookOpen} />
        <SummaryCard label="Published assessments" value={String(allPoints.length)} icon={CalendarRange} />
        <SummaryCard label="Overall class average" value={overallAverage === null ? "—" : `${overallAverage}%`} icon={BarChart3} />
      </div>

      {assignments.length === 0 ? (
        <Card><CardContent className="flex min-h-52 flex-col items-center justify-center p-8 text-center"><Users className="mb-3 h-8 w-8 text-stone-400" /><h2 className="font-display text-xl font-semibold text-brand-950">No timetable assignments</h2><p className="mt-2 max-w-lg text-sm leading-6 text-stone-500">Assign this teacher to a section and subject in Timetable before performance can be attributed.</p></CardContent></Card>
      ) : (
        <TeacherPerformancePanels groups={performanceGroups} />
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof BarChart3 }) {
  return <Card><CardContent className="flex items-center gap-4 p-5"><div className="rounded-md bg-brand-100 p-3 text-brand-800"><Icon className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">{label}</p><p className="mt-1 font-display text-2xl font-bold text-brand-950">{value}</p></div></CardContent></Card>;
}
