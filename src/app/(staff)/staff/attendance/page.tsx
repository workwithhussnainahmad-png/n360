import { db } from "@/db";
import { sections, classes, students } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AttendanceClient } from "./AttendanceClient";
import { attendances } from "@/db/schema";

export default async function AttendancePage() {
  const session = await getSession();
  if (!session || session.role !== "STAFF") redirect("/login");
  if (!session.institutionId) redirect("/login");

  const staffId = session.userId;

  // Get distinct sections where this staff member is the class incharge
  const assignments = await db.selectDistinct({
    id: sections.id,
    name: sections.name,
    classId: sections.classId,
    className: classes.name,
  })
    .from(sections)
    .innerJoin(classes, eq(sections.classId, classes.id))
    .where(and(eq(sections.classTeacherId, staffId), eq(sections.institutionId, session.institutionId)));

  // Only preload the first section's roster on the server — the client fetches
  // any other section's students lazily when the staff member switches sections.
  const firstSectionId = assignments[0]?.id ?? null;

  let firstSectionStudents: { id: number; name: string; loginRollNumber: string; sectionId: number }[] = [];
  let firstSectionMarkedToday = false;

  if (firstSectionId) {
    [firstSectionStudents, firstSectionMarkedToday] = await Promise.all([
      db.select({
        id: students.id,
        name: students.name,
        loginRollNumber: students.loginRollNumber,
        sectionId: students.sectionId,
      })
        .from(students)
        .where(and(eq(students.institutionId, session.institutionId), eq(students.sectionId, firstSectionId))),
      db.select({ id: attendances.id })
        .from(attendances)
        .where(and(
          eq(attendances.institutionId, session.institutionId),
          eq(attendances.date, new Date().toISOString().split("T")[0]),
          eq(attendances.sectionId, firstSectionId),
        ))
        .limit(1)
        .then((rows) => rows.length > 0),
    ]);
  }

  return (
    <AttendanceClient
      assignedSections={assignments}
      initialSectionId={firstSectionId}
      initialStudents={firstSectionStudents}
      initialAlreadyMarked={firstSectionMarkedToday}
    />
  );
}
