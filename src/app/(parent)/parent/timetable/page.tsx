import { and, asc, eq, gte, lte, or, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { db } from "@/db";
import { staff, staffAssignments, subjects, tests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getParentPortalContext } from "@/lib/parent-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";
import { resolveParentPeriod } from "@/lib/parent-period";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export default async function ParentTimetablePage({ searchParams }: { searchParams: Promise<{ student?: string; period?: string; anchor?: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "PARENT") redirect("/parent-login");
  const params = await searchParams;
  const context = await getParentPortalContext(session, params.student);
  const child = context.selectedChild;
  if (!child) return <ParentNoChildren />;
  const range = resolveParentPeriod(params.period, params.anchor);

  const [schedule, upcomingTests] = await Promise.all([
    db.select({
      id: staffAssignments.id,
      day: staffAssignments.dayOfWeek,
      start: staffAssignments.startTime,
      end: staffAssignments.endTime,
      isBreak: staffAssignments.isBreak,
      subject: subjects.name,
      teacher: staff.name,
    }).from(staffAssignments)
      .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
      .where(and(eq(staffAssignments.institutionId, context.institutionId), eq(staffAssignments.sectionId, child.sectionId)))
      .orderBy(asc(staffAssignments.dayOfWeek), asc(staffAssignments.startTime)),
    db.select({ id: tests.id, title: tests.title, type: tests.type, date: tests.date, subject: subjects.name })
      .from(tests).innerJoin(subjects, eq(tests.subjectId, subjects.id))
      .where(and(
        eq(tests.institutionId, context.institutionId),
        eq(tests.classId, child.classId),
        or(eq(tests.sectionId, child.sectionId), isNull(tests.sectionId)),
        gte(tests.date, range.from),
        lte(tests.date, range.to),
      )).orderBy(asc(tests.date)).limit(20),
  ]);

  return <div className="space-y-6">
    <ParentChildHeader title="Schedule & assessments" description="Weekly class timetable and upcoming tests." students={context.children} selectedStudentId={child.id} path="/parent/timetable" />
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
      <Card><CardHeader className="border-b border-border"><CardTitle>Weekly timetable</CardTitle></CardHeader><CardContent className="p-0">
        {schedule.length === 0 ? <Empty text="No timetable has been published for this class." /> : DAYS.map((day, index) => {
          const rows = schedule.filter((row) => row.day === index);
          if (!rows.length) return null;
          return <section key={day} className="border-b border-border last:border-0"><h2 className="bg-stone-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-stone-500">{day}</h2><div className="divide-y divide-border">{rows.map((row) => <div key={row.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[130px_1fr_auto] sm:items-center"><p className="text-sm font-semibold text-brand-900">{row.start.slice(0, 5)}–{row.end.slice(0, 5)}</p><div><p className="font-semibold text-brand-950">{row.isBreak ? "Break / Recess" : row.subject || "Class period"}</p>{row.teacher && <p className="mt-1 text-xs text-stone-500">{row.teacher}</p>}</div></div>)}</div></section>;
        })}
      </CardContent></Card>
      <Card><CardHeader className="border-b border-border"><CardTitle>Upcoming tests</CardTitle></CardHeader><CardContent className="divide-y divide-border p-0">{upcomingTests.length === 0 ? <Empty text="No upcoming tests have been scheduled." /> : upcomingTests.map((test) => <div key={test.id} className="p-4"><p className="font-semibold text-brand-950">{test.title}</p><p className="mt-1 text-xs text-stone-500">{test.subject} · {test.type}</p><p className="mt-2 text-sm font-medium text-brand-800">{new Date(`${test.date}T00:00:00`).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</p></div>)}</CardContent></Card>
    </div>
  </div>;
}

function Empty({ text }: { text: string }) { return <div className="grid min-h-40 place-items-center p-8 text-center"><div><CalendarDays className="mx-auto h-8 w-8 text-stone-300" /><p className="mt-3 text-sm text-stone-500">{text}</p></div></div>; }
