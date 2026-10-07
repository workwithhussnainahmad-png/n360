import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { diaries, subjects, staff } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole, getTenantContext } from "@/lib/rbac";

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  try {
    const institutionId = getTenantContext(session);
    const { searchParams } = new URL(req.url);
    const classIdStr = searchParams.get("classId");
    const dateStr = searchParams.get("date");

    if (!classIdStr || !dateStr) {
      return NextResponse.json({ error: "classId and date are required" }, { status: 400 });
    }

    const classId = parseInt(classIdStr);

    const entries = await db
      .select({
        id: diaries.id,
        content: diaries.content,
        date: diaries.date,
        subjectName: subjects.name,
        staffName: staff.name,
      })
      .from(diaries)
      .leftJoin(subjects, eq(diaries.subjectId, subjects.id))
      .leftJoin(staff, eq(diaries.staffId, staff.id))
      .where(
        and(
          eq(diaries.institutionId, institutionId),
          eq(diaries.classId, classId),
          eq(diaries.date, dateStr)
        )
      );

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Error fetching institution diaries:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
