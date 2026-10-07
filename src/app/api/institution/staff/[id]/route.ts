import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staff, institutionCustomRoles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole, getTenantContext } from "@/lib/rbac";
import { invalidateUserValidity } from "@/lib/user";

import { invalidateStaffReadCaches } from "@/lib/redis";

export const DELETE = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { params, session }) => {
  const { id } = await params;
  const tenantId = getTenantContext(session);
  const staffId = parseInt(id);

  if (isNaN(staffId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const [deleted] = await db.delete(staff)
      .where(and(eq(staff.id, staffId), eq(staff.institutionId, tenantId)))
      .returning({ id: staff.id });

    if (!deleted) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    await invalidateUserValidity("STAFF", deleted.id);
    await invalidateStaffReadCaches(tenantId);

    return NextResponse.json({ message: "Staff deleted successfully" });
  } catch (error) {
    console.error("Error deleting staff:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});

export const PATCH = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { params, session }) => {
  const { id } = await params;
  const staffId = Number(id);
  const { customRoleId } = await req.json();
  const tenantId = getTenantContext(session);
  if (!Number.isInteger(staffId) || (customRoleId !== null && !Number.isInteger(Number(customRoleId)))) {
    return NextResponse.json({ error: "Invalid staff or role ID" }, { status: 400 });
  }
  if (customRoleId !== null) {
    const [role] = await db.select({ id: institutionCustomRoles.id }).from(institutionCustomRoles)
      .where(and(eq(institutionCustomRoles.id, Number(customRoleId)), eq(institutionCustomRoles.institutionId, tenantId))).limit(1);
    if (!role) return NextResponse.json({ error: "Custom role not found" }, { status: 400 });
  }
  const [updated] = await db.update(staff).set({ customRoleId: customRoleId === null ? null : Number(customRoleId) })
    .where(and(eq(staff.id, staffId), eq(staff.institutionId, tenantId))).returning({ id: staff.id, customRoleId: staff.customRoleId });
  if (updated) await invalidateStaffReadCaches(tenantId);
  return updated ? NextResponse.json({ staff: updated }) : NextResponse.json({ error: "Staff not found" }, { status: 404 });
});
