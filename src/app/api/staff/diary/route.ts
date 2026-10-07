import { NextResponse } from "next/server";
import { db } from "@/db";
import { classes, diaries, subjects } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { createDiaryNotifications } from "@/lib/notifications";

const diarySchema = z.object({
  classId: z.number().int().positive(),
  subjectId: z.number().int().positive().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.string().min(1),
});

function isDateString(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type HistoryCursor = { date: string; id: number };

function parseHistoryCursor(value: string | null): HistoryCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { date?: unknown; id?: unknown };
    const date = typeof parsed.date === "string" ? parsed.date : null;
    const id = Number(parsed.id);
    if (!isDateString(date) || !Number.isInteger(id) || id <= 0) return null;
    return { date, id };
  } catch {
    return null;
  }
}

function encodeHistoryCursor({ date, id }: HistoryCursor) {
  return Buffer.from(JSON.stringify({ date, id })).toString("base64url");
}

export async function GET(req: Request) {
  try {
    const session = await getSession();
    // Only STAFF can access this endpoint
    if (!session || session.role !== "STAFF") {
      return NextResponse.json({ error: "Forbidden: Only staff can view or edit diaries" }, { status: 403 });
    }

    if (!session.institutionId) {
      return NextResponse.json({ error: "No institution associated with staff" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") ?? "entry";

    if (view === "history") {
      const limitParam = Number(searchParams.get("limit"));
      const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 20;
      const cursorParam = searchParams.get("cursor");
      const cursor = parseHistoryCursor(cursorParam);
      if (cursorParam && !cursor) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

      const conditions = [
        eq(diaries.institutionId, session.institutionId),
        eq(diaries.staffId, session.userId),
      ];
      if (cursor) {
        const cursorCondition = or(
          lt(diaries.date, cursor.date),
          and(eq(diaries.date, cursor.date), lt(diaries.id, cursor.id))
        );
        if (cursorCondition) conditions.push(cursorCondition);
      }

      const page = await db.select({
        id: diaries.id,
        classId: diaries.classId,
        subjectId: diaries.subjectId,
        date: diaries.date,
        preview: sql<string>`left(${diaries.content}, 300)`,
      })
        .from(diaries)
        .where(and(...conditions))
        .orderBy(desc(diaries.date), desc(diaries.id))
        .limit(limit + 1);

      const hasNextPage = page.length > limit;
      const entries = hasNextPage ? page.slice(0, limit) : page;
      const lastEntry = entries.at(-1);
      return NextResponse.json({
        entries,
        nextCursor: hasNextPage && lastEntry
          ? encodeHistoryCursor({ date: lastEntry.date, id: lastEntry.id })
          : null,
      });
    }

    if (view !== "entry") return NextResponse.json({ error: "Invalid view" }, { status: 400 });
    const classId = Number(searchParams.get("classId"));
    const subjectIdParam = searchParams.get("subjectId");
    const date = searchParams.get("date");
    const subjectId = subjectIdParam === null ? null : Number(subjectIdParam);

    if (!Number.isInteger(classId) || classId <= 0 || !isDateString(date) || (subjectId !== null && (!Number.isInteger(subjectId) || subjectId <= 0))) {
      return NextResponse.json({ error: "classId, optional subjectId, and date are required" }, { status: 400 });
    }

    const [diary] = await db.select()
      .from(diaries)
      .where(and(
        eq(diaries.institutionId, session.institutionId),
        eq(diaries.staffId, session.userId),
        eq(diaries.classId, classId),
        eq(diaries.date, date),
        subjectId === null ? isNull(diaries.subjectId) : eq(diaries.subjectId, subjectId)
      ))
      .orderBy(sql`${diaries.createdAt} desc`)
      .limit(1);

    return NextResponse.json({ diary: diary ?? null });
  } catch (error) {
    console.error("Error fetching diaries:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "STAFF") {
      return NextResponse.json({ error: "Forbidden: Only staff can create diaries" }, { status: 403 });
    }

    const body = await req.json();
    const result = diarySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: "Invalid data", details: result.error.issues }, { status: 400 });
    }

    if (!session.institutionId) {
      return NextResponse.json({ error: "No institution associated with staff" }, { status: 400 });
    }

    const [[classRow], subjectRows] = await Promise.all([
      db.select({ id: classes.id, name: classes.name })
        .from(classes)
        .where(and(
          eq(classes.id, result.data.classId),
          eq(classes.institutionId, session.institutionId)
        ))
        .limit(1),
      result.data.subjectId
        ? db.select({ id: subjects.id, name: subjects.name })
          .from(subjects)
          .where(and(
            eq(subjects.id, result.data.subjectId),
            eq(subjects.institutionId, session.institutionId)
          ))
          .limit(1)
        : Promise.resolve([]),
    ]);

    if (!classRow || (result.data.subjectId && !subjectRows[0])) {
      return NextResponse.json({ error: "Class or subject not found" }, { status: 400 });
    }

    const values = {
      institutionId: session.institutionId,
      staffId: session.userId,
      classId: result.data.classId,
      subjectId: result.data.subjectId ?? null,
      date: result.data.date,
      content: result.data.content,
    };

    let newDiary;

    // General class diary entries have no subject and always create a new row.
    if (values.subjectId === null) {
      [newDiary] = await db.insert(diaries).values(values).returning();
    } else {
      // Subject-specific entries update the existing entry for the same class and date.
      [newDiary] = await db.insert(diaries).values(values).onConflictDoUpdate({
        target: [diaries.classId, diaries.subjectId, diaries.date],
        targetWhere: sql`${diaries.subjectId} is not null`,
        set: { content: result.data.content },
      }).returning();
    }

    if (newDiary) {
      createDiaryNotifications({
        institutionId: session.institutionId,
        classId: result.data.classId,
        className: classRow.name,
        subjectName: subjectRows[0]?.name,
        date: result.data.date,
      }).catch(err => console.error("Error creating diary notification:", err));
    }

    return NextResponse.json(newDiary);
  } catch (error) {
    console.error("Error creating diary:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
