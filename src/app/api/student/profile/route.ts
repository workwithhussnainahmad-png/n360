import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { students, classes, sections, campuses } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { updateStudentProfileSchema } from "@/lib/validators/student";
import { and, eq, sql } from "drizzle-orm";
export { corsPreflight as OPTIONS } from "@/lib/cors";

// Compile SQL/row mapping once; every profile read still queries the database.
// The pool may assign a reusable name when protocol-level preparation is enabled.
function prepareProfile() {
  return db.select({
      id: students.id, name: students.name, fatherName: students.fatherName, phone: students.phone,
      gender: students.gender, profilePictureUrl: students.profilePictureUrl,
      emergencyContact: students.emergencyContact, parentalWhatsapp: students.parentalWhatsapp,
      loginRollNumber: students.loginRollNumber, classRollNumber: students.classRollNumber,
      academicStatus: students.academicStatus, age: students.age,
      className: classes.name, sectionName: sections.name, campusName: campuses.name,
    }).from(students)
    .leftJoin(classes, eq(students.classId, classes.id))
    .leftJoin(sections, eq(students.sectionId, sections.id))
    .leftJoin(campuses, eq(students.campusId, campuses.id))
    .where(and(eq(students.id, sql.placeholder("userId")), eq(students.institutionId, sql.placeholder("institutionId"))))
    .prepare('');
}
let profileQuery: ReturnType<typeof prepareProfile> | undefined;

export const GET = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [profile] = await (profileQuery ??= prepareProfile()).execute({ userId: session.userId, institutionId: session.institutionId });
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    if (req.nextUrl.searchParams.get("include") !== "catalog") return NextResponse.json({ profile });
    const allClasses = await db.select({ id: classes.id, name: classes.name }).from(classes)
      .where(eq(classes.institutionId, session.institutionId));
    const allSections = await db.select({ id: sections.id, name: sections.name, classId: sections.classId }).from(sections)
      .where(eq(sections.institutionId, session.institutionId));
    return NextResponse.json({ profile, classes: allClasses, sections: allSections });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
});

export const PATCH = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.studentAcademicStatus === "GRADUATED") {
    return NextResponse.json({ error: "Profile updates are closed after graduation." }, { status: 403 });
  }
  const body = await req.json();
  const parsed = updateStudentProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await db.update(students)
    .set({ 
      ...(parsed.data.fatherName && { fatherName: parsed.data.fatherName }),
      ...(parsed.data.profilePictureUrl && { profilePictureUrl: parsed.data.profilePictureUrl }),
      ...(parsed.data.emergencyContact !== undefined && { emergencyContact: parsed.data.emergencyContact }),
      ...(parsed.data.parentalWhatsapp !== undefined && { parentalWhatsapp: parsed.data.parentalWhatsapp }),
      ...(parsed.data.age !== undefined && { age: parsed.data.age })
    })
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)));

  return NextResponse.json({ message: "Profile updated successfully" });
});
