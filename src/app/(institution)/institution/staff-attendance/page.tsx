import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { staff, staffAttendances, leaveRequests } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { StaffAttendanceClient } from "./StaffAttendanceClient";

export default async function InstitutionStaffAttendancePage() {
  const session = await getSession();
  if (!session || !['INSTITUTION', 'INSTITUTION_ADMIN'].includes(session.role) || !session.institutionId) {
    redirect('/login');
  }

  // Get all staff
  const staffMembers = await db.select({
    id: staff.id,
    name: staff.name,
  })
    .from(staff)
    .where(eq(staff.institutionId, session.institutionId))
    .orderBy(staff.name);

  // Default to today's date
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
	        <h1 className="text-3xl font-display font-bold text-brand-950">Teacher&apos;s Attendance</h1>
        <p className="text-stone-500 mt-1">Monitor and manage daily attendance for your teachers.</p>
      </div>

      <StaffAttendanceClient staffMembers={staffMembers} />
    </div>
  );
}
