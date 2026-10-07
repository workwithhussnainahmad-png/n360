import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campuses, staff, staffProfileChangeRequests } from "@/db/schema";
import { requireRole, getTenantContext } from "@/lib/rbac";
import { desc, eq } from "drizzle-orm";

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);

  const requests = await db.select({
    id: staffProfileChangeRequests.id,
    requestedFields: staffProfileChangeRequests.requestedFields,
    reason: staffProfileChangeRequests.reason,
    status: staffProfileChangeRequests.status,
    adminNote: staffProfileChangeRequests.adminNote,
    createdAt: staffProfileChangeRequests.createdAt,
    staffId: staff.id,
    staffName: staff.name,
    email: staff.email,
    phone: staff.phone,
    campusName: campuses.name,
    isActive: staff.isActive,
  })
    .from(staffProfileChangeRequests)
    .innerJoin(staff, eq(staffProfileChangeRequests.staffId, staff.id))
    .leftJoin(campuses, eq(staff.campusId, campuses.id))
    .where(eq(staffProfileChangeRequests.institutionId, institutionId))
    .orderBy(desc(staffProfileChangeRequests.createdAt));

  return NextResponse.json({
    requests: requests.map((request) => ({
      ...request,
      campusName: request.campusName || "Main",
      createdAt: request.createdAt.toISOString(),
    })),
  });
});
