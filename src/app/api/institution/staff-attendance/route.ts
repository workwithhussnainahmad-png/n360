import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { db } from "@/db";
import { staffAttendances } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  try {
    const institutionId = session.institutionId!;
    const url = new URL(req.url);
    const date = url.searchParams.get("date");

    if (!date) {
      return NextResponse.json({ error: "Date is required" }, { status: 400 });
    }

    const records = await db.select()
      .from(staffAttendances)
      .where(and(
        eq(staffAttendances.institutionId, institutionId),
        eq(staffAttendances.date, date)
      ));

    return NextResponse.json({ records });
  } catch (err: any) {
    console.error("Error fetching staff attendance:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});

export const POST = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  try {
    const institutionId = session.institutionId!;
    const body = await req.json();
    const { date, records } = body;

    if (!date || !records || !Array.isArray(records)) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    // Delete existing records for the day to replace
    await db.delete(staffAttendances).where(and(
      eq(staffAttendances.institutionId, institutionId),
      eq(staffAttendances.date, date)
    ));

    if (records.length > 0) {
      const inserts = records.map((r: any) => ({
        institutionId,
        staffId: r.staffId,
        date,
        status: r.status,
      }));

      await db.insert(staffAttendances).values(inserts);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error saving staff attendance:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
