import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { leaveRequests, staff } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { StaffLeavesClient } from "./StaffLeavesClient";

export default async function InstitutionStaffLeavesPage() {
  const session = await getSession();
  if (!session || !['INSTITUTION', 'INSTITUTION_ADMIN'].includes(session.role) || !session.institutionId) {
    redirect('/login');
  }

  // Get leave requests from staff
  const requests = await db.select({
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
    .where(and(
      eq(leaveRequests.institutionId, session.institutionId),
      eq(leaveRequests.userRole, "STAFF"),
      eq(leaveRequests.status, "PENDING")
    ))
    .orderBy(desc(leaveRequests.createdAt));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Staff Leave Requests</h1>
        <p className="text-muted-foreground mt-2">
          Manage leave applications from teaching and non-teaching staff.
        </p>
      </div>

      <StaffLeavesClient initialRequests={requests} />
    </div>
  );
}
