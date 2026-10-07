import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { attendances, sections } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { windowRange } from "@/lib/month-window";
import { eq, and, desc, gte, lte, lt } from "drizzle-orm";
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
      const studentAttendance = await getCachedOrFetch(`cache:student:attendance:${session.userId}:default`, 120, async () => {
        return await db
          .select({
            id: attendances.id,
            date: attendances.date,
            status: attendances.status,
            sectionName: sections.name,
          })
          .from(attendances)
          .innerJoin(sections, eq(attendances.sectionId, sections.id))
          .where(
            and(
              eq(attendances.studentId, session.userId),
              eq(attendances.institutionId, session.institutionId!),
              gte(attendances.date, from),
              lte(attendances.date, to),
            )
          )
          .orderBy(desc(attendances.date))
          .limit(DEFAULT_LIMIT);
      });

      return NextResponse.json({ attendance: studentAttendance });
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

    let cursorDate: string | null = null;
    const cursor = searchParams.get("cursor");
    if (cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (typeof parsed.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) throw new Error("invalid cursor");
        cursorDate = parsed.date;
      } catch {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
    }

    const canonicalQuery = `limit=${limitValue}&cursor=${cursor ?? ""}&from=${from ?? ""}&to=${to ?? ""}`;
    const version = await redis.get(`cache:student:attendance:version:${session.userId}`).catch(() => null) ?? "0";
    const cacheKey = `cache:student:attendance:${session.userId}:v${version}:${canonicalQuery}`;
    const attendance = await getCachedOrFetch(cacheKey, 120, () =>
      db.select({ id: attendances.id, date: attendances.date, status: attendances.status, sectionName: sections.name })
        .from(attendances)
        .innerJoin(sections, eq(attendances.sectionId, sections.id))
        .where(and(
          eq(attendances.studentId, session.userId),
          eq(attendances.institutionId, session.institutionId!),
          ...(from ? [gte(attendances.date, from)] : []),
          ...(to ? [lte(attendances.date, to)] : []),
          ...(cursorDate ? [lt(attendances.date, cursorDate)] : []),
        ))
        .orderBy(desc(attendances.date))
        .limit(limitValue + 1)
    );
    const hasMore = attendance.length > limitValue;
    const page = hasMore ? attendance.slice(0, limitValue) : attendance;
    const last = page.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ date: last.date })).toString("base64url")
      : null;
    return NextResponse.json({ attendance: page, page: { limit: limitValue, nextCursor } });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
});
