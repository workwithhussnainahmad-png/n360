import { ExamTimetableList, type ExamTimetableRow } from "@/components/exams/ExamTimetableList";
import { db } from "@/db";
import { classes, students, subjects, tests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { studentPlacementColumns } from "@/lib/student-columns";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export default async function StudentExamTimetablePage() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) redirect("/login");

  const [student] = await db
    .select(studentPlacementColumns)
    .from(students)
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
    .limit(1);
  if (!student) redirect("/login");

  const today = todayDateString();
  const activeExamRows: ExamTimetableRow[] = await db.select({
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
      eq(tests.classId, student.classId),
      or(
        isNull(tests.sectionId),
        eq(tests.sectionId, student.sectionId)
      ),
      eq(tests.createdByRole, "INSTITUTION"),
      inArray(tests.type, ["MONTHLY", "MID", "FINAL"]),
      sql`coalesce(${tests.endDate}, ${tests.date}) >= ${today}`
    ))
    .orderBy(tests.date);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="border-b border-border pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">My class exams</p>
        <h1 className="mt-2 text-3xl font-display font-bold text-brand-950">Exam Timetable</h1>
        <p className="text-stone-500 mt-1">Monthly, Mid, and Final papers arranged by date and subject.</p>
      </div>

      <ExamTimetableList rows={activeExamRows} emptyText="No active institution exam timetable has been published for your class yet." audience="student" />
    </div>
  );
}
