import { db } from "@/db";
import { classes, institutions, sections, students } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { StudentIdCardClient } from "./StudentIdCardClient";
import { CreditCard } from "lucide-react";

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-brand-950">My ID Card</h1>
          <p className="mt-1 text-sm text-stone-500">Your official student identity card. Print or save as needed.</p>
        </div>
      </div>

      <div className="flex justify-center py-4">
        <StudentIdCardClient student={row} institution={inst} />
      </div>
    </div>
  );
}
