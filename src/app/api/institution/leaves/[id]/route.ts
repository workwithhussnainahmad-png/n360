import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { db } from "@/db";
import { leaveRequests, staffAttendances } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";

export const PATCH = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { params, session }) => {
  try {
    const { id } = await params;
    const leaveId = parseInt(id, 10);
    const institutionId = session.institutionId!;
    const body = await req.json();
    const { status } = body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Verify leave exists and belongs to this institution
    const [leave] = await db.select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, leaveId), eq(leaveRequests.institutionId, institutionId)));

    if (!leave) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    // Update status
    await db.update(leaveRequests)
      .set({ status })
      .where(eq(leaveRequests.id, leaveId));

    // Handle notification and attendance for staff
    if (leave.userRole === "STAFF") {
      if (status === "APPROVED") {
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const dates: string[] = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().split('T')[0]);
        }

        await db.insert(staffAttendances).values(
          dates.map((date) => ({
            institutionId,
            staffId: leave.userId,
            date,
            status: "LEAVE" as const,
          }))
        ).onConflictDoUpdate({
          target: [staffAttendances.staffId, staffAttendances.date],
          set: { status: "LEAVE" },
        });
      }

      await createNotification({
        institutionId,
        userRole: "STAFF",
        userId: leave.userId,
        type: "LEAVE_REQUEST",
        title: status === "APPROVED" ? "Leave Approved" : "Leave Rejected",
        message: status === "APPROVED" ? "Your leave request was accepted." : "Your leave request was rejected.",
        referenceId: leave.id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error updating leave request:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
