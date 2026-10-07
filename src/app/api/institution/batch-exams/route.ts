import { db } from "@/db";
import {
  batchExams, batchExamSubjects, batchExamResults,
  classes, sections, subjects, students, staffAssignments
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, eq, inArray, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, requireRole } from "@/lib/rbac";

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type"); // optional: MONTHLY|MID|FINAL|PROMOTION

    const institutionId = getTenantContext(session);
    const conditions = [eq(batchExams.institutionId, institutionId)];
    if (type && ["MONTHLY", "MID", "FINAL", "PROMOTION"].includes(type)) {
      conditions.push(eq(batchExams.type, type as any));
    }

    const batches = await db
      .select({
        id: batchExams.id,
        title: batchExams.title,
        type: batchExams.type,
        className: classes.name,
        sectionName: sections.name,
        createdAt: batchExams.createdAt,
        officialPublishedAt: batchExams.officialPublishedAt,
      })
      .from(batchExams)
      .innerJoin(classes, eq(batchExams.classId, classes.id))
      .leftJoin(sections, eq(batchExams.sectionId, sections.id))
      .where(and(...conditions))
      .orderBy(desc(batchExams.createdAt));

    const subjectRows = await db
      .select({
        batchExamId: batchExamSubjects.batchExamId,
        isPublished: batchExamSubjects.isPublished,
        reviewDeadline: batchExamSubjects.reviewDeadline,
      })
      .from(batchExamSubjects)
      .innerJoin(batchExams, eq(batchExamSubjects.batchExamId, batchExams.id))
      .where(and(...conditions));

    const now = new Date();
    const subjectsByBatch = new Map<number, typeof subjectRows>();
    for (const row of subjectRows) {
      if (!subjectsByBatch.has(row.batchExamId)) subjectsByBatch.set(row.batchExamId, []);
      subjectsByBatch.get(row.batchExamId)!.push(row);
    }

    const result = batches.map((b) => {
      const subs = subjectsByBatch.get(b.id) || [];
      const allSubjectsPublished = subs.length > 0 && subs.every((s) => {
        if (s.isPublished) return true;
        if (!s.reviewDeadline) return false;
        return now > s.reviewDeadline;
      });
      return {
        ...b,
        sectionName: b.sectionName || null,
        allSubjectsPublished,
      };
    });

    return NextResponse.json({ batches: result });
  } catch (error: any) {
    console.error("Batch exams list error:", error);
    return NextResponse.json({ error: error.message || "Failed to list batch exams" }, { status: 500 });
  }
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (session?.campusReadOnly || session?.mustChangePassword) return NextResponse.json({ error: session.mustChangePassword ? "PASSWORD_CHANGE_REQUIRED" : "This campus is read-only." }, { status: 403 });
    if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN") || !session.institutionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { title, type = "FINAL", classId, sectionId, subjects: rawSubjects, studentMarks } = await req.json();

    if (!title || !classId || !rawSubjects || !studentMarks) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const parsedClassId = Number(classId);
    const resultType = String(type);
    const parsedSectionId = sectionId === null || sectionId === undefined || sectionId === ""
      ? null
      : Number(sectionId);
    if (!Array.isArray(rawSubjects) || !Array.isArray(studentMarks)) {
      return NextResponse.json({ error: "Subjects and student marks must be lists." }, { status: 400 });
    }
    if (rawSubjects.some((subject) => !subject || typeof subject !== "object")) {
      return NextResponse.json({ error: "One or more result subjects are invalid. Re-process the CSV and try again." }, { status: 400 });
    }
    if (studentMarks.some((student) => !student || typeof student !== "object" || !student.marks || typeof student.marks !== "object")) {
      return NextResponse.json({ error: "One or more student mark rows are invalid. Re-process the CSV and try again." }, { status: 400 });
    }
    const requestedSubjects = rawSubjects.map((subject: { subjectId?: unknown; maxMarks?: unknown; name?: unknown }) => ({
      subjectId: Number(subject.subjectId),
      maxMarks: Number(subject.maxMarks),
      name: typeof subject.name === "string" ? subject.name : "",
    }));
    const requestedSubjectIds = Array.from(new Set(requestedSubjects.map((subject) => subject.subjectId)));

    if (
      !Number.isInteger(parsedClassId) ||
      (parsedSectionId !== null && !Number.isInteger(parsedSectionId)) ||
      requestedSubjects.length === 0 ||
      requestedSubjectIds.length !== requestedSubjects.length ||
      requestedSubjectIds.some((subjectId) => !Number.isInteger(subjectId) || subjectId <= 0)
      || requestedSubjects.some((subject) => !Number.isFinite(subject.maxMarks) || subject.maxMarks <= 0)
      || !["MONTHLY", "MID", "FINAL", "PROMOTION"].includes(resultType)
    ) {
      return NextResponse.json({ error: "Invalid class, section, or subject selection" }, { status: 400 });
    }

    const [[classRow], sectionRows, subjectRows] = await Promise.all([
      db.select({ id: classes.id })
        .from(classes)
        .where(and(
          eq(classes.id, parsedClassId),
          eq(classes.institutionId, session.institutionId)
        ))
        .limit(1),
      parsedSectionId === null
        ? Promise.resolve([])
        : db.select({ id: sections.id, classId: sections.classId })
          .from(sections)
          .where(and(
            eq(sections.id, parsedSectionId),
            eq(sections.institutionId, session.institutionId)
          ))
          .limit(1),
      db.select({ id: subjects.id })
        .from(subjects)
        .where(and(
          eq(subjects.institutionId, session.institutionId),
          inArray(subjects.id, requestedSubjectIds)
        )),
    ]);

    const sectionRow = sectionRows[0];
    if (
      !classRow ||
      (sectionRow && sectionRow.classId !== parsedClassId) ||
      subjectRows.length !== requestedSubjectIds.length
    ) {
      return NextResponse.json({ error: "Invalid class, section, or subject selection" }, { status: 400 });
    }

    // 1. Fetch students by roll numbers to get their IDs
    const rollNumbers = studentMarks.map((s: { rollNumber?: unknown }) => String(s.rollNumber || "").trim());
    if (rollNumbers.length === 0) {
      return NextResponse.json({ error: "No students provided" }, { status: 400 });
    }

    const studentRecords = await db.select({
      id: students.id,
      classRollNumber: students.classRollNumber
    })
    .from(students)
    .where(
      and(
        eq(students.institutionId, session.institutionId),
        eq(students.classId, parsedClassId),
        inArray(students.classRollNumber, rollNumbers)
      )
    );

    const studentIdMap = new Map(studentRecords.map(s => [s.classRollNumber, s.id]));

    // 2. Fetch staff assignments to find subject teachers
    let assignments: any[] = [];
    if (parsedSectionId !== null) {
      assignments = await db.select({
        subjectId: staffAssignments.subjectId,
        staffId: staffAssignments.staffId
      })
      .from(staffAssignments)
      .where(
        and(
          eq(staffAssignments.institutionId, session.institutionId),
          eq(staffAssignments.sectionId, parsedSectionId),
          inArray(staffAssignments.subjectId, requestedSubjectIds)
        )
      );
    }
    const staffIdMap = new Map(assignments.map(a => [a.subjectId, a.staffId]));

    // Calculate review deadline (6 hours from now).
    const reviewDeadline = new Date();
    reviewDeadline.setHours(reviewDeadline.getHours() + 6);

    await db.transaction(async (tx) => {
      const [newExam] = await tx.insert(batchExams).values({
        institutionId: session.institutionId!,
        classId: parsedClassId,
        sectionId: parsedSectionId,
        title,
        type: resultType as "MONTHLY" | "MID" | "FINAL" | "PROMOTION",
      }).returning({ id: batchExams.id });

      const createdSubjects = await tx.insert(batchExamSubjects).values(
        requestedSubjects.map((subject) => {
          const staffId = staffIdMap.get(subject.subjectId) || null;
          return {
            batchExamId: newExam.id,
            subjectId: subject.subjectId,
            maxMarks: subject.maxMarks,
            staffId,
            reviewDeadline,
            isPublished: !staffId,
          };
        })
      ).returning({ id: batchExamSubjects.id, subjectId: batchExamSubjects.subjectId });

      const batchExamSubjectIdBySubjectId = new Map(
        createdSubjects.map((subject) => [subject.subjectId, subject.id])
      );
      const resultsToInsert: Array<typeof batchExamResults.$inferInsert> = [];

      for (const subject of requestedSubjects) {
        const batchExamSubjectId = batchExamSubjectIdBySubjectId.get(subject.subjectId);
        if (!batchExamSubjectId) throw new Error("Failed to create batch exam subject");

        for (const student of studentMarks as Array<{ rollNumber: string; marks: Record<number, unknown> }>) {
          const studentId = studentIdMap.get(String(student.rollNumber));
          const marksObtained = student.marks[subject.subjectId];
          if (studentId && marksObtained !== undefined && marksObtained !== null) {
            resultsToInsert.push({
              batchExamSubjectId,
              studentId,
              marksObtained: Number(marksObtained),
              isEdited: false,
            });
          }
        }
      }

      const RESULT_INSERT_CHUNK_SIZE = 2000;
      for (let start = 0; start < resultsToInsert.length; start += RESULT_INSERT_CHUNK_SIZE) {
        await tx.insert(batchExamResults).values(
          resultsToInsert.slice(start, start + RESULT_INSERT_CHUNK_SIZE)
        );
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Batch exam upload error:", error);
    return NextResponse.json({ error: error.message || "Failed to upload" }, { status: 500 });
  }
}
