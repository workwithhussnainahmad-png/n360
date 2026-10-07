import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, onlineTestSubmissions, onlineTests, students, subjects, tests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { and, desc, eq, lt, or } from "drizzle-orm";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type TestsCursor = { createdAt: Date; id: number };

function parseTestsCursor(value: string | null): TestsCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = new Date(typeof parsed.createdAt === "string" ? parsed.createdAt : "");
    const id = Number(parsed.id);
    if (Number.isNaN(createdAt.getTime()) || !Number.isInteger(id) || id <= 0) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeTestsCursor({ createdAt, id }: TestsCursor) {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64url");
}

export const GET = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [student] = await db.select({
    id: students.id,
    classId: students.classId,
    sectionId: students.sectionId,
  }).from(students)
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
    .limit(1);

  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0
    ? Math.min(limitParam, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const cursorParam = req.nextUrl.searchParams.get("cursor");
  const cursor = parseTestsCursor(cursorParam);
  if (cursorParam && !cursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const testConditions = [
    eq(onlineTests.institutionId, session.institutionId),
    eq(tests.classId, student.classId),
    eq(tests.sectionId, student.sectionId),
  ];
  if (cursor) {
    const cursorCondition = or(
      lt(onlineTests.createdAt, cursor.createdAt),
      and(eq(onlineTests.createdAt, cursor.createdAt), lt(onlineTests.id, cursor.id))
    );
    if (cursorCondition) testConditions.push(cursorCondition);
  }

  const testPage = await db.select({
    onlineTest: {
      id: onlineTests.id,
      mode: onlineTests.mode,
      durationMinutes: onlineTests.durationMinutes,
      createdAt: onlineTests.createdAt,
    },
    test: {
      id: tests.id,
      title: tests.title,
      maxMarks: tests.maxMarks,
      date: tests.date,
      endDate: tests.endDate,
    },
    className: classes.name,
    subjectName: subjects.name,
    submission: {
      id: onlineTestSubmissions.id,
      status: onlineTestSubmissions.status,
      totalScore: onlineTestSubmissions.totalScore,
      startedAt: onlineTestSubmissions.startedAt,
      submittedAt: onlineTestSubmissions.submittedAt,
      violationReason: onlineTestSubmissions.violationReason,
    },
  })
    .from(onlineTests)
    .innerJoin(tests, eq(onlineTests.testId, tests.id))
    .innerJoin(classes, eq(tests.classId, classes.id))
    .leftJoin(subjects, eq(tests.subjectId, subjects.id))
    .leftJoin(onlineTestSubmissions, and(
      eq(onlineTestSubmissions.onlineTestId, onlineTests.id),
      eq(onlineTestSubmissions.institutionId, session.institutionId),
      eq(onlineTestSubmissions.studentId, session.userId)
    ))
    .where(and(...testConditions))
    .orderBy(desc(onlineTests.createdAt), desc(onlineTests.id))
    .limit(limit + 1);

  const hasNextPage = testPage.length > limit;
  const rows = hasNextPage ? testPage.slice(0, limit) : testPage;
  const nowMs = new Date().getTime();

  const result = rows.map(({ onlineTest, test, subjectName, className, submission }) => {
    const isActive = onlineTest.createdAt.getTime() + onlineTest.durationMinutes * 60 * 1000 > nowMs;
    return {
      onlineTest,
      test,
      subjectName,
      className,
      submission,
      isActive,
    };
  });

  const lastTest = rows.at(-1);
  return NextResponse.json({
    tests: result,
    nextCursor: hasNextPage && lastTest
      ? encodeTestsCursor({ createdAt: lastTest.onlineTest.createdAt, id: lastTest.onlineTest.id })
      : null,
  });
});
