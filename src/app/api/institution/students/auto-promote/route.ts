import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { batchExamResults, batchExamSubjects, batchExams, classes, sections, students, subjects } from "@/db/schema";
import { autoPromotePublishedBatch } from "@/lib/batch-promotion";
import { getTenantContext, requireRole } from "@/lib/rbac";

/**
 * Shows PROMOTION result batches. Teachers publish subjects first; the institution
 * uses POST to officially publish the result and run promotion/retention.
 */
export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (_req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const requestedBatchIdParam = _req.nextUrl.searchParams.get("batchExamId");
  const requestedBatchId = requestedBatchIdParam === null ? null : Number(requestedBatchIdParam);
  if (requestedBatchId !== null && Number.isInteger(requestedBatchId)) {
    const rows = await db.select({ student: students.name, roll: students.classRollNumber, subject: subjects.name, marks: batchExamResults.marksObtained, maxMarks: batchExamSubjects.maxMarks })
      .from(batchExamResults).innerJoin(batchExamSubjects, eq(batchExamResults.batchExamSubjectId, batchExamSubjects.id)).innerJoin(batchExams, eq(batchExamSubjects.batchExamId, batchExams.id)).innerJoin(students, eq(batchExamResults.studentId, students.id)).innerJoin(subjects, eq(batchExamSubjects.subjectId, subjects.id))
      .where(and(eq(batchExams.id, requestedBatchId), eq(batchExams.institutionId, institutionId), eq(batchExams.type, "PROMOTION")));
    return NextResponse.json({ rows });
  }
  const [batches, subjectRows] = await Promise.all([
    db.select({
      id: batchExams.id,
      title: batchExams.title,
      className: classes.name,
      sectionName: sections.name,
      officialPublishedAt: batchExams.officialPublishedAt,
      createdAt: batchExams.createdAt,
    })
      .from(batchExams)
      .innerJoin(classes, eq(batchExams.classId, classes.id))
      .leftJoin(sections, eq(batchExams.sectionId, sections.id))
      .where(and(eq(batchExams.institutionId, institutionId), eq(batchExams.type, "PROMOTION")))
      .orderBy(batchExams.createdAt),
    db.select({ batchExamId: batchExamSubjects.batchExamId, isPublished: batchExamSubjects.isPublished })
      .from(batchExamSubjects)
      .innerJoin(batchExams, eq(batchExamSubjects.batchExamId, batchExams.id))
      .where(and(eq(batchExams.institutionId, institutionId), eq(batchExams.type, "PROMOTION"))),
  ]);

  return NextResponse.json({
    batches: batches.map((batch) => {
      const subjects = subjectRows.filter((subject) => subject.batchExamId === batch.id);
      return { ...batch, subjectCount: subjects.length, allSubjectsPublished: subjects.length > 0 && subjects.every((subject) => subject.isPublished) };
    }),
  });
});

export const POST = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const batchExamId = Number((await req.json().catch(() => ({}))).batchExamId);
  if (!Number.isInteger(batchExamId)) return NextResponse.json({ error: "batchExamId is required" }, { status: 400 });

  const [batch] = await db.select({ id: batchExams.id })
    .from(batchExams)
    .where(and(eq(batchExams.id, batchExamId), eq(batchExams.institutionId, institutionId), eq(batchExams.type, "PROMOTION")))
    .limit(1);
  if (!batch) return NextResponse.json({ error: "Promotion batch not found" }, { status: 404 });

  const result = await autoPromotePublishedBatch(batch.id);
  if (!result.promoted) {
    const reason = result.reason || "promotion could not be completed";
    return NextResponse.json({ error: reason.replaceAll("_", " "), result }, { status: 409 });
  }
  await db.update(batchExams).set({ officialPublishedAt: new Date() }).where(eq(batchExams.id, batch.id));
  return NextResponse.json({ success: true, result });
});
