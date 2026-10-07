import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { onlineTestQuestions, onlineTestSubmissions, onlineTests, students, tests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { and, desc, eq } from "drizzle-orm";

export const GET = requireRole(["STAFF"], async (_req: NextRequest, { session, params }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const onlineTestId = Number((await params)?.id);
  if (!Number.isInteger(onlineTestId) || onlineTestId <= 0) {
    return NextResponse.json({ error: "Invalid hosted test ID" }, { status: 400 });
  }

  const [hostedTest] = await db.select({
    onlineTestId: onlineTests.id,
    testId: tests.id,
    maxMarks: tests.maxMarks,
    mode: onlineTests.mode,
  })
    .from(onlineTests)
    .innerJoin(tests, eq(onlineTests.testId, tests.id))
    .where(and(
      eq(onlineTests.id, onlineTestId),
      eq(onlineTests.institutionId, session.institutionId),
      eq(tests.institutionId, session.institutionId),
      eq(tests.staffId, session.userId)
    ))
    .limit(1);

  if (!hostedTest) return NextResponse.json({ error: "Hosted test not found" }, { status: 404 });

  const [questions, submissions] = await Promise.all([
    db.select({
      id: onlineTestQuestions.id,
      questionType: onlineTestQuestions.questionType,
      prompt: onlineTestQuestions.prompt,
      marks: onlineTestQuestions.marks,
      orderIndex: onlineTestQuestions.orderIndex,
    })
      .from(onlineTestQuestions)
      .where(eq(onlineTestQuestions.onlineTestId, onlineTestId))
      .orderBy(onlineTestQuestions.orderIndex),
    db.select({
      id: onlineTestSubmissions.id,
      studentName: students.name,
      rollNumber: students.classRollNumber,
      status: onlineTestSubmissions.status,
      violationReason: onlineTestSubmissions.violationReason,
      totalScore: onlineTestSubmissions.totalScore,
      submittedAt: onlineTestSubmissions.submittedAt,
    })
      .from(onlineTestSubmissions)
      .innerJoin(students, eq(onlineTestSubmissions.studentId, students.id))
      .where(and(
        eq(onlineTestSubmissions.onlineTestId, onlineTestId),
        eq(onlineTestSubmissions.institutionId, session.institutionId),
        eq(students.institutionId, session.institutionId)
      ))
      .orderBy(desc(onlineTestSubmissions.submittedAt)),
  ]);

  return NextResponse.json({ hostedTest, questions, submissions });
});
