import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { db } from "@/db";
import { leaveRequests, students, sections } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";

export const POST = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  try {
    const studentId = session.userId;
    const institutionId = session.institutionId!;
    
    const body = await req.json();
    const { reason, startDate, endDate, parentPhone } = body;

    if (!reason || !startDate || !endDate || !parentPhone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Ensure startDate <= endDate
    if (new Date(startDate) > new Date(endDate)) {
      return NextResponse.json({ error: "Start date must be before or equal to end date" }, { status: 400 });
    }

    // Find student's section to notify the class teacher
    const [student] = await db.select({
      sectionId: students.sectionId,
      name: students.name,
    })
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.institutionId, institutionId)));

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Insert leave request
    const [leaveReq] = await db.insert(leaveRequests).values({
      institutionId,
      userRole: "STUDENT",
      userId: studentId,
      reason,
      startDate: new Date(startDate).toISOString().split('T')[0],
      endDate: new Date(endDate).toISOString().split('T')[0],
      parentPhone,
      status: "PENDING",
    }).returning();

    // Find class teacher
    const [section] = await db.select({
      classTeacherId: sections.classTeacherId,
      name: sections.name,
    })
      .from(sections)
      .where(and(eq(sections.id, student.sectionId), eq(sections.institutionId, institutionId)));

    if (section && section.classTeacherId) {
      // Send notification to class teacher
      await createNotification({
        institutionId,
        userRole: "STAFF",
        userId: section.classTeacherId,
        type: "LEAVE_REQUEST",
        title: "New Leave Request",
        message: `${student.name} requested leave from ${startDate} to ${endDate}.`,
        referenceId: leaveReq.id,
      });
    } else {
      // If no class teacher, notify institution admin?
      await createNotification({
        institutionId,
        userRole: "INSTITUTION",
        userId: institutionId,
        type: "LEAVE_REQUEST",
        title: "New Leave Request",
        message: `${student.name} requested leave from ${startDate} to ${endDate}.`,
        referenceId: leaveReq.id,
      });
    }

    return NextResponse.json({ success: true, id: leaveReq.id });
  } catch (err: any) {
    console.error("Error creating student leave request:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
