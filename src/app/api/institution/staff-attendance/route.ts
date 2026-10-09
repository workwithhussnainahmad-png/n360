import { inputErrorResponse } from '@/lib/input-error-response';
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { db } from "@/db";
import { staff, staffAttendances } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { staffAttendanceSchema } from '@/lib/validators/attendance';
import { validationError } from '@/lib/validation-errors';

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
    const publicInputError = inputErrorResponse(err);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    console.error("Error fetching staff attendance:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});

export const POST = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  try {
    const institutionId = session.institutionId!;
    const body = await req.json();
    const parsed = staffAttendanceSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 });
    const { date, records } = parsed.data;
    const saved = await db.transaction(async tx => {
      const owned = await tx.select({ id: staff.id }).from(staff).where(and(
        eq(staff.institutionId, institutionId), inArray(staff.id, records.map(record => record.staffId)),
      ));
      if (owned.length !== records.length) return false;
      await tx.delete(staffAttendances).where(and(eq(staffAttendances.institutionId, institutionId), eq(staffAttendances.date, date)));
      await tx.insert(staffAttendances).values(records.map(record => ({ institutionId, staffId: record.staffId, date, status: record.status })));
      return true;
    });
    if (!saved) return NextResponse.json({ error: 'Staff selection: one or more staff members are no longer available in this institution. Refresh and select them again.', fieldErrors: { records: ['Select staff members belonging to this institution.'] } }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    const publicInputError = inputErrorResponse(err);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    console.error("Error saving staff attendance:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
