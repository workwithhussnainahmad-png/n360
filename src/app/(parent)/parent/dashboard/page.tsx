import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { BarChart3, CalendarCheck, Clock3, GraduationCap, Megaphone } from "lucide-react";
import { db } from "@/db";
import { attendances, marks, staff, staffAssignments, subjects, tests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { getParentPortalContext, ParentChildAccessError } from "@/lib/parent-access";
import { pakistanDateKey, parentPeriodLabel, resolveParentPeriod } from "@/lib/parent-period";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TodayTimetableCard, type TimetableEntry } from "@/components/timetable/ScheduleViews";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";
import { formatClassSection } from "@/lib/class-section-label";

const PERFORMANCE_TYPES = ["DAILY", "WEEKLY", "QUIZ", "MONTHLY"] as const;

export default async function ParentDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; period?: string; anchor?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "PARENT") redirect("/parent-login");
  const params = await searchParams;
  let context;
  try {
    context = await getParentPortalContext(session, params.student);
  } catch (error) {
    if (error instanceof ParentChildAccessError) notFound();
    throw error;
  }
  const child = context.selectedChild;
  if (!child) return <ParentNoChildren />;

  const now = new Date();
  const range = resolveParentPeriod(params.period, params.anchor);
  const rangeLabel = parentPeriodLabel(params.period, params.anchor);
  const currentDay = now.getDay();
  const [attendanceRows, recentMarks, subjectPerformance, scheduleRows, announcements] = await Promise.all([
    db.select({ status: attendances.status })
      .from(attendances)
      .where(and(
        eq(attendances.institutionId, context.institutionId),
        eq(attendances.studentId, child.id),
        gte(attendances.date, range.from),
        lte(attendances.date, range.to),
      )),
    db.select({
      id: marks.id,
      marksObtained: marks.marksObtained,
      totalMarks: marks.totalMarks,
      title: tests.title,
      type: tests.type,
      date: tests.date,
      subjectName: subjects.name,
    })
      .from(marks)
      .innerJoin(tests, eq(marks.testId, tests.id))
      .innerJoin(subjects, eq(tests.subjectId, subjects.id))
      .where(and(eq(marks.institutionId, context.institutionId), eq(marks.studentId, child.id), isNotNull(tests.resultsPublishedAt), gte(tests.date, range.from), lte(tests.date, range.to)))
      .orderBy(desc(tests.date), desc(marks.id))
      .limit(10),
    db.select({
      subjectId: subjects.id,
      subjectName: subjects.name,
      average: sql<number>`round(avg(case when ${marks.totalMarks} > 0 then (${marks.marksObtained} * 100.0 / ${marks.totalMarks}) else null end))::int`,
      assessments: sql<number>`count(*)::int`,
    })
      .from(marks)
      .innerJoin(tests, eq(marks.testId, tests.id))
      .innerJoin(subjects, eq(tests.subjectId, subjects.id))
      .where(and(
        eq(marks.institutionId, context.institutionId),
        eq(marks.studentId, child.id),
        isNotNull(tests.resultsPublishedAt),
        inArray(tests.type, [...PERFORMANCE_TYPES]),
        gte(tests.date, range.from),
        lte(tests.date, range.to),
      ))
      .groupBy(subjects.id, subjects.name)
      .orderBy(subjects.name),
    db.select({
      id: staffAssignments.id,
      startTime: staffAssignments.startTime,
      endTime: staffAssignments.endTime,
      subjectName: subjects.name,
      teacherName: staff.name,
      isBreak: staffAssignments.isBreak,
    })
      .from(staffAssignments)
      .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
      .where(and(
        eq(staffAssignments.institutionId, context.institutionId),
        eq(staffAssignments.sectionId, child.sectionId),
        eq(staffAssignments.dayOfWeek, currentDay),
      )),
    getVisibleAnnouncements(
      { ...session, role: "STUDENT", userId: child.id },
      10,
      { campusId: child.campusId, classId: child.classId, sectionId: child.sectionId, createdAt: child.createdAt },
      { includeReadStatus: false },
    ),
  ]);

  const attended = attendanceRows.filter((row) => row.status === "PRESENT" || row.status === "LATE").length;
  const periodAnnouncements = announcements.filter((item) => pakistanDateKey(item.createdAtIso) >= range.from && pakistanDateKey(item.createdAtIso) <= range.to);
  const attendanceRate = attendanceRows.length ? Math.round((attended / attendanceRows.length) * 100) : null;
  const overallAverage = subjectPerformance.length
    ? Math.round(subjectPerformance.reduce((sum, row) => sum + Number(row.average || 0), 0) / subjectPerformance.length)
    : null;
  const todayEntries: TimetableEntry[] = scheduleRows.map((row) => ({
    id: row.id,
    dayOfWeek: currentDay,
    startTime: row.startTime,
    endTime: row.endTime,
    title: row.subjectName || "Break / Recess",
    subtitle: row.teacherName,
    isBreak: row.isBreak || !row.subjectName,
  }));

  return (
    <div className="space-y-6">
      <ParentChildHeader
        title={`${child.name}'s overview`}
        description={`${formatClassSection(child.className, child.sectionName, " · ")}${child.campusName ? ` · ${child.campusName}` : ""}`}
        students={context.children}
        selectedStudentId={child.id}
        path="/parent/dashboard"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label={`Attendance · ${range.period.toLowerCase()}`} value={attendanceRate === null ? "—" : `${attendanceRate}%`} detail={`${attendanceRows.length} recorded days · ${rangeLabel}`} icon={CalendarCheck} />
        <SummaryCard label="Academic average" value={overallAverage === null ? "—" : `${overallAverage}%`} detail="Daily, weekly, quiz and monthly tests" icon={BarChart3} />
        <SummaryCard label="Recent assessments" value={String(recentMarks.length)} detail="Latest published results" icon={GraduationCap} />
        <SummaryCard label="Classes today" value={String(todayEntries.length)} detail={todayEntries.length ? "View today's schedule below" : "No classes scheduled"} icon={Clock3} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader className="border-b border-border"><CardTitle>Subject performance</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-5">
            {subjectPerformance.length === 0 ? <p className="text-sm text-stone-500">No class-test results are available yet.</p> : subjectPerformance.map((row) => {
              const average = Math.max(0, Math.min(100, Number(row.average || 0)));
              return (
                <div key={row.subjectId}>
                  <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-brand-950">{row.subjectName}</span>
                    <span className="text-stone-600">{average}% · {row.assessments} tests</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full rounded-full bg-brand-700" style={{ width: `${average}%` }} /></div>
                </div>
              );
            })}
            <Link className="inline-flex text-sm font-semibold text-brand-800 hover:underline" href={`/parent/results?student=${child.id}&period=${range.period}&anchor=${range.anchor}`}>View complete results →</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border"><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-brand-700" />School updates</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {periodAnnouncements.length === 0 ? <p className="p-5 text-sm text-stone-500">No announcements for this period.</p> : periodAnnouncements.map((announcement) => (
              <div key={announcement.id} className="p-4">
                <p className="text-sm font-semibold text-brand-950">{announcement.title}</p>
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-stone-600">{announcement.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <TodayTimetableCard entries={todayEntries} title={`${child.name}'s classes today`} />
        <Card>
          <CardHeader className="border-b border-border"><CardTitle>Recent test results</CardTitle></CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {recentMarks.length === 0 ? <p className="p-5 text-sm text-stone-500">No results have been added yet.</p> : recentMarks.map((row) => {
              const percentage = row.totalMarks > 0 ? Math.round((row.marksObtained / row.totalMarks) * 100) : 0;
              return (
                <div key={row.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-brand-950">{row.title}</p><p className="mt-1 text-xs text-stone-500">{row.subjectName} · {row.type} · {row.date}</p></div>
                  <div className="shrink-0 text-right"><p className="font-bold text-brand-900">{row.marksObtained}/{row.totalMarks}</p><p className="text-xs text-stone-500">{percentage}%</p></div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof CalendarCheck }) {
  return (
    <Card className="h-full">
      <CardContent className="flex min-h-40 h-full flex-col p-5">
        <div className="flex min-h-10 items-start justify-between gap-3">
          <p className="max-w-[75%] text-left text-xs font-semibold uppercase leading-5 tracking-wide text-stone-500">{label}</p>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-brand-100 text-brand-800"><Icon className="h-5 w-5" /></span>
        </div>
        <p className="mt-3 text-left font-display text-3xl font-bold leading-none text-brand-950">{value}</p>
        <p className="mt-auto pt-3 text-left text-xs leading-5 text-stone-500">{detail}</p>
      </CardContent>
    </Card>
  );
}
