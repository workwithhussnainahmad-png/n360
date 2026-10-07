import { ExamTimetableList, type ExamTimetableRow } from "@/components/exams/ExamTimetableList";
import { db } from "@/db";
import { classes, sections, staffAssignments, subjects, tests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default async function StaffExamTimetablePage() {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) redirect("/login");

  const assignedRows = await db.select({
    classId: sections.classId,
  })
    .from(staffAssignments)
    .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
    .where(and(eq(staffAssignments.staffId, session.userId), eq(staffAssignments.institutionId, session.institutionId)));

  const classIds = Array.from(new Set(assignedRows.map((row) => row.classId)));
  const examRows: ExamTimetableRow[] = classIds.length === 0 ? [] : await db.select({
    id: tests.id,
    title: tests.title,
    type: tests.type,
    date: tests.date,
    endDate: tests.endDate,
    maxMarks: tests.maxMarks,
    className: classes.name,
    subjectName: subjects.name,
  })
    .from(tests)
    .innerJoin(classes, eq(tests.classId, classes.id))
    .leftJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(and(
      eq(tests.institutionId, session.institutionId),
      inArray(tests.classId, classIds),
      eq(tests.createdByRole, "INSTITUTION"),
      inArray(tests.type, ["MONTHLY", "MID", "FINAL"])
    ))
    .orderBy(tests.date);

  const activeExamRows = examRows.filter((exam) => (exam.endDate || exam.date) >= todayDateString());

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="border-b border-border pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Assigned class exams</p>
        <h1 className="mt-2 text-3xl font-display font-bold text-brand-950">Exam Timetable</h1>
        <p className="text-stone-500 mt-1">Monthly, Mid, and Final papers for the classes assigned to you.</p>
      </div>

      <ExamTimetableList rows={activeExamRows} emptyText="No active institution exam timetable is available for your assigned classes yet." audience="staff" />
    </div>
  );
}
