import { Card, CardContent } from "@/components/ui/card";
import { CalendarCheck, CheckCircle2, FileText, UserRound, UploadCloud } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getAuthenticatedStudentPlacement } from "@/lib/auth-student";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { students, staffAssignments, subjects, staff, submissions, marks, tests } from "@/db/schema";
import { eq, and, desc, count, isNotNull } from "drizzle-orm";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { DashboardAnnouncements } from "@/components/announcements/DashboardAnnouncements";
import { TodayTimetableCard, type TimetableEntry } from "@/components/timetable/ScheduleViews";
import Link from "next/link";
import { getCachedOrFetch } from "@/lib/redis";

import { StudentLeaveRequestButton } from "./StudentLeaveRequestButton";
import { PromotionResultDialog } from "./PromotionResultDialog";

/**
 * Student web dashboard — only initially visible cards/schedule/announcements.
 *
 * Cache key: cache:student:dashboard:web:{studentId}:{institutionId}:{day}
 * Scope: student + institution + weekday (timetable day)
 * TTL: 45s
 * Invalidation: invalidateStudentDashboardCache (shared with mobile key family)
 * Acceptable staleness: ~45s for counts/schedule
 * Fallback: Valkey miss → Postgres
 */
export default async function StudentDashboard() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") {
    redirect("/login");
  }

  const studentId = session.userId;
  if (!session.institutionId) redirect("/login");
  const institutionId = session.institutionId;
  const currentDay = new Date().getDay();

  const currentStudent = getAuthenticatedStudentPlacement(session) ?? (await db
    .select({
      id: students.id,
      name: students.name,
      sectionId: students.sectionId,
      institutionId: students.institutionId,
      academicStatus: students.academicStatus,
      classId: students.classId,
    })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.institutionId, institutionId)))
    .limit(1))[0];
  if (!currentStudent) redirect("/login");

  if (session.studentAcademicStatus === "GRADUATED" || currentStudent.academicStatus === "GRADUATED") {
    return (
      <div className="space-y-6 animate-fade-in pb-20 lg:pb-0">
        <PromotionResultDialog />
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Graduated Student Access</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-brand-950">Hi, {currentStudent.name}</h1>
          <p className="mt-2 text-sm lg:text-base text-brand-900">
            You are graduated, all you can access is Transcript, Attendance Record and Profile.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Link href="/student/transcripts" prefetch={false} className="block h-full">
            <Card className="h-full border-indigo-100 bg-white shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="h-11 w-11 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center mb-4">
                  <FileText className="h-5 w-5" />
                </div>
                <h2 className="font-display text-lg font-bold text-brand-950">Transcript</h2>
                <p className="mt-1 text-sm text-stone-500">View your published academic result records.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/student/attendance" prefetch={false} className="block h-full">
            <Card className="h-full border-emerald-100 bg-white shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="h-11 w-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <h2 className="font-display text-lg font-bold text-brand-950">Attendance Record</h2>
                <p className="mt-1 text-sm text-stone-500">Review your saved attendance history.</p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/student/profile" prefetch={false} className="block h-full">
            <Card className="h-full border-amber-100 bg-white shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="h-11 w-11 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-4">
                  <UserRound className="h-5 w-5" />
                </div>
                <h2 className="font-display text-lg font-bold text-brand-950">Profile</h2>
                <p className="mt-1 text-sm text-stone-500">View your read-only graduated student profile.</p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  const dashboardPayload = await getCachedOrFetch(
    `cache:student:dashboard:web:${studentId}:${institutionId}:${currentDay}`,
    45,
    async () => {
      const [scheduleRows, submissionCountRows, latestMarkRows] = await Promise.all([
        currentStudent.sectionId == null
          ? Promise.resolve([])
          : db
              .select({
                id: staffAssignments.id,
                startTime: staffAssignments.startTime,
                endTime: staffAssignments.endTime,
                subject: subjects.name,
                teacher: staff.name,
              })
              .from(staffAssignments)
              .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
              .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
              .where(
                and(
                  eq(staffAssignments.sectionId, currentStudent.sectionId),
                  eq(staffAssignments.institutionId, institutionId),
                  eq(staffAssignments.dayOfWeek, currentDay)
                )
              ),
        db
          .select({ value: count() })
          .from(submissions)
          .where(and(eq(submissions.studentId, studentId), eq(submissions.institutionId, institutionId))),
        db
          .select({
            marksObtained: marks.marksObtained,
            totalMarks: marks.totalMarks,
            testType: tests.type,
            testTitle: tests.title,
            subjectName: subjects.name,
          })
          .from(marks)
          .innerJoin(tests, eq(marks.testId, tests.id))
          .leftJoin(subjects, eq(tests.subjectId, subjects.id))
          .where(and(eq(marks.studentId, studentId), eq(marks.institutionId, institutionId), isNotNull(tests.resultsPublishedAt)))
          .orderBy(desc(marks.createdAt))
          .limit(1),
      ]);

      const sorted = [...scheduleRows].sort((a, b) => a.startTime.localeCompare(b.startTime));
      return {
        scheduleRows: sorted,
        submissionCount: submissionCountRows[0]?.value || 0,
        latestMark: latestMarkRows[0] ?? null,
      };
    }
  );

  // Announcements use their own short-lived cache; keep outside the dashboard blob
  // so announcement reads do not force schedule/count invalidation.
  const recentAnnouncements = await getVisibleAnnouncements(session, 4);

  const todayEntries: TimetableEntry[] = dashboardPayload.scheduleRows.map((row) => ({
    id: row.id,
    dayOfWeek: currentDay,
    startTime: row.startTime,
    endTime: row.endTime,
    title: row.subject || "Break / Recess",
    subtitle: row.teacher,
    isBreak: !row.subject,
  }));

  const latestMark = dashboardPayload.latestMark;

  return (
    <div className="space-y-6 animate-fade-in pb-20 lg:pb-0">
      <PromotionResultDialog />
      <div>
        <h1 className="font-display text-3xl font-bold text-brand-950">Hi, {currentStudent.name}</h1>
        <p className="text-stone-500 mt-1 text-sm lg:text-base">Here is your academic overview.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-brand-800 to-brand-950 text-white border-none shadow-md">
          <CardContent className="p-3 lg:p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-brand-200 text-xs lg:text-sm font-medium mb-1">Total Submissions</p>
                <h3 className="text-xl lg:text-3xl font-display font-bold">{dashboardPayload.submissionCount}</h3>
              </div>
              <div className="h-8 w-8 lg:h-10 lg:w-10 rounded-full border-2 border-brand-700 flex items-center justify-center shrink-0">
                <UploadCloud className="h-4 w-4 lg:h-5 lg:w-5 text-brand-200" />
              </div>
            </div>
            <p className="text-brand-300 text-xs mt-4">Keep up the good work!</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success to-teal-700 text-white border-none shadow-md">
          <CardContent className="p-3 lg:p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-teal-100 text-xs lg:text-sm font-medium mb-1">Latest Score</p>
                <h3 className="text-xl lg:text-3xl font-display font-bold">
                  {latestMark ? `${latestMark.marksObtained}/${latestMark.totalMarks}` : "--"}
                </h3>
              </div>
              <div className="h-8 w-8 lg:h-10 lg:w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
              </div>
            </div>
            <p className="text-teal-100 text-xs mt-4 truncate">
              {latestMark
                ? `${latestMark.testType} - ${latestMark.subjectName || "Subject"} - ${latestMark.testTitle}`
                : "No recent test marks found."}
            </p>
          </CardContent>
        </Card>

        <Link href="/student/transcripts" prefetch={false} className="block h-full">
          <Card className="bg-gradient-to-br from-indigo-500 to-indigo-800 text-white border-none shadow-md hover:shadow-lg transition-shadow h-full">
            <CardContent className="p-3 lg:p-4 h-full flex flex-col justify-center">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-indigo-100 text-xs lg:text-sm font-medium mb-1">Term Exams</p>
                  <h3 className="text-xl lg:text-2xl font-display font-bold leading-tight">View Transcripts</h3>
                </div>
                <div className="h-8 w-8 lg:h-10 lg:w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <FileText className="h-4 w-4 lg:h-5 lg:w-5 text-white" />
                </div>
              </div>
              <p className="text-indigo-200 text-xs mt-4">Check full batch results.</p>
            </CardContent>
          </Card>
        </Link>

        <StudentLeaveRequestButton />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mt-8">
        <div className="lg:col-span-2">
          <TodayTimetableCard entries={todayEntries} title="Today's Classes" />
        </div>

        <DashboardAnnouncements announcements={recentAnnouncements} />
      </div>
    </div>
  );
}
