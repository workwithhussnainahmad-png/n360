import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { onlineTestQuestions, onlineTestSubmissions, onlineTests, students, subjects, tests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { and, eq } from "drizzle-orm";

export const GET = requireRole(["STUDENT"], async (req: NextRequest, { session, params }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = (await params)?.id;
  const onlineTestId = Number(id);
  if (!Number.isInteger(onlineTestId)) return NextResponse.json({ error: "Invalid test ID" }, { status: 400 });

  try {
    const [student] = await db.select()
      .from(students)
      .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
      .limit(1);

    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    const [row] = await db.select({
      onlineTest: onlineTests,
      test: tests,
      subjectName: subjects.name,
    })
      .from(onlineTests)
      .innerJoin(tests, eq(onlineTests.testId, tests.id))
      .leftJoin(subjects, eq(tests.subjectId, subjects.id))
      .where(and(eq(onlineTests.id, onlineTestId), eq(onlineTests.institutionId, session.institutionId)))
      .limit(1);

    if (!row || row.test.classId !== student.classId || row.test.sectionId !== student.sectionId) {
      return NextResponse.json({ error: "Test not found or unavailable" }, { status: 404 });
    }

    const [submission] = await db.select()
      .from(onlineTestSubmissions)
      .where(and(
        eq(onlineTestSubmissions.institutionId, session.institutionId),
        eq(onlineTestSubmissions.onlineTestId, onlineTestId),
        eq(onlineTestSubmissions.studentId, session.userId)
      ))
      .limit(1);

    // if (submission && submission.status !== "IN_PROGRESS") {
    //   return NextResponse.json({ error: "Test already completed or failed" }, { status: 403 });
    // }

    const nowMs = new Date().getTime();
    if (!submission && row.onlineTest.createdAt.getTime() + row.onlineTest.durationMinutes * 60 * 1000 <= nowMs) {
      return NextResponse.json({ error: "Test is no longer available" }, { status: 403 });
    }

    const questionRows = await db.select()
      .from(onlineTestQuestions)
      .where(eq(onlineTestQuestions.onlineTestId, onlineTestId))
      .orderBy(onlineTestQuestions.orderIndex);

    const isFinished = submission && submission.status !== "IN_PROGRESS";

    const questions = questionRows.map((question) => ({
      id: question.id,
      questionType: question.questionType,
      prompt: question.prompt,
      options: Array.isArray(question.options) ? question.options.map(String) : null,
      marks: Number(question.marks),
      correctOptionIndex: isFinished ? question.correctOptionIndex : undefined,
    }));

    return NextResponse.json({
      test: {
        id: row.onlineTest.id,
        title: row.test.title,
        subjectName: row.subjectName,
        durationMinutes: row.onlineTest.durationMinutes,
        mode: row.onlineTest.mode,
      },
      questions,
      submission: submission ? {
        status: submission.status,
        startedAt: submission.startedAt,
        answers: submission.answers,
        totalScore: submission.totalScore,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching online test:", error);
    return NextResponse.json({ error: "Failed to fetch test details" }, { status: 500 });
  }
});
