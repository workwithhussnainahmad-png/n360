import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { 
  tests, classes, sections, subjects, onlineTests, staffAssignments, 
  onlineTestSubmissions, onlineTestQuestions, students
} from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { eq, and, desc, inArray, lt, or, sql } from "drizzle-orm";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

type HostedTestsCursor = { createdAt: Date; id: number };

function parseHostedTestsCursor(value: string | null): HostedTestsCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    const createdAt = new Date(typeof parsed.createdAt === "string" ? parsed.createdAt : "");
    const id = Number(parsed.id);
    if (Number.isNaN(createdAt.getTime()) || !Number.isInteger(id) || id <= 0) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeHostedTestsCursor({ createdAt, id }: HostedTestsCursor) {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64url");
}

export const GET = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const assignedSlotsRaw = await db.select({
      sectionId: sections.id,
      sectionName: sections.name,
      className: classes.name,
      subjectId: subjects.id,
      subjectName: subjects.name,
    })
      .from(staffAssignments)
      .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
      .innerJoin(classes, eq(sections.classId, classes.id))
      .innerJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .where(and(eq(staffAssignments.staffId, session.userId), eq(staffAssignments.institutionId, session.institutionId)));

    const sectionOptionsMap = new Map();
    assignedSlotsRaw.forEach(slot => {
      if (!sectionOptionsMap.has(slot.sectionId)) {
        sectionOptionsMap.set(slot.sectionId, {
          id: slot.sectionId,
          className: slot.className,
          name: slot.sectionName,
        });
      }
    });

    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
    const cursorParam = req.nextUrl.searchParams.get("cursor");
    const cursor = parseHostedTestsCursor(cursorParam);
    if (cursorParam && !cursor) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

    const hostedTestConditions = [
      eq(tests.staffId, session.userId),
      eq(tests.institutionId, session.institutionId),
    ];
    if (cursor) {
      const cursorCondition = or(
        lt(onlineTests.createdAt, cursor.createdAt),
        and(eq(onlineTests.createdAt, cursor.createdAt), lt(onlineTests.id, cursor.id))
      );
      if (cursorCondition) hostedTestConditions.push(cursorCondition);
    }

    const hostedTestPage = await db.select({
      testId: tests.id,
      title: tests.title,
      type: tests.type,
      maxMarks: tests.maxMarks,
      date: tests.date,
      className: classes.name,
      sectionName: sections.name,
      subjectName: subjects.name,
      onlineTestId: onlineTests.id,
      durationMinutes: onlineTests.durationMinutes,
      mode: onlineTests.mode,
      createdAt: onlineTests.createdAt,
      submissionCount: sql<number>`count(${onlineTestSubmissions.id})::int`,
      pendingReviewCount: sql<number>`count(*) filter (where ${onlineTestSubmissions.status} = 'PENDING_REVIEW')::int`,
    })
      .from(onlineTests)
      .innerJoin(tests, eq(onlineTests.testId, tests.id))
      .innerJoin(classes, eq(tests.classId, classes.id))
      .leftJoin(sections, eq(tests.sectionId, sections.id))
      .leftJoin(subjects, eq(tests.subjectId, subjects.id))
      .leftJoin(onlineTestSubmissions, and(
        eq(onlineTestSubmissions.onlineTestId, onlineTests.id),
        eq(onlineTestSubmissions.institutionId, session.institutionId)
      ))
      .where(and(...hostedTestConditions))
      .groupBy(
        tests.id, tests.title, tests.type, tests.maxMarks, tests.date,
        classes.name, sections.name, subjects.name,
        onlineTests.id, onlineTests.durationMinutes, onlineTests.mode, onlineTests.createdAt
      )
      .orderBy(desc(onlineTests.createdAt), desc(onlineTests.id))
      .limit(limit + 1);

    const hasNextPage = hostedTestPage.length > limit;
    const hostedTests = hasNextPage ? hostedTestPage.slice(0, limit) : hostedTestPage;
    const lastTest = hostedTests.at(-1);

    return NextResponse.json({ 
      tests: hostedTests.map((test) => ({ ...test, id: test.testId })),
      nextCursor: hasNextPage && lastTest
        ? encodeHostedTestsCursor({ createdAt: lastTest.createdAt, id: lastTest.onlineTestId })
        : null,
      assignedSlots: Array.from(sectionOptionsMap.values()),
      subjectOptions: assignedSlotsRaw.map(slot => ({
        id: slot.subjectId, name: slot.subjectName, sectionId: slot.sectionId
      }))
    });
  } catch (error) {
    console.error("Error fetching hosted tests:", error);
    return NextResponse.json({ error: "Failed to fetch tests" }, { status: 500 });
  }
});

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { sectionId, subjectId, title, mode, durationMinutes, mcqs, shortQuestions } = body;

    if (!title) return NextResponse.json({ error: "Test title is required" }, { status: 400 });
    if (mode !== "MCQ" && mode !== "MIX") return NextResponse.json({ error: "Invalid test mode" }, { status: 400 });
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return NextResponse.json({ error: "Duration is required" }, { status: 400 });

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
        eq(staffAssignments.staffId, session.userId),
        eq(staffAssignments.institutionId, session.institutionId),
        eq(staffAssignments.sectionId, sectionId),
        eq(staffAssignments.subjectId, subjectId)
      ))
      .limit(1);

    if (!assignment) return NextResponse.json({ error: "This class section and subject are not assigned to you" }, { status: 403 });

    if (!mcqs || mcqs.length === 0) return NextResponse.json({ error: "Add at least one MCQ" }, { status: 400 });
    if (mode === "MIX" && (!shortQuestions || shortQuestions.length === 0)) return NextResponse.json({ error: "Mix tests need at least one short question" }, { status: 400 });

    const totalMarks = (mcqs || []).reduce((sum: number, q: any) => sum + Number(q.marks), 0) + 
                       (shortQuestions || []).reduce((sum: number, q: any) => sum + Number(q.marks), 0);
                       
    const today = new Date().toISOString().slice(0, 10);
    
    const [test] = await db.insert(tests).values({
      institutionId: session.institutionId,
      classId: assignment.classId,
      sectionId,
      subjectId,
      staffId: session.userId,
      createdByRole: "STAFF",
      type: "QUIZ",
      title: title.trim(),
      maxMarks: totalMarks,
      date: today,
      resultsPublishedAt: new Date(),
    }).returning();

    const [onlineTest] = await db.insert(onlineTests).values({
      institutionId: session.institutionId,
      testId: test.id,
      mode: mode as "MCQ" | "MIX",
      durationMinutes: Number(durationMinutes),
    }).returning();

    let orderIndex = 0;
    const allQuestions = [
      ...mcqs.map((q: any) => ({
        onlineTestId: onlineTest.id,
        questionType: 'MCQ' as const,
        prompt: q.prompt,
        options: q.options,
        correctOptionIndex: Number(q.correctOptionIndex),
        marks: Number(q.marks),
        orderIndex: orderIndex++,
      })),
      ...(mode === "MIX" ? (shortQuestions || []).map((q: any) => ({
        onlineTestId: onlineTest.id,
        questionType: 'SHORT' as const,
        prompt: q.prompt,
        marks: Number(q.marks),
        orderIndex: orderIndex++,
      })) : []),
    ];
    if (allQuestions.length > 0) {
      await db.insert(onlineTestQuestions).values(allQuestions);
    }

    const { createOnlineTestNotifications } = await import("@/lib/notifications");
    await createOnlineTestNotifications({
      institutionId: session.institutionId,
      sectionId,
      onlineTestId: onlineTest.id,
      title: title.trim(),
      className: assignment.className,
      sectionName: assignment.sectionName,
      subjectName: assignment.subjectName,
      durationMinutes: Number(durationMinutes),
    });

    return NextResponse.json({ success: true, testId: test.id });
  } catch (error) {
    console.error("Error creating online test:", error);
    return NextResponse.json({ error: "Failed to create online test" }, { status: 500 });
  }
});
