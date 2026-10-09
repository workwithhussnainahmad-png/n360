import { db } from "@/db";
import { students, staffAssignments, subjects, staff } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getAuthenticatedStudentPlacement } from "@/lib/auth-student";
import { studentPlacementColumns } from "@/lib/student-columns";
import { redirect } from "next/navigation";
import { WeeklyTimetable, type TimetableEntry } from "@/components/timetable/ScheduleViews";

export default async function StudentTimetablePage() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") {
    redirect("/login");
  }

  if (!session.institutionId) redirect("/login");
  const currentStudent = getAuthenticatedStudentPlacement(session) ?? (await db
    .select(studentPlacementColumns)
    .from(students)
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
    .limit(1))[0];
  if (!currentStudent) redirect("/login");

  const assignments = await db.select({
    assignment: staffAssignments,
    subject: subjects.name,
    teacher: staff.name
  })
    .from(staffAssignments)
    .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
    .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
    .where(and(eq(staffAssignments.sectionId, currentStudent.sectionId), eq(staffAssignments.institutionId, session.institutionId)))
    .orderBy(staffAssignments.startTime);

  const timetableEntries: TimetableEntry[] = assignments.map((row) => ({
    id: row.assignment.id,
    dayOfWeek: row.assignment.dayOfWeek,
    startTime: row.assignment.startTime,
    endTime: row.assignment.endTime,
    title: row.assignment.isBreak ? "Break / Recess" : row.subject || "Subject",
    subtitle: row.teacher,
    isBreak: row.assignment.isBreak,
  }));

  return (
    <div className="space-y-8 animate-fade-in">

      <WeeklyTimetable
        entries={timetableEntries}
        title="Class Timetable"
        emptyTitle="No Classes Scheduled"
        emptyDescription="Your class timetable has not been published yet. Please check back later."
      />
    </div>
  );
}
