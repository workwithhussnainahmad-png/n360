import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leaveRequests, staff } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireRole, getTenantContext } from "@/lib/rbac";

type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED";

function parseStatus(value: string | null): LeaveStatus {
  if (value === "APPROVED" || value === "REJECTED" || value === "PENDING") return value;
  return "PENDING";
}

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const url = new URL(req.url);
  const status = parseStatus(url.searchParams.get("status"));

  const rows = await db
    .select({
      id: leaveRequests.id,
      staffName: staff.name,
      reason: leaveRequests.reason,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      status: leaveRequests.status,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(staff, eq(leaveRequests.userId, staff.id))
    .where(
      and(
        eq(leaveRequests.institutionId, institutionId),
        eq(leaveRequests.userRole, "STAFF"),
        eq(leaveRequests.status, status)
      )
    )
    .orderBy(leaveRequests.createdAt);

  return NextResponse.json({ leaves: rows });
});

