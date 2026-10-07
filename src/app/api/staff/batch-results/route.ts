import { db } from "@/db";
import { batchExams, batchExamSubjects, classes, sections, subjects } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "STAFF" || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const assignedSubjects = await db.select({
      id: batchExamSubjects.id,
      maxMarks: batchExamSubjects.maxMarks,
      isPublished: batchExamSubjects.isPublished,
      reviewDeadline: batchExamSubjects.reviewDeadline,
      subjectName: subjects.name,
      examTitle: batchExams.title,
      examType: batchExams.type,
      className: classes.name,
      sectionName: sections.name,
      createdAt: batchExamSubjects.createdAt,
      isEffectivelyPublished: sql<boolean>`${batchExamSubjects.isPublished} OR now() > ${batchExamSubjects.reviewDeadline}`,
    })
    .from(batchExamSubjects)
    .innerJoin(batchExams, eq(batchExamSubjects.batchExamId, batchExams.id))
    .innerJoin(subjects, eq(batchExamSubjects.subjectId, subjects.id))
    .innerJoin(classes, eq(batchExams.classId, classes.id))
    .leftJoin(sections, eq(batchExams.sectionId, sections.id))
    .where(and(
      eq(batchExamSubjects.staffId, session.userId),
      gte(batchExamSubjects.reviewDeadline, sql`now() - interval '36 hours'`)
    ))
    .orderBy(desc(batchExamSubjects.createdAt));

    return NextResponse.json(assignedSubjects);
  } catch (error: any) {
    console.error("Fetch batch results error:", error);
    return NextResponse.json({ error: "Failed to fetch results" }, { status: 500 });
  }
}
