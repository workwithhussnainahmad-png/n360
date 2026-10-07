import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/db";
import { tests, students, marks, staffAssignments, sections } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { eq, and, inArray, sql } from "drizzle-orm";
import { withRateLimit } from "@/lib/rate-limit";

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session, params }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await withRateLimit(req, "marks_write");
  if (!rateLimit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const id = (await params)?.testId;
  const testId = Number(id);
  if (!Number.isInteger(testId)) return NextResponse.json({ error: "Invalid test ID" }, { status: 400 });

  try {
    const body = await req.json();
    const { records } = body; // Array of { studentId: number, marksObtained: number }

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "No marks provided" }, { status: 400 });
    }

    const [test] = await db.select().from(tests).where(and(eq(tests.id, testId), eq(tests.institutionId, session.institutionId))).limit(1);
    
    if (!test) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

    // Verify staff can mark this test
    if (test.createdByRole === "STAFF" && test.staffId !== session.userId) {
      return NextResponse.json({ error: "Only the staff member who created this assessment can mark it" }, { status: 403 });
    }

    if (test.createdByRole === "INSTITUTION") {
      const assigned = await db.select()
        .from(staffAssignments)
        .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
        .where(
          and(
            eq(staffAssignments.staffId, session.userId),
            eq(staffAssignments.institutionId, session.institutionId),
            eq(staffAssignments.subjectId, test.subjectId!),
            eq(sections.classId, test.classId)
          )
        );
      if (assigned.length === 0) {
        return NextResponse.json({ error: "This exam subject is not assigned to you" }, { status: 403 });
      }
    }

    const expectedTotal = Number(test.maxMarks);

    // Validate marks
    for (const record of records) {
      const marksObtained = Number(record.marksObtained);
      if (!Number.isFinite(marksObtained) || marksObtained < 0 || marksObtained > expectedTotal) {
        return NextResponse.json({ error: `Invalid marks for student ${record.studentId}` }, { status: 400 });
      }
    }

    const studentIds = records.map(r => Number(r.studentId));
    const uniqueStudentIds = new Set(studentIds);

    if (uniqueStudentIds.size !== studentIds.length) {
      return NextResponse.json({ error: "Duplicate student IDs are not allowed" }, { status: 400 });
    }

    // Ensure all students belong to the class
    const studentRows = await db.select({ id: students.id }).from(students).where(
      and(
        eq(students.institutionId, session.institutionId),
        eq(students.classId, test.classId),
        inArray(students.id, studentIds)
      )
    );

    if (studentRows.length !== records.length) {
      return NextResponse.json({ error: "One or more students do not belong to this class" }, { status: 400 });
    }

    // Bulk upsert: one database round trip for the complete class roster.
    await db.insert(marks).values(records.map((record) => ({
      institutionId: session.institutionId!,
      testId: test.id,
      studentId: Number(record.studentId),
      marksObtained: Number(record.marksObtained),
      totalMarks: expectedTotal,
    }))).onConflictDoUpdate({
      target: [marks.testId, marks.studentId],
      set: {
        marksObtained: sql`EXCLUDED.marks_obtained`,
        totalMarks: sql`EXCLUDED.total_marks`,
      },
    });

    const { invalidateStudentMarksCaches } = await import('@/lib/redis');
    await invalidateStudentMarksCaches(session.institutionId!, records.map((record: {studentId: number}) => Number(record.studentId)));
    const { createBulkNotifications } = await import("@/lib/notifications");
    after(async () => {
      try {
        await createBulkNotifications(records.map((r: any) => ({
          institutionId: session.institutionId!,
          userRole: "STUDENT",
          userId: Number(r.studentId),
          type: "MARKS",
          title: "Marks Updated",
          message: `Your marks for ${test.title} have been updated. You scored ${r.marksObtained}/${expectedTotal}.`,
          referenceId: test.id,
        })));


      } catch (e) {
        console.error(e);
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving manual marks:", error);
    return NextResponse.json({ error: "Failed to save marks" }, { status: 500 });
  }
});
