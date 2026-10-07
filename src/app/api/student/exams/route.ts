import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, students, subjects, tests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export const GET = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [student] = await db.select({
    id: students.id,
    classId: students.classId,
    sectionId: students.sectionId,
  }).from(students)
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
    .limit(1);

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const examRows = await db.select({
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
      inArray(tests.type, ["MONTHLY", "MID", "FINAL"])
    ))
    .orderBy(tests.date);

  const activeExamRows = examRows.filter((exam) => (exam.endDate || exam.date) >= todayDateString());

  return NextResponse.json(activeExamRows);
});
