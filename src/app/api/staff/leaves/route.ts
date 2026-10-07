import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { db } from "@/db";
import { leaveRequests, staff, students, sections, notifications } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  try {
    const staffId = session.userId;
    const institutionId = session.institutionId!;
    
    const body = await req.json();
    const { reason, startDate, endDate } = body;

    if (!reason || !startDate || !endDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return NextResponse.json({ error: "Start date must be before or equal to end date" }, { status: 400 });
    }

    const [currentStaff] = await db.select({ name: staff.name }).from(staff).where(and(eq(staff.id, staffId), eq(staff.institutionId, institutionId)));
    if (!currentStaff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // Insert leave request
    const [leaveReq] = await db.insert(leaveRequests).values({
      institutionId,
      userRole: "STAFF",
      userId: staffId,
      reason,
      startDate: new Date(startDate).toISOString().split('T')[0],
      endDate: new Date(endDate).toISOString().split('T')[0],
      status: "PENDING",
    }).returning();

    // Send notification to institution admin
    await db.insert(notifications).values({
      institutionId,
      userRole: "INSTITUTION",
      userId: institutionId,
      type: "LEAVE_REQUEST",
      title: "New Staff Leave Request",
      message: `${currentStaff.name} requested leave from ${startDate} to ${endDate}.`,
      referenceId: leaveReq.id,
    });

    return NextResponse.json({ success: true, id: leaveReq.id });
  } catch (err) {
    console.error("Error creating staff leave request:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});

export const GET = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  try {
    const requests = await db.select({
      id: leaveRequests.id,
      studentName: students.name,
      sectionName: sections.name,
      reason: leaveRequests.reason,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      parentPhone: leaveRequests.parentPhone,
      status: leaveRequests.status,
      createdAt: leaveRequests.createdAt,
    }).from(leaveRequests)
      .innerJoin(students, eq(leaveRequests.userId, students.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .where(and(
      eq(leaveRequests.institutionId, session.institutionId!),
      eq(leaveRequests.userRole, "STUDENT"),
      eq(sections.classTeacherId, session.userId),
      eq(leaveRequests.status, "PENDING")
    )).orderBy(desc(leaveRequests.createdAt));
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Error fetching staff leave requests:", error);
    return NextResponse.json({ error: "Failed to fetch leave requests" }, { status: 500 });
  }
});
