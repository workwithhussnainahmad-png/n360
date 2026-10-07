import { db } from "@/db";
import { batchExamResults, batchExamSubjects, batchExams, subjects } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session || session.role !== "STUDENT" || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const examId = Number(id);

    const rawResults = await db.select({
      examTitle: batchExams.title,
      examType: batchExams.type,
      officialPublishedAt: batchExams.officialPublishedAt,
      examCreatedAt: batchExams.createdAt,
      subjectName: subjects.name,
      maxMarks: batchExamSubjects.maxMarks,
      marksObtained: batchExamResults.marksObtained,
      isPublished: batchExamSubjects.isPublished,
      reviewDeadline: batchExamSubjects.reviewDeadline,
    })
    .from(batchExamResults)
    .innerJoin(batchExamSubjects, eq(batchExamResults.batchExamSubjectId, batchExamSubjects.id))
    .innerJoin(batchExams, eq(batchExamSubjects.batchExamId, batchExams.id))
    .innerJoin(subjects, eq(batchExamSubjects.subjectId, subjects.id))
    .where(
      and(
        eq(batchExamResults.studentId, session.userId),
        eq(batchExams.id, examId)
      )
    );

    if (rawResults.length === 0) {
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    }

    const now = new Date();
    const allPublished = rawResults.every(r => r.isPublished || now > r.reviewDeadline);
    const isOfficiallyPublished = rawResults[0].examType !== "PROMOTION" || Boolean(rawResults[0].officialPublishedAt);
    
    if (!allPublished || !isOfficiallyPublished) {
      return NextResponse.json({ error: "Transcript is pending review" }, { status: 400 });
    }

    return NextResponse.json({
      examTitle: rawResults[0].examTitle,
      examType: rawResults[0].examType,
      examCreatedAt: rawResults[0].examCreatedAt,
      results: rawResults.map(r => ({
        subjectName: r.subjectName,
        maxMarks: r.maxMarks,
        marksObtained: r.marksObtained
      }))
    });
  } catch (error) {
    console.error("Transcript details GET error:", error);
    return NextResponse.json({ error: "Failed to fetch transcript details" }, { status: 500 });
  }
}
