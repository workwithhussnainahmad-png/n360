import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { leaveRequests, students, sections, classes } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { LeavesClient } from "./LeavesClient";

export default async function StaffLeavesPage() {
  const session = await getSession();
  if (!session || session.role !== 'STAFF' || !session.institutionId) {
    redirect('/login');
  }

  // Get leave requests from students where this staff is the class teacher
  const requests = await db.select({
    id: leaveRequests.id,
    studentName: students.name,
    className: classes.name,
    sectionName: sections.name,
    reason: leaveRequests.reason,
    startDate: leaveRequests.startDate,
    endDate: leaveRequests.endDate,
    parentPhone: leaveRequests.parentPhone,
    status: leaveRequests.status,
    createdAt: leaveRequests.createdAt,
  })
    .from(leaveRequests)
    .innerJoin(students, eq(leaveRequests.userId, students.id))
    .innerJoin(sections, eq(students.sectionId, sections.id))
    .innerJoin(classes, eq(students.classId, classes.id))
    .where(and(
      eq(leaveRequests.institutionId, session.institutionId),
      eq(leaveRequests.userRole, "STUDENT"),
      eq(sections.classTeacherId, session.userId),
      eq(leaveRequests.status, "PENDING")
    ))
    .orderBy(desc(leaveRequests.createdAt));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-brand-950">Student Leave Requests</h1>
        <p className="mt-1 text-stone-500">
          Manage leave applications from students in your class.
        </p>
      </div>

      <LeavesClient initialRequests={requests} />
    </div>
  );
}
