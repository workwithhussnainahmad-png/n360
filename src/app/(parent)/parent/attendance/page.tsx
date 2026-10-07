import { notFound, redirect } from "next/navigation";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { CalendarCheck, CircleAlert, Clock3 } from "lucide-react";
import { db } from "@/db";
import { attendances } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getParentPortalContext, ParentChildAccessError } from "@/lib/parent-access";
import { parentPeriodLabel, resolveParentPeriod } from "@/lib/parent-period";
import { Card, CardContent } from "@/components/ui/card";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";

const STATUS_STYLES = {
  PRESENT: "border-emerald-200 bg-emerald-50 text-emerald-800",
  ABSENT: "border-red-200 bg-red-50 text-red-800",
  LATE: "border-amber-200 bg-amber-50 text-amber-800",
  LEAVE: "border-sky-200 bg-sky-50 text-sky-800",
} as const;

export default async function ParentAttendancePage({ searchParams }: { searchParams: Promise<{ student?: string; period?: string; anchor?: string }> }) {
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

  const range = resolveParentPeriod(params.period, params.anchor);
  const rangeLabel = parentPeriodLabel(params.period, params.anchor);
  const rows = await db.select({ id: attendances.id, date: attendances.date, status: attendances.status })
    .from(attendances)
    .where(and(
      eq(attendances.institutionId, context.institutionId),
      eq(attendances.studentId, child.id),
      gte(attendances.date, range.from),
      lte(attendances.date, range.to),
    ))
    .orderBy(asc(attendances.date));

  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
  for (const row of rows) counts[row.status] += 1;
  const attendanceRate = rows.length ? Math.round(((counts.PRESENT + counts.LATE) / rows.length) * 100) : null;
  return (
    <div className="space-y-6">
      <ParentChildHeader title="Attendance" description={`${child.name}'s daily attendance record, shown exactly as recorded by the institution.`} students={context.children} selectedStudentId={child.id} path="/parent/attendance" />

      <div className="rounded-sm border border-stone-300 bg-white p-3 text-center">
        <p className="font-display text-lg font-semibold text-brand-950">{rangeLabel}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Attendance rate" value={attendanceRate === null ? "—" : `${attendanceRate}%`} icon={CalendarCheck} />
        <Metric label="Present" value={String(counts.PRESENT)} icon={CalendarCheck} />
        <Metric label="Absent" value={String(counts.ABSENT)} icon={CircleAlert} />
        <Metric label="Late" value={String(counts.LATE)} icon={Clock3} />
        <Metric label="Leave" value={String(counts.LEAVE)} icon={CalendarCheck} />
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-stone-500">No attendance has been recorded for {rangeLabel}.</p>
          ) : (
            <div className="grid gap-px bg-stone-200 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center justify-between bg-white p-4">
                  <div><p className="text-sm font-semibold text-brand-950">{new Date(`${row.date}T00:00:00`).toLocaleDateString("en-PK", { weekday: "long" })}</p><p className="mt-1 text-xs text-stone-500">{new Date(`${row.date}T00:00:00`).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</p></div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[row.status]}`}>{row.status}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-stone-500">Late attendance is counted as attended in the attendance-rate summary.</p>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof CalendarCheck }) {
  return <Card><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1 font-display text-2xl font-bold text-brand-950">{value}</p></div><Icon className="h-5 w-5 text-brand-700" /></CardContent></Card>;
}
