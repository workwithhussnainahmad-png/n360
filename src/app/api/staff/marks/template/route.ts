import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sections, staffAssignments, students, tests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const GET = requireRole(["STAFF"], async (request: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const testId = Number(request.nextUrl.searchParams.get("testId"));
  const sectionId = Number(request.nextUrl.searchParams.get("sectionId"));
  if (!Number.isInteger(testId) || testId <= 0 || !Number.isInteger(sectionId) || sectionId <= 0) {
    return NextResponse.json({ error: "Assessment and section are required" }, { status: 400 });
  }

  const [test] = await db.select().from(tests).where(and(eq(tests.id, testId), eq(tests.institutionId, session.institutionId))).limit(1);
  if (!test || (test.sectionId && test.sectionId !== sectionId)) {
    return NextResponse.json({ error: "Assessment not found for this section" }, { status: 404 });
  }
  const [assignment] = await db.select({ sectionClassId: sections.classId })
    .from(staffAssignments)
    .innerJoin(sections, eq(sections.id, staffAssignments.sectionId))
    .where(and(
      eq(staffAssignments.institutionId, session.institutionId),
      eq(staffAssignments.staffId, session.userId),
      eq(staffAssignments.sectionId, sectionId),
      eq(staffAssignments.subjectId, test.subjectId)
    )).limit(1);
  if (!assignment || assignment.sectionClassId !== test.classId) {
    return NextResponse.json({ error: "This class or subject is not assigned to you" }, { status: 403 });
  }
  if (test.createdByRole === "STAFF" && test.staffId !== session.userId) {
    return NextResponse.json({ error: "Only the assessment owner can download this template" }, { status: 403 });
  }

  const roster = await db.select({ rollNumber: students.classRollNumber, name: students.name })
    .from(students)
    .where(and(
      eq(students.institutionId, session.institutionId),
      eq(students.sectionId, sectionId),
      isNull(students.deletedAt)
    ))
    .orderBy(students.classRollNumber);
  const rows = [
    ["Roll Number", "Student Name", "Marks Obtained", "Total Marks"],
    ...roster.map((student) => [student.rollNumber, student.name, "", String(test.maxMarks)]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const filename = `assessment-${test.id}-section-${sectionId}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
