import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sections, studentProfileChangeRequests, students } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { studentProfileChangeRequestSchema } from "@/lib/validators/student";
import { and, eq } from "drizzle-orm";

export const POST = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.studentAcademicStatus === "GRADUATED") {
    return NextResponse.json({ error: "Profile correction requests are closed after graduation." }, { status: 403 });
  }
  const body = await req.json();
  const parsed = studentProfileChangeRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const [student] = await db.select({
    id: students.id,
    institutionId: students.institutionId,
  }).from(students)
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
    .limit(1);
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const requestedFields: Record<string, string | number> = {};
  if (parsed.data.firstName) requestedFields.firstName = parsed.data.firstName;
  if (parsed.data.lastName) requestedFields.lastName = parsed.data.lastName;
  if (parsed.data.fatherName) requestedFields.fatherName = parsed.data.fatherName;
  if (parsed.data.classId) requestedFields.classId = parsed.data.classId;
  if (parsed.data.sectionId) requestedFields.sectionId = parsed.data.sectionId;

  if (parsed.data.sectionId) {
    const [section] = await db.select({
      id: sections.id,
      classId: sections.classId,
    }).from(sections)
      .where(and(eq(sections.id, parsed.data.sectionId), eq(sections.institutionId, student.institutionId)))
      .limit(1);
    if (!section) return NextResponse.json({ error: "Section not found" }, { status: 400 });

    if (parsed.data.classId && section.classId !== parsed.data.classId) {
      return NextResponse.json({ error: "Selected section does not belong to selected class" }, { status: 400 });
    }
  }

  await db.insert(studentProfileChangeRequests).values({
    institutionId: student.institutionId,
    studentId: student.id,
    requestedFields,
    reason: parsed.data.reason,
  });

  return NextResponse.json({ message: "Profile change request sent to admin" }, { status: 201 });
});
