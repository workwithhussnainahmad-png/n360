import { positiveInteger } from "@/lib/pagination";
import { ServerPagination } from "@/components/ui/server-pagination";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { leaveRequests, staff } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { StaffLeavesClient } from "./StaffLeavesClient";

export default async function InstitutionStaffLeavesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = positiveInteger((await searchParams).page);
  const session = await getSession();
  if (!session || !['INSTITUTION', 'INSTITUTION_ADMIN'].includes(session.role) || !session.institutionId) {
    redirect('/login');
  }

  // Get leave requests from staff
  const requestRows = await db.select({
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
    .orderBy(desc(leaveRequests.createdAt), desc(leaveRequests.id)).limit(51).offset((page - 1) * 50);
  const requests = requestRows.slice(0, 50);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      <StaffLeavesClient key={page} initialRequests={requests} />
      <ServerPagination page={page} hasMore={requestRows.length > 50} />
    </div>
  );
}
