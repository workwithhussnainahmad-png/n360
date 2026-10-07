import { db } from "@/db";
import { batchExamResults, batchExamSubjects, batchExams } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "STUDENT" || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawResults = await db.select({
      examId: batchExams.id,
      examTitle: batchExams.title,
      examType: batchExams.type,
      officialPublishedAt: batchExams.officialPublishedAt,
      examCreatedAt: batchExams.createdAt,
      subjectId: batchExamSubjects.id,
      isPublished: batchExamSubjects.isPublished,
      reviewDeadline: batchExamSubjects.reviewDeadline,
      maxMarks: batchExamSubjects.maxMarks,
      marksObtained: batchExamResults.marksObtained,
    })
    .from(batchExamResults)
    .innerJoin(batchExamSubjects, eq(batchExamResults.batchExamSubjectId, batchExamSubjects.id))
    .innerJoin(batchExams, eq(batchExamSubjects.batchExamId, batchExams.id))
    .where(eq(batchExamResults.studentId, session.userId));

    const examMap = new Map<number, { id: number, title: string, type: string, officialPublishedAt: Date | null, createdAt: Date, subjects: any[], totalMax: number, totalObtained: number, percentage: number }>();
    const now = new Date();
    
    for (const r of rawResults) {
      if (!examMap.has(r.examId)) {
        examMap.set(r.examId, {
          id: r.examId,
          title: r.examTitle,
          type: r.examType,
          officialPublishedAt: r.officialPublishedAt,
          createdAt: r.examCreatedAt,
          subjects: [],
          totalMax: 0,
          totalObtained: 0,
          percentage: 0
        });
      }
      
      const isEffectivelyPublished = r.isPublished || now > r.reviewDeadline;
      
      const exam = examMap.get(r.examId)!;
      exam.subjects.push({
        ...r,
        isEffectivelyPublished
      });
      exam.totalMax += r.maxMarks;
      exam.totalObtained += r.marksObtained;
    }

    // Calculate percentages
    for (const exam of examMap.values()) {
      exam.percentage = exam.totalMax > 0 ? Math.round((exam.totalObtained / exam.totalMax) * 100) : 0;
    }

    const publishedExams = Array.from(examMap.values()).filter(exam => 
      exam.subjects.every(s => s.isEffectivelyPublished) && (exam.type !== "PROMOTION" || Boolean(exam.officialPublishedAt))
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return NextResponse.json(publishedExams);
  } catch (error) {
    console.error("Transcripts GET error:", error);
    return NextResponse.json({ error: "Failed to fetch transcripts" }, { status: 500 });
  }
}
