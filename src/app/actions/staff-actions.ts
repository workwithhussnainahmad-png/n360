"use server";

import { db } from "@/db";
import { attendances, announcements, sections, staffAssignments, students } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createAttendanceNotifications } from "@/lib/notifications";
import { after } from "next/server";

type AnnouncementTargetType = "ALL" | "CAMPUS" | "CLASS" | "SECTION" | "USER";

export async function submitAttendanceAction(
  sectionId: number,
  date: Date,
  records: { studentId: number; status: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" }[]
) {
  const session = await getSession();
  if (!session || session.role !== "STAFF") throw new Error("Unauthorized");

  const institutionId = session.institutionId;
  if (!institutionId) throw new Error("No institution bound");

  const [section] = await db.select({ classTeacherId: sections.classTeacherId })
    .from(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.institutionId, institutionId)))
    .limit(1);

  if (!section || section.classTeacherId !== session.userId) {
    throw new Error("You are not authorized to mark attendance for this class. Only the designated Class Incharge can do this.");
  }

  if (records.length > 0) {
    const studentIds = records.map(record => record.studentId);
    const validStudents = await db.select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.institutionId, institutionId),
        eq(students.sectionId, sectionId),
        inArray(students.id, studentIds)
      ));

    if (validStudents.length !== new Set(studentIds).size) {
      throw new Error("Attendance records include students outside this section.");
    }
  }

  const attendanceDate = date.toISOString().split("T")[0];
  if (records.length > 0) {
    await db.insert(attendances).values(records.map((record) => ({
      institutionId,
      sectionId,
      studentId: record.studentId,
      date: attendanceDate,
      status: record.status,
    }))).onConflictDoUpdate({
      target: [attendances.studentId, attendances.date],
      set: { status: sql`excluded.status` }
    });
  }

  after(async () => {
    try {
      await createAttendanceNotifications({ institutionId, date, records });
    } catch (error) {
      console.error("Attendance notification delivery failed:", error);
    }
  });

  return { success: true };
}

export async function createStaffAnnouncementAction(formData: FormData) {
  const session = await getSession();
  if (!session || session.role !== "STAFF") throw new Error("Unauthorized");

  const institutionId = session.institutionId;
  if (!institutionId) throw new Error("No institution bound");

  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const targetType = formData.get("targetType") as AnnouncementTargetType;
  const targetClassId = formData.get("targetClassId") ? parseInt(formData.get("targetClassId") as string) : null;
  const targetSectionId = formData.get("targetSectionId") ? parseInt(formData.get("targetSectionId") as string) : null;

  if (!title.trim() || !content.trim()) throw new Error("Title and content are required");
  if (targetType !== "CLASS" && targetType !== "SECTION") throw new Error("Invalid target audience");
  if (!targetClassId || !Number.isInteger(targetClassId)) throw new Error("Class is required");

  const assignedRows = await db.selectDistinct({
    sectionId: sections.id,
    classId: sections.classId,
  })
    .from(staffAssignments)
    .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
    .where(and(
      eq(staffAssignments.staffId, session.userId),
      eq(staffAssignments.institutionId, institutionId),
      eq(sections.institutionId, institutionId),
      eq(sections.classId, targetClassId),
    ));

  if (assignedRows.length === 0) throw new Error("This class is not assigned to you");

  if (targetType === "SECTION") {
    if (!targetSectionId || !Number.isInteger(targetSectionId)) throw new Error("Section is required");
    const selectedSection = assignedRows.find((row) => row.sectionId === targetSectionId);
    if (!selectedSection) throw new Error("Section not found for the selected class");
  }

  const [inserted] = await db.insert(announcements).values({
    institutionId,
    senderRole: "STAFF",
    senderId: session.userId,
    targetType,
    targetClassId,
    targetSectionId: targetType === "SECTION" ? targetSectionId : null,
    title,
    content
  }).returning({ id: announcements.id });

  const { processAnnouncementNotification } = await import("@/lib/notifications");
  await processAnnouncementNotification(inserted.id);

  return { success: true };
}
