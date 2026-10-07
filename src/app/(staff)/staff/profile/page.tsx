import { db } from "@/db";
import { campuses, classes, sections, staff, staffAssignments, staffProfileChangeRequests, subjects } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { StaffProfileClient } from "./StaffProfileClient";

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

export default async function StaffProfilePage() {
  const session = await getSession();
  if (!session || session.role !== "STAFF") redirect("/login");

  const [staffRow] = await db.select({
    id: staff.id,
    name: staff.name,
    email: staff.email,
    phone: staff.phone,
    profilePictureUrl: staff.profilePictureUrl,
    campusId: staff.campusId,
    campusName: campuses.name,
    institutionId: staff.institutionId,
    isActive: staff.isActive,
    createdAt: staff.createdAt,
  })
    .from(staff)
    .leftJoin(campuses, eq(staff.campusId, campuses.id))
    .where(eq(staff.id, session.userId))
    .limit(1);

  if (!staffRow) redirect("/login");

  const [allCampuses, assignments, requests] = await Promise.all([
    db.select({ id: campuses.id, name: campuses.name }).from(campuses).where(eq(campuses.institutionId, staffRow.institutionId)),
    db.select({
      id: staffAssignments.id,
      subject: subjects.name,
      className: classes.name,
      sectionName: sections.name,
      dayOfWeek: staffAssignments.dayOfWeek,
      startTime: staffAssignments.startTime,
      endTime: staffAssignments.endTime,
    })
      .from(staffAssignments)
      .innerJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
      .innerJoin(classes, eq(sections.classId, classes.id))
      .where(eq(staffAssignments.staffId, staffRow.id))
      .orderBy(staffAssignments.dayOfWeek, staffAssignments.startTime),
    db.select()
      .from(staffProfileChangeRequests)
      .where(and(
        eq(staffProfileChangeRequests.staffId, staffRow.id),
        eq(staffProfileChangeRequests.institutionId, staffRow.institutionId)
      ))
      .orderBy(desc(staffProfileChangeRequests.createdAt))
      .limit(10),
  ]);

  return (
    <StaffProfileClient
      staff={{
        ...staffRow,
        ...splitName(staffRow.name),
        campusName: staffRow.campusName || "Main",
        joinedAt: staffRow.createdAt.toISOString(),
      }}
      campuses={allCampuses}
      assignments={assignments}
      requests={requests.map((request) => ({
        id: request.id,
        requestedFields: request.requestedFields as Record<string, string | number>,
        reason: request.reason,
        status: request.status,
        adminNote: request.adminNote,
        createdAt: request.createdAt.toISOString(),
      }))}
    />
  );
}
