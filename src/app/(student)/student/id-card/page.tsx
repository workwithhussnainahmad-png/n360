import { db } from "@/db";
import { classes, institutions, sections, students } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { StudentIdCardClient } from "./StudentIdCardClient";
import Link from "next/link";
import { QrCapacityError, studentIdCardQr } from "@/lib/student-id-card-qr";
import { headers } from "next/headers";

export default async function StudentIdCardPage() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") redirect("/login");

  const [row] = await db
    .select({
      id: students.id,
      name: students.name,
      fatherName: students.fatherName,
      phone: students.phone,
      emergencyContact: students.emergencyContact,
      profilePictureUrl: students.profilePictureUrl,
      loginRollNumber: students.loginRollNumber,
      classRollNumber: students.classRollNumber,
      className: classes.name,
      sectionName: sections.name,
      institutionId: students.institutionId,
      createdAt: students.createdAt,
    })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .innerJoin(sections, eq(students.sectionId, sections.id))
    .where(eq(students.id, session.userId))
    .limit(1);

  if (!row) redirect("/login");

  const [inst] = await db
    .select({
      name: institutions.name,
      logoKey: institutions.logoKey,
      signatureKey: institutions.signatureKey,
    })
    .from(institutions)
    .where(eq(institutions.id, row.institutionId))
    .limit(1);

  if (!inst) redirect("/student/dashboard");
  const requestHeaders = await headers();

  let verificationQr: string;
  try { verificationQr = await studentIdCardQr(row, requestHeaders.get("host")); }
  catch (error) {
    if (error instanceof QrCapacityError) return <p role="alert">{error.message} <Link href="/student/id-card" prefetch={false} className="underline">Try again</Link></p>;
    throw error;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-center py-4">
        <StudentIdCardClient student={row} institution={inst} verificationQr={verificationQr} />
      </div>
    </div>
  );
}
