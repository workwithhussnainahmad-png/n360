import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marks, onlineTestQuestions, onlineTestSubmissions, onlineTests, students, tests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type JsonAnswer = Record<string, string | number>;

function getAttemptExpiresAt(startedAt: Date, durationMinutes: number) {
  return new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
}

export const POST = requireRole(["STUDENT"], async (req: NextRequest, { session, params }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = (await params)?.id;
  const onlineTestId = Number(id);
  if (!Number.isInteger(onlineTestId)) return NextResponse.json({ error: "Invalid test ID" }, { status: 400 });

  try {
    const body = await req.json();
    const studentAnswers = body.answers as Record<string, string | number>;

    const [student] = await db.select()
      .from(students)
      .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
      .limit(1);

    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    const [row] = await db.select({
      onlineTest: onlineTests,
      test: tests,
    })
      .from(onlineTests)
      .innerJoin(tests, eq(onlineTests.testId, tests.id))
      .where(and(eq(onlineTests.id, onlineTestId), eq(onlineTests.institutionId, session.institutionId)))
      .limit(1);

    if (!row || row.test.classId !== student.classId || row.test.sectionId !== student.sectionId) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    const [existing] = await db.select()
      .from(onlineTestSubmissions)
      .where(and(
        eq(onlineTestSubmissions.institutionId, session.institutionId),
        eq(onlineTestSubmissions.onlineTestId, onlineTestId),
        eq(onlineTestSubmissions.studentId, session.userId)
      ))
      .limit(1);

    if (!existing) return NextResponse.json({ error: "Start the test before submitting" }, { status: 400 });
    if (existing.status !== "IN_PROGRESS") return NextResponse.json({ error: "You have already completed or failed this test" }, { status: 400 });

    if (getAttemptExpiresAt(existing.startedAt, row.onlineTest.durationMinutes) < new Date()) {
      // Mark as failed
      await db.update(onlineTestSubmissions).set({
        status: "FAILED",
        violationReason: "timeout",
        answers: { reason: "timeout" },
        mcqScore: 0,
        totalScore: 0,
        submittedAt: new Date(),
        lastHeartbeatAt: new Date(),
      }).where(eq(onlineTestSubmissions.id, existing.id));

      await db.insert(marks).values({
        institutionId: session.institutionId,
        testId: row.test.id,
        studentId: session.userId,
        marksObtained: 0,
        totalMarks: Number(row.test.maxMarks),
      }).onConflictDoUpdate({
        target: [marks.testId, marks.studentId],
        set: { marksObtained: 0, totalMarks: Number(row.test.maxMarks) },
      });

      return NextResponse.json({ error: "The test timer expired. Your submission was recorded as 0." }, { status: 400 });
    }

    const questions = await db.select()
      .from(onlineTestQuestions)
      .where(eq(onlineTestQuestions.onlineTestId, onlineTestId));

    const finalAnswers: JsonAnswer = {};
    let mcqScore = 0;

    for (const question of questions) {
      const studentAnswer = studentAnswers[String(question.id)];
      if (question.questionType === "MCQ") {
        const answerNum = Number(studentAnswer);
        if (!Number.isInteger(answerNum)) return NextResponse.json({ error: "Answer every MCQ before submitting" }, { status: 400 });
        finalAnswers[String(question.id)] = answerNum;
        if (answerNum === question.correctOptionIndex) mcqScore += Number(question.marks);
      } else {
        const answerStr = String(studentAnswer || "").trim();
        if (!answerStr) return NextResponse.json({ error: "Answer every short question before submitting" }, { status: 400 });
        finalAnswers[String(question.id)] = answerStr;
      }
    }

    const status = row.onlineTest.mode === "MCQ" ? "AUTO_GRADED" : "PENDING_REVIEW";
    const totalScore = row.onlineTest.mode === "MCQ" ? mcqScore : mcqScore;

    await db.update(onlineTestSubmissions).set({
      status,
      answers: finalAnswers,
      mcqScore,
      totalScore,
      submittedAt: new Date(),
      lastHeartbeatAt: new Date(),
    }).where(and(
      eq(onlineTestSubmissions.id, existing.id),
      eq(onlineTestSubmissions.institutionId, session.institutionId)
    ));

    if (row.onlineTest.mode === "MCQ") {
      await db.insert(marks).values({
        institutionId: session.institutionId,
        testId: row.test.id,
        studentId: session.userId,
        marksObtained: mcqScore,
        totalMarks: Number(row.test.maxMarks),
      }).onConflictDoUpdate({
        target: [marks.testId, marks.studentId],
        set: { marksObtained: mcqScore, totalMarks: Number(row.test.maxMarks) },
      });
    }

    revalidatePath("/student/tests");
    revalidatePath("/student/marks");
    revalidatePath("/staff/tests");

    return NextResponse.json({ message: "Test submitted successfully", score: mcqScore });
  } catch (error: any) {
    console.error("Error submitting online test:", error);
    return NextResponse.json({ error: "Failed to submit test details" }, { status: 500 });
  }
});
