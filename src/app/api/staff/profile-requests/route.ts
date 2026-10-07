import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campuses, staff, staffProfileChangeRequests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { staffProfileChangeRequestSchema } from "@/lib/validators/staff";
import { and, eq } from "drizzle-orm";

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = staffProfileChangeRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const [staffRow] = await db.select({
    id: staff.id,
    institutionId: staff.institutionId,
  }).from(staff)
    .where(and(eq(staff.id, session.userId), eq(staff.institutionId, session.institutionId)))
    .limit(1);
  if (!staffRow) return NextResponse.json({ error: "Staff not found" }, { status: 404 });

  const requestedFields: Record<string, string | number> = {};
  if (parsed.data.firstName) requestedFields.firstName = parsed.data.firstName;
  if (parsed.data.lastName) requestedFields.lastName = parsed.data.lastName;
  if (parsed.data.email) requestedFields.email = parsed.data.email;
  if (parsed.data.phone) requestedFields.phone = parsed.data.phone;
  if (parsed.data.campusId) requestedFields.campusId = parsed.data.campusId;

  if (parsed.data.campusId) {
    const [campus] = await db.select({ id: campuses.id }).from(campuses)
      .where(and(eq(campuses.id, parsed.data.campusId), eq(campuses.institutionId, staffRow.institutionId)))
      .limit(1);
    if (!campus) return NextResponse.json({ error: "Campus not found" }, { status: 400 });
  }

  await db.insert(staffProfileChangeRequests).values({
    institutionId: staffRow.institutionId,
    staffId: staffRow.id,
    requestedFields,
    reason: parsed.data.reason,
  });

  return NextResponse.json({ message: "Profile change request sent to admin" }, { status: 201 });
});
