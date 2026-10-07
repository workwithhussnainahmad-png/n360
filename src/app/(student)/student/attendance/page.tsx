import { formatUtcDate } from "@/lib/date-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { attendances, students } from "@/db/schema";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { getAuthenticatedStudentPlacement } from "@/lib/auth-student";
import { windowRange } from "@/lib/month-window";
import { studentPlacementColumns } from "@/lib/student-columns";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { AlertCircle, CalendarDays, CheckSquare } from "lucide-react";
import { redirect } from "next/navigation";

const STATUS_STYLES = {
  PRESENT: "bg-success/10 text-success border-success/20",
  ABSENT: "bg-danger/10 text-danger border-danger/20",
  LATE: "bg-warning/10 text-warning border-warning/20",
  LEAVE: "bg-stone-100 text-stone-700 border-stone-200",
};

export default async function StudentAttendancePage() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) redirect("/login");

  const student = getAuthenticatedStudentPlacement(session) ?? (await db
    .select(studentPlacementColumns)
    .from(students)
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
    .limit(1))[0];
  if (!student) redirect("/login");

  const { from, to } = windowRange(new Date(), 1);

  const records = await db.select()
    .from(attendances)
    .where(and(
      eq(attendances.studentId, student.id),
      eq(attendances.institutionId, session.institutionId),
      gte(attendances.date, from),
      lte(attendances.date, to),
    ))
    .orderBy(desc(attendances.date));

  const totals = records.reduce(
    (acc, record) => {
      acc.total += 1;
      acc[record.status] += 1;
      return acc;
    },
    { total: 0, PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 }
  );

  const attendancePercent = totals.total > 0
    ? Math.round(((totals.PRESENT + totals.LATE + totals.LEAVE) / totals.total) * 100)
    : 0;

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Attendance Record</h1>
        <p className="text-stone-500 mt-1">Track your daily presence and absence history.</p>
      </div>

      {records.length === 0 ? (
        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-brand-600" />
              Current Semester
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 sm:p-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-brand-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-stone-800">No Attendance Yet</h3>
                <p className="text-stone-500 max-w-md mx-auto mt-2">
                  Your teacher has not submitted attendance for your class yet.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-stone-500">Attendance</p>
                <p className="text-3xl font-display font-bold text-brand-950 mt-1">{attendancePercent}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-stone-500">Present</p>
                <p className="text-3xl font-display font-bold text-success mt-1">{totals.PRESENT}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-stone-500">Absent</p>
                <p className="text-3xl font-display font-bold text-danger mt-1">{totals.ABSENT}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-stone-500">Late / Leave</p>
                <p className="text-3xl font-display font-bold text-warning mt-1">{totals.LATE + totals.LEAVE}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b border-border bg-stone-50/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-brand-600" />
                Daily Records
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {records.map((record) => (
                  <div key={record.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-brand-950">
                        {formatUtcDate(new Date(`${record.date}T00:00:00.000Z`))}
                      </p>
                      <p className="text-xs text-stone-500">Section attendance</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full border text-xs font-bold ${STATUS_STYLES[record.status]}`}>
                      {record.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
