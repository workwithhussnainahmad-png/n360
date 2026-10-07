import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { db } from "@/db";
import { leaveRequests, students, sections, attendances } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";

export const PATCH = requireRole(["STAFF"], async (req: NextRequest, { params, session }) => {
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

    if (leave.userRole === "STUDENT") {
      const [studentSection] = await db.select({ classTeacherId: sections.classTeacherId })
        .from(students)
        .innerJoin(sections, eq(students.sectionId, sections.id))
        .where(and(eq(students.id, leave.userId), eq(sections.institutionId, institutionId)));
      if (studentSection?.classTeacherId !== session.userId) {
        return NextResponse.json({ error: "You can only manage leave requests from your classes" }, { status: 403 });
      }
    }

    // Update status
    await db.update(leaveRequests)
      .set({ status })
      .where(eq(leaveRequests.id, leaveId));

    // Send notification to student and mark attendance
    if (leave.userRole === "STUDENT") {
      // Find student's sectionId
      const [student] = await db.select({ sectionId: students.sectionId })
        .from(students)
        .where(eq(students.id, leave.userId));

      if (student && status === "APPROVED") {
        // Mark attendance for each date in range
        const start = new Date(leave.startDate);
        const end = new Date(leave.endDate);
        const dates: string[] = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().split('T')[0]);
        }

        await db.insert(attendances).values(
          dates.map((date) => ({
            institutionId,
            sectionId: student.sectionId,
            studentId: leave.userId,
            date,
            status: "LEAVE" as const,
          }))
        ).onConflictDoUpdate({
          target: [attendances.studentId, attendances.date],
          set: { status: "LEAVE" },
        });
      }

      await createNotification({
        institutionId,
        userRole: "STUDENT",
        userId: leave.userId,
        type: "LEAVE_REQUEST",
        title: status === "APPROVED" ? "Hey, its Good news!" : "Sorry, its bad news",
        message: status === "APPROVED" ? "Your leave was accepted, happy leave day." : "Your leave was rejected, best of luck for next time.",
        referenceId: leave.id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error updating leave request:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
