import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { marks, tests, subjects, onlineTests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { windowRange } from "@/lib/month-window";
import { eq, and, desc, gte, isNotNull, lte, lt, or } from "drizzle-orm";
import { getCachedOrFetch, redis } from "@/lib/redis";

const DEFAULT_WINDOW_MONTHS_BACK = 1; // current month + 1 prior = 2 months total
const DEFAULT_LIMIT = 50;

export const GET = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const searchParams = req.nextUrl.searchParams;
    const paginated = ["limit", "cursor", "from", "to"].some((key) => searchParams.has(key));

    // Unpaginated callers get a bounded default window instead of an unlimited
    // full-history scan, to keep old callers from full-scanning the table.
    if (!paginated) {
      const { from, to } = windowRange(new Date(), DEFAULT_WINDOW_MONTHS_BACK);
      const formattedMarks = await getCachedOrFetch(`cache:student:marks:${session.userId}:default`, 60, async () => {
        const studentMarks = await db
          .select({
            id: marks.id,
            testId: marks.testId,
            marksObtained: marks.marksObtained,
            totalMarks: marks.totalMarks,
            testTitle: tests.title,
            testDate: tests.date,
            testType: tests.type,
            subjectName: subjects.name,
            isOnline: onlineTests.id, // Will be non-null if online
            onlineTestId: onlineTests.id,
          })
          .from(marks)
          .innerJoin(tests, eq(marks.testId, tests.id))
          .innerJoin(subjects, eq(tests.subjectId, subjects.id))
          .leftJoin(onlineTests, eq(tests.id, onlineTests.testId))
          .where(
            and(
              eq(marks.studentId, session.userId),
              eq(marks.institutionId, session.institutionId!),
              isNotNull(tests.resultsPublishedAt),
              gte(tests.date, from),
              lte(tests.date, to),
            )
          )
          .orderBy(desc(tests.date), desc(marks.id))
          .limit(DEFAULT_LIMIT);

        // Normalize the boolean
        return studentMarks.map((m) => ({
          ...m,
          isOnline: !!m.isOnline,
        }));
      });

      return NextResponse.json({ marks: formattedMarks });
    }

    const limitValue = Number(searchParams.get("limit") ?? 50);
    if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) {
      return NextResponse.json({ error: "limit must be an integer from 1 to 100" }, { status: 400 });
    }
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
      return NextResponse.json({ error: "from and to must use YYYY-MM-DD" }, { status: 400 });
    }

    let cursorValue: { date: string; id: number } | null = null;
    const cursor = searchParams.get("cursor");
    if (cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (typeof parsed.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date) || !Number.isInteger(parsed.id)) throw new Error("invalid cursor");
        cursorValue = parsed;
      } catch {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
    }

    const canonicalQuery = `limit=${limitValue}&cursor=${cursor ?? ""}&from=${from ?? ""}&to=${to ?? ""}`;
    const version = await redis.get(`cache:student:marks:version:${session.userId}`).catch(() => null) ?? "0";
    const cacheKey = `cache:student:marks:${session.userId}:v${version}:${canonicalQuery}`;
    const rows = await getCachedOrFetch(cacheKey, 60, () => db.select({
      id: marks.id, testId: marks.testId, marksObtained: marks.marksObtained, totalMarks: marks.totalMarks,
      testTitle: tests.title, testDate: tests.date, testType: tests.type, subjectName: subjects.name,
      isOnline: onlineTests.id, onlineTestId: onlineTests.id,
    })
      .from(marks)
      .innerJoin(tests, eq(marks.testId, tests.id))
      .innerJoin(subjects, eq(tests.subjectId, subjects.id))
      .leftJoin(onlineTests, eq(tests.id, onlineTests.testId))
      .where(and(
        eq(marks.studentId, session.userId), eq(marks.institutionId, session.institutionId!),
        isNotNull(tests.resultsPublishedAt),
        ...(from ? [gte(tests.date, from)] : []), ...(to ? [lte(tests.date, to)] : []),
        ...(cursorValue ? [or(lt(tests.date, cursorValue.date), and(eq(tests.date, cursorValue.date), lt(marks.id, cursorValue.id)))] : []),
      ))
      .orderBy(desc(tests.date), desc(marks.id))
      .limit(limitValue + 1));
    const hasMore = rows.length > limitValue;
    const pageRows = hasMore ? rows.slice(0, limitValue) : rows;
    const last = pageRows.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ date: last.testDate, id: last.id })).toString("base64url")
      : null;
    return NextResponse.json({ marks: pageRows.map((mark) => ({ ...mark, isOnline: !!mark.isOnline })), page: { limit: limitValue, nextCursor } });
  } catch (error) {
    console.error("Error fetching marks:", error);
    return NextResponse.json({ error: "Failed to fetch marks" }, { status: 500 });
  }
});
