import { db } from "@/db";
import { classes, sections, studentProfileChangeRequests, students } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { StudentProfileClient } from "./StudentProfileClient";

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

export default async function StudentProfilePage() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") redirect("/login");

  const [studentRow] = await db.select({
    id: students.id,
    name: students.name,
    fatherName: students.fatherName,
    phone: students.phone,
    loginRollNumber: students.loginRollNumber,
    classRollNumber: students.classRollNumber,
    profilePictureUrl: students.profilePictureUrl,
    emergencyContact: students.emergencyContact,
    parentalWhatsapp: students.parentalWhatsapp,
    age: students.age,
    classId: students.classId,
    sectionId: students.sectionId,
    className: classes.name,
    sectionName: sections.name,
    academicStatus: students.academicStatus,
    institutionId: students.institutionId,
  })
    .from(students)
    .leftJoin(classes, eq(students.classId, classes.id))
    .leftJoin(sections, eq(students.sectionId, sections.id))
    .where(eq(students.id, session.userId))
    .limit(1);

  if (!studentRow) redirect("/login");

  const isGraduated = studentRow.academicStatus === "GRADUATED";

  const [allClasses, allSections, requests] = await Promise.all([
    isGraduated
      ? Promise.resolve([] as { id: number; name: string }[])
      : db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.institutionId, studentRow.institutionId)),
    isGraduated
      ? Promise.resolve([] as { id: number; name: string; classId: number }[])
      : db.select({ id: sections.id, name: sections.name, classId: sections.classId }).from(sections).where(eq(sections.institutionId, studentRow.institutionId)),
    db.select()
      .from(studentProfileChangeRequests)
      .where(and(
        eq(studentProfileChangeRequests.studentId, studentRow.id),
        eq(studentProfileChangeRequests.institutionId, studentRow.institutionId)
      ))
      .orderBy(desc(studentProfileChangeRequests.createdAt))
      .limit(10),
  ]);

  return (
    <StudentProfileClient
      student={{
        ...studentRow,
        className: studentRow.className || "Graduated",
        sectionName: studentRow.sectionName || "Graduated",
        ...splitName(studentRow.name),
      }}
      classes={allClasses}
      sections={allSections}
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
