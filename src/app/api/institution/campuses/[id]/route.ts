import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campuses } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireRole, getTenantContext } from "@/lib/rbac";
import { canManageCampuses } from "@/lib/campus-workspaces";

export const DELETE = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { params, session }) => {
  const { id } = await params;
  const tenantId = getTenantContext(session);
  const campusId = parseInt(id);

  if (isNaN(campusId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    if (!canManageCampuses(session)) return NextResponse.json({ error: 'Only the main campus can manage the campus list.' }, { status: 403 });
    const [campus] = await db.select({ name: campuses.name }).from(campuses).where(and(eq(campuses.id, campusId), eq(campuses.institutionId, tenantId))).limit(1);
    if (!campus) return NextResponse.json({ error: 'Campus not found' }, { status: 404 });
    if (campus.name === session.homeCampusName) return NextResponse.json({ error: 'The main campus cannot be deleted.' }, { status: 409 });
    const [deleted] = await db.delete(campuses)
      .where(and(eq(campuses.id, campusId), eq(campuses.institutionId, tenantId)))
      .returning({ id: campuses.id });

    if (!deleted) {
      return NextResponse.json({ error: "Campus not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Campus deleted successfully" });
  } catch (error) {
    console.error("Error deleting campus:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
