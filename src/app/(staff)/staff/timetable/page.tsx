import { db } from "@/db";
import { staffAssignments, subjects, classes, sections } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { WeeklyTimetable, type TimetableEntry } from "@/components/timetable/ScheduleViews";
import { formatClassSection } from "@/lib/class-section-label";

export default async function StaffTimetablePage() {
  const session = await getSession();
  if (!session || session.role !== "STAFF") {
    redirect("/login");
  }

  const staffId = session.userId;
  if (!session.institutionId) redirect("/login");

  const assignments = await db.select({
    assignment: staffAssignments,
    subject: subjects.name,
    className: classes.name,
    sectionName: sections.name,
  })
    .from(staffAssignments)
    .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
    .leftJoin(sections, eq(staffAssignments.sectionId, sections.id))
    .leftJoin(classes, eq(sections.classId, classes.id))
    .where(and(eq(staffAssignments.staffId, staffId), eq(staffAssignments.institutionId, session.institutionId)))
    .orderBy(staffAssignments.startTime);

  const timetableEntries: TimetableEntry[] = assignments.map((row) => ({
    id: row.assignment.id,
    dayOfWeek: row.assignment.dayOfWeek,
    startTime: row.assignment.startTime,
    endTime: row.assignment.endTime,
    title: row.assignment.isBreak ? "Break / Recess" : row.subject || "Subject",
    meta: row.className ? formatClassSection(row.className, row.sectionName) : null,
    isBreak: row.assignment.isBreak,
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">My Timetable</h1>
          <p className="text-stone-500 mt-1">View your weekly class schedule and teaching assignments.</p>
        </div>
      </div>

      <WeeklyTimetable
        entries={timetableEntries}
        title="Teaching Timetable"
        emptyTitle="No Assignments Yet"
        emptyDescription="You have not been assigned to any classes yet. Your timetable will appear here once published."
      />
    </div>
  );
}
