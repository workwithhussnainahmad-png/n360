import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { onlineTestSubmissions, onlineTests, tests, onlineTestQuestions, marks } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { eq, and } from "drizzle-orm";

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session, params }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = (await params)?.id;
  const submissionId = Number(id);
  if (!Number.isInteger(submissionId)) return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });

  try {
    const body = await req.json();
    const { shortScores } = body;

    const [row] = await db.select({
      submission: onlineTestSubmissions,
      onlineTest: onlineTests,
      test: tests,
    })
      .from(onlineTestSubmissions)
      .innerJoin(onlineTests, eq(onlineTestSubmissions.onlineTestId, onlineTests.id))
      .innerJoin(tests, eq(onlineTests.testId, tests.id))
      .where(and(eq(onlineTestSubmissions.id, submissionId), eq(onlineTestSubmissions.institutionId, session.institutionId)))
      .limit(1);

    if (!row || row.test.staffId !== session.userId) {
      return NextResponse.json({ error: "Submission not found or unauthorized" }, { status: 404 });
    }

    const questions = await db.select().from(onlineTestQuestions).where(eq(onlineTestQuestions.onlineTestId, row.onlineTest.id));
    
    let shortScore = 0;
    for (const question of questions.filter(q => q.questionType === "SHORT")) {
      const score = Number(shortScores[question.id]);
      if (!Number.isFinite(score) || score < 0 || score > Number(question.marks)) {
        return NextResponse.json({ error: `Invalid short-question score for question ${question.id}` }, { status: 400 });
      }
      shortScore += score;
    }

    const totalScore = Number(row.submission.mcqScore || 0) + shortScore;
    
    await db.update(onlineTestSubmissions)
      .set({ 
        status: "GRADED", 
        shortScore, 
        totalScore, 
        gradedAt: new Date(), 
        gradedBy: session.userId 
      })
      .where(eq(onlineTestSubmissions.id, submissionId));

    // Upsert marks
    await db.insert(marks).values({
      institutionId: session.institutionId,
      testId: row.test.id,
      studentId: row.submission.studentId,
      marksObtained: totalScore,
      totalMarks: Number(row.test.maxMarks),
    }).onConflictDoUpdate({
      target: [marks.testId, marks.studentId],
      set: { marksObtained: totalScore, totalMarks: Number(row.test.maxMarks) },
    });

    return NextResponse.json({ success: true, totalScore });
  } catch (error) {
    console.error("Error grading online test:", error);
    return NextResponse.json({ error: "Failed to grade submission" }, { status: 500 });
  }
});
