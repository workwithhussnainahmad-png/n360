"use server";

import { db } from "@/db";
import {
  classes,
  marks,
  onlineTestQuestions,
  onlineTestSubmissions,
  onlineTests,
  sections,
  staffAssignments,
  students,
  subjects,
  tests,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type JsonAnswer = Record<string, string | number>;
type OnlineViolationReason = "tab_switch" | "timeout" | "disconnect";

// The browser reports every 30s. Allow three missed intervals plus scheduling
// jitter before treating an attempt as disconnected.
const HEARTBEAT_STALE_MS = 100_000;

function onlineTestHeartbeatKey(institutionId: number, onlineTestId: number, studentId: number) {
  return `test:heartbeat:${institutionId}:${onlineTestId}:${studentId}`;
}

function asNumber(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} is required`);
  return parsed;
}

function asInteger(value: FormDataEntryValue | null, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} is required`);
  return parsed;
}

async function requireStaffAssignment(staffId: number, institutionId: number, sectionId: number, subjectId: number) {
  const [assignment] = await db.select({
    classId: sections.classId,
    sectionName: sections.name,
    className: classes.name,
    subjectName: subjects.name,
  })
    .from(staffAssignments)
    .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
    .innerJoin(classes, eq(sections.classId, classes.id))
    .innerJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
    .where(and(
      eq(staffAssignments.staffId, staffId),
      eq(staffAssignments.institutionId, institutionId),
      eq(staffAssignments.sectionId, sectionId),
      eq(staffAssignments.subjectId, subjectId)
    ))
    .limit(1);

  if (!assignment) throw new Error("This class section and subject are not assigned to you");
  return assignment;
}

function collectMcqs(formData: FormData, mcqMarks: number) {
  const prompts = formData.getAll("mcqPrompt").map((value) => String(value).trim());
  return prompts.map((prompt, index) => {
    const options = [0, 1, 2, 3].map((optionIndex) => String(formData.get(`mcqOption-${index}-${optionIndex}`) || "").trim());
    const correctOptionIndex = Number(formData.get(`mcqCorrect-${index}`));
    if (!prompt) throw new Error(`MCQ ${index + 1} question is required`);
    if (options.some((option) => !option)) throw new Error(`MCQ ${index + 1} must have four options`);
    if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex > 3) {
      throw new Error(`MCQ ${index + 1} correct option is required`);
    }
    return { prompt, options, correctOptionIndex, marks: mcqMarks };
  });
}

function collectShortQuestions(formData: FormData) {
  const prompts = formData.getAll("shortPrompt").map((value) => String(value).trim());
  const marksValues = formData.getAll("shortMarks").map((value) => Number(value));
  return prompts.map((prompt, index) => {
    const questionMarks = marksValues[index];
    if (!prompt) throw new Error(`Short question ${index + 1} is required`);
    if (!Number.isFinite(questionMarks) || questionMarks <= 0) throw new Error(`Short question ${index + 1} marks are required`);
    return { prompt, marks: questionMarks };
  });
}

export async function createOnlineTestAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) throw new Error("Unauthorized");

  const sectionId = asInteger(formData.get("sectionId"), "Class section");
  const subjectId = asInteger(formData.get("subjectId"), "Subject");
  const title = String(formData.get("title") || "").trim();
  const mode = String(formData.get("mode") || "");
  const durationMinutes = asInteger(formData.get("durationMinutes"), "Timer");
  const mcqMarks = asNumber(formData.get("mcqMarks"), "MCQ marks");
  if (!title) throw new Error("Test title is required");
  if (mode !== "MCQ" && mode !== "MIX") throw new Error("Invalid test mode");

  const assignment = await requireStaffAssignment(session.userId, session.institutionId, sectionId, subjectId);
  const mcqs = collectMcqs(formData, mcqMarks);
  if (mcqs.length === 0) throw new Error("Add at least one MCQ");
  const shortQuestions = mode === "MIX" ? collectShortQuestions(formData) : [];
  if (mode === "MIX" && shortQuestions.length === 0) throw new Error("Mix tests need at least one short question");

  const totalMarks = mcqs.reduce((sum, question) => sum + question.marks, 0) + shortQuestions.reduce((sum, question) => sum + question.marks, 0);
  const today = new Date().toISOString().slice(0, 10);
  const [test] = await db.insert(tests).values({
    institutionId: session.institutionId,
    classId: assignment.classId,
    sectionId,
    subjectId,
    staffId: session.userId,
    createdByRole: "STAFF",
    type: "QUIZ",
    title,
    maxMarks: totalMarks,
    date: today,
    resultsPublishedAt: new Date(),
  }).returning();

  const [onlineTest] = await db.insert(onlineTests).values({
    institutionId: session.institutionId,
    testId: test.id,
    mode: mode as "MCQ" | "MIX",
    durationMinutes,
  }).returning();

  let orderIndex = 0;
  const allQuestions = [
    ...mcqs.map((question: { prompt: string; options: string[]; correctOptionIndex: number; marks: number }) => ({
      onlineTestId: onlineTest.id,
      questionType: 'MCQ' as const,
      prompt: question.prompt,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      marks: question.marks,
      orderIndex: orderIndex++,
    })),
    ...shortQuestions.map((question: { prompt: string; marks: number }) => ({
      onlineTestId: onlineTest.id,
      questionType: 'SHORT' as const,
      prompt: question.prompt,
      marks: question.marks,
      orderIndex: orderIndex++,
    })),
  ];
  if (allQuestions.length > 0) {
    await db.insert(onlineTestQuestions).values(allQuestions);
  }

  const { createOnlineTestNotifications } = await import("@/lib/notifications");
  await createOnlineTestNotifications({
    institutionId: session.institutionId,
    sectionId,
    onlineTestId: onlineTest.id,
    title,
    className: assignment.className,
    sectionName: assignment.sectionName,
    subjectName: assignment.subjectName,
    durationMinutes,
  });

  revalidatePath("/staff/tests");
  revalidatePath("/student/tests");
  revalidatePath("/staff/dashboard");
  revalidatePath("/student/dashboard");
}

export async function deleteOnlineTestAction(testId: number) {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) throw new Error("Unauthorized");

  const [test] = await db.select().from(tests).where(and(
    eq(tests.id, testId),
    eq(tests.institutionId, session.institutionId)
  )).limit(1);

  if (!test) throw new Error("Test not found");
  if (test.staffId !== session.userId) throw new Error("You can only delete tests you hosted");

  await db.delete(tests).where(eq(tests.id, testId));

  revalidatePath("/staff/tests");
  revalidatePath("/staff/dashboard");
}

export async function updateOnlineTestAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) throw new Error("Unauthorized");

  const testId = asInteger(formData.get("testId"), "Test");
  const title = String(formData.get("title") || "").trim();
  const durationMinutesStr = String(formData.get("durationMinutes") || "");
  const durationMinutes = durationMinutesStr ? asInteger(formData.get("durationMinutes"), "Duration") : null;

  if (!title) throw new Error("Test title is required");

  const [test] = await db.select().from(tests).where(and(
    eq(tests.id, testId),
    eq(tests.institutionId, session.institutionId)
  )).limit(1);

  if (!test) throw new Error("Test not found");
  if (test.staffId !== session.userId) throw new Error("You can only edit tests you hosted");

  await db.update(tests).set({ title }).where(eq(tests.id, testId));

  if (durationMinutes !== null) {
    await db.update(onlineTests).set({ durationMinutes }).where(eq(onlineTests.testId, testId));
  }

  revalidatePath("/staff/tests");
  revalidatePath("/staff/dashboard");
}

async function getStudentOnlineTest(studentId: number, institutionId: number, onlineTestId: number) {
  const [student] = await db.select().from(students).where(and(eq(students.id, studentId), eq(students.institutionId, institutionId))).limit(1);
  if (!student) throw new Error("Student not found");

  const [row] = await db.select({
    onlineTest: onlineTests,
    test: tests,
  })
    .from(onlineTests)
    .innerJoin(tests, eq(onlineTests.testId, tests.id))
    .where(and(eq(onlineTests.id, onlineTestId), eq(onlineTests.institutionId, institutionId)))
    .limit(1);
  if (!row || row.test.classId !== student.classId || row.test.sectionId !== student.sectionId) throw new Error("Test not found");
  return row;
}

async function saveStudentMark(institutionId: number, testId: number, studentId: number, marksObtained: number, totalMarks: number) {
  await db.insert(marks).values({
    institutionId,
    testId,
    studentId,
    marksObtained,
    totalMarks,
  }).onConflictDoUpdate({
    target: [marks.testId, marks.studentId],
    set: { marksObtained, totalMarks },
  });
}

function getAttemptExpiresAt(startedAt: Date, durationMinutes: number) {
  return new Date(startedAt.getTime() + durationMinutes * 60 * 1000);
}

async function markOnlineTestFailed(
  row: Awaited<ReturnType<typeof getStudentOnlineTest>>,
  studentId: number,
  reason: OnlineViolationReason,
  submissionId?: number
) {
  const now = new Date();
  const status = reason === "disconnect" ? "ABANDONED" : "FAILED";
  const updateValues = {
    status,
    violationReason: reason,
    answers: { reason },
    mcqScore: 0,
    shortScore: null,
    totalScore: 0,
    submittedAt: now,
    lastHeartbeatAt: now,
  } as const;

  if (submissionId) {
    await db.update(onlineTestSubmissions)
      .set(updateValues)
      .where(and(
        eq(onlineTestSubmissions.id, submissionId),
        eq(onlineTestSubmissions.institutionId, row.onlineTest.institutionId)
      ));
  } else {
    await db.insert(onlineTestSubmissions).values({
      institutionId: row.onlineTest.institutionId,
      onlineTestId: row.onlineTest.id,
      studentId,
      ...updateValues,
    }).onConflictDoNothing();
  }

  await saveStudentMark(row.onlineTest.institutionId, row.test.id, studentId, 0, Number(row.test.maxMarks));
}

export async function expireStaleOnlineSubmissions(institutionId: number) {
  const cutoff = new Date(Date.now() - HEARTBEAT_STALE_MS);
  const rows = await db.select({
    submissionId: onlineTestSubmissions.id,
    studentId: onlineTestSubmissions.studentId,
    startedAt: onlineTestSubmissions.startedAt,
    onlineTestId: onlineTests.id,
    durationMinutes: onlineTests.durationMinutes,
    testId: tests.id,
    maxMarks: tests.maxMarks,
  })
    .from(onlineTestSubmissions)
    .innerJoin(onlineTests, eq(onlineTestSubmissions.onlineTestId, onlineTests.id))
    .innerJoin(tests, eq(onlineTests.testId, tests.id))
    .where(and(
      eq(onlineTestSubmissions.institutionId, institutionId),
      eq(onlineTestSubmissions.status, "IN_PROGRESS"),
      lt(onlineTestSubmissions.lastHeartbeatAt, cutoff)
    ));

  if (rows.length === 0) return;

  const now = new Date();
  const timedOutRows = rows.filter((item) => (
    getAttemptExpiresAt(item.startedAt, item.durationMinutes) <= now
  ));
  const livenessCandidates = rows.filter((item) => (
    getAttemptExpiresAt(item.startedAt, item.durationMinutes) > now
  ));

  // Heartbeats live in Valkey to avoid one PostgreSQL WAL write per student
  // every few seconds. The DB timestamp only selects possible stale rows; Valkey
  // is authoritative for disconnection. If Valkey is unavailable we fail open
  // and defer disconnection instead of incorrectly failing active students.
  const disconnectedRows: typeof rows = [];
  const { redis } = await import('@/lib/redis');
  if (livenessCandidates.length > 0 && redis.status === 'ready') {
    try {
      for (let start = 0; start < livenessCandidates.length; start += 500) {
        const candidates = livenessCandidates.slice(start, start + 500);
        const keys = candidates.map((item) => onlineTestHeartbeatKey(
          institutionId,
          item.onlineTestId,
          item.studentId,
        ));
        const liveness = await redis.mget(...keys);
        disconnectedRows.push(...candidates.filter((_, index) => !liveness[index]));
      }
    } catch (error) {
      console.warn('Online-test heartbeat lookup failed; deferring disconnect cleanup:', error);
    }
  }

  const timedOutIds = timedOutRows.map((item) => item.submissionId);
  const disconnectedIds = disconnectedRows.map((item) => item.submissionId);

  // Batch the status updates instead of one round trip per stale submission.
  const statusGroups: { ids: number[]; status: "FAILED" | "ABANDONED"; reason: OnlineViolationReason }[] = [
    { ids: timedOutIds, status: "FAILED", reason: "timeout" },
    { ids: disconnectedIds, status: "ABANDONED", reason: "disconnect" },
  ];
  for (const group of statusGroups) {
    if (group.ids.length === 0) continue;
    await db.update(onlineTestSubmissions).set({
      status: group.status,
      violationReason: group.reason,
      answers: { reason: group.reason },
      mcqScore: 0,
      shortScore: null,
      totalScore: 0,
      submittedAt: now,
      lastHeartbeatAt: now,
    }).where(and(
      eq(onlineTestSubmissions.institutionId, institutionId),
      inArray(onlineTestSubmissions.id, group.ids)
    ));
  }

  const failedRows = [...timedOutRows, ...disconnectedRows];
  if (failedRows.length === 0) return;

  const markValues = failedRows.map((item) => ({
    institutionId,
    testId: item.testId,
    studentId: item.studentId,
    marksObtained: 0,
    totalMarks: Number(item.maxMarks),
  }));
  await db.insert(marks).values(markValues).onConflictDoUpdate({
    target: [marks.testId, marks.studentId],
    set: {
      marksObtained: sql`EXCLUDED.marks_obtained`,
      totalMarks: sql`EXCLUDED.total_marks`,
    },
  });
}

export async function startOnlineTestAttemptAction(onlineTestId: number) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) throw new Error("Unauthorized");

  await expireStaleOnlineSubmissions(session.institutionId);
  const row = await getStudentOnlineTest(session.userId, session.institutionId, onlineTestId);
  const [existing] = await db.select().from(onlineTestSubmissions).where(and(
    eq(onlineTestSubmissions.institutionId, session.institutionId),
    eq(onlineTestSubmissions.onlineTestId, onlineTestId),
    eq(onlineTestSubmissions.studentId, session.userId)
  )).limit(1);

  if (existing) {
    if (existing.status !== "IN_PROGRESS") throw new Error("You have already completed or failed this test");
    const expiresAt = getAttemptExpiresAt(existing.startedAt, row.onlineTest.durationMinutes);
    if (expiresAt <= new Date()) {
      await markOnlineTestFailed(row, session.userId, "timeout", existing.id);
      throw new Error("The test timer expired");
    }
    await db.update(onlineTestSubmissions)
      .set({ lastHeartbeatAt: new Date() })
      .where(and(eq(onlineTestSubmissions.id, existing.id), eq(onlineTestSubmissions.institutionId, session.institutionId)));
    return { expiresAt: expiresAt.toISOString() };
  }

  const now = new Date();
  await db.insert(onlineTestSubmissions).values({
    institutionId: session.institutionId,
    onlineTestId,
    studentId: session.userId,
    status: "IN_PROGRESS",
    answers: {},
    startedAt: now,
    lastHeartbeatAt: now,
  });

  return { expiresAt: getAttemptExpiresAt(now, row.onlineTest.durationMinutes).toISOString() };
}

export async function heartbeatOnlineTestAction(onlineTestId: number, providedSession?: { userId: number; role: string; institutionId?: number | null }) {
  const session = providedSession ?? await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) throw new Error("Unauthorized");

  // Use Valkey for ephemeral liveness instead of DB WAL churn
  const { redis } = await import('@/lib/redis');
  const key = onlineTestHeartbeatKey(session.institutionId, onlineTestId, session.userId);
  
  if (redis.status === 'ready') {
    await redis.setex(key, Math.ceil(HEARTBEAT_STALE_MS / 1000), '1');
  }

  return { ok: true };
}

export async function submitOnlineTestAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) throw new Error("Unauthorized");

  const onlineTestId = asInteger(formData.get("onlineTestId"), "Test");
  const row = await getStudentOnlineTest(session.userId, session.institutionId, onlineTestId);
  const [existing] = await db.select().from(onlineTestSubmissions).where(and(
    eq(onlineTestSubmissions.institutionId, session.institutionId),
    eq(onlineTestSubmissions.onlineTestId, onlineTestId),
    eq(onlineTestSubmissions.studentId, session.userId)
  )).limit(1);
  if (!existing) throw new Error("Start the test before submitting");
  if (existing.status !== "IN_PROGRESS") throw new Error("You have already completed or failed this test");

  if (getAttemptExpiresAt(existing.startedAt, row.onlineTest.durationMinutes) < new Date()) {
    await markOnlineTestFailed(row, session.userId, "timeout", existing.id);
    throw new Error("The test timer expired. Your submission was recorded as 0.");
  }

  const questions = await db.select().from(onlineTestQuestions).where(eq(onlineTestQuestions.onlineTestId, onlineTestId));
  const answers: JsonAnswer = {};
  let mcqScore = 0;

  for (const question of questions) {
    if (question.questionType === "MCQ") {
      const answer = Number(formData.get(`answer-${question.id}`));
      if (!Number.isInteger(answer)) throw new Error("Answer every MCQ before submitting");
      answers[String(question.id)] = answer;
      if (answer === question.correctOptionIndex) mcqScore += Number(question.marks);
    } else {
      const answer = String(formData.get(`answer-${question.id}`) || "").trim();
      if (!answer) throw new Error("Answer every short question before submitting");
      answers[String(question.id)] = answer;
    }
  }

  const status = row.onlineTest.mode === "MCQ" ? "AUTO_GRADED" : "PENDING_REVIEW";
  const totalScore = row.onlineTest.mode === "MCQ" ? mcqScore : mcqScore;
  await db.update(onlineTestSubmissions).set({
    status,
    answers,
    mcqScore,
    totalScore,
    submittedAt: new Date(),
    lastHeartbeatAt: new Date(),
  }).where(and(
    eq(onlineTestSubmissions.id, existing.id),
    eq(onlineTestSubmissions.institutionId, session.institutionId)
  ));

  if (row.onlineTest.mode === "MCQ") {
    await saveStudentMark(session.institutionId, row.test.id, session.userId, mcqScore, Number(row.test.maxMarks));
  }

  revalidatePath("/student/tests");
  revalidatePath("/student/marks");
  revalidatePath("/staff/tests");
}

export async function failOnlineTestForViolation(onlineTestId: number, reason: OnlineViolationReason) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) throw new Error("Unauthorized");

  const row = await getStudentOnlineTest(session.userId, session.institutionId, onlineTestId);
  const [existing] = await db.select().from(onlineTestSubmissions).where(and(
    eq(onlineTestSubmissions.institutionId, session.institutionId),
    eq(onlineTestSubmissions.onlineTestId, onlineTestId),
    eq(onlineTestSubmissions.studentId, session.userId)
  )).limit(1);
  if (existing && existing.status !== "IN_PROGRESS") return;

  await markOnlineTestFailed(row, session.userId, reason, existing?.id);
  revalidatePath("/student/tests");
  revalidatePath("/student/marks");
  revalidatePath("/staff/tests");
}

export async function gradeMixedTestAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) throw new Error("Unauthorized");

  const submissionId = asInteger(formData.get("submissionId"), "Submission");
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
  if (!row || row.test.staffId !== session.userId) throw new Error("Submission not found");

  const questions = await db.select().from(onlineTestQuestions).where(eq(onlineTestQuestions.onlineTestId, row.onlineTest.id));
  let shortScore = 0;
  for (const question of questions.filter((question) => question.questionType === "SHORT")) {
    const score = Number(formData.get(`score-${question.id}`));
    if (!Number.isFinite(score) || score < 0 || score > Number(question.marks)) throw new Error("Invalid short-question score");
    shortScore += score;
  }

  const totalScore = Number(row.submission.mcqScore) + shortScore;
  await db.update(onlineTestSubmissions)
    .set({ status: "GRADED", shortScore, totalScore, gradedAt: new Date(), gradedBy: session.userId })
    .where(eq(onlineTestSubmissions.id, submissionId));
  await saveStudentMark(session.institutionId, row.test.id, row.submission.studentId, totalScore, Number(row.test.maxMarks));

  revalidatePath("/staff/tests");
  revalidatePath("/student/marks");
}
