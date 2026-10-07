import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { students } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getParentPortalContext } from "@/lib/parent-access";
import { formatClassSection } from "@/lib/class-section-label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";

export default async function ParentProfilePage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const session = await getSession(); if (!session || session.role !== "PARENT") redirect("/parent-login");
  const context = await getParentPortalContext(session, (await searchParams).student); const child = context.selectedChild; if (!child) return <ParentNoChildren />;
  const [record] = await db.select({ fatherName: students.fatherName, phone: students.phone, gender: students.gender, loginId: students.loginRollNumber, classRoll: students.classRollNumber, year: students.yearOfJoining, age: students.age, emergency: students.emergencyContact, whatsapp: students.parentalWhatsapp, guardianEmail: students.guardianEmail, status: students.academicStatus })
    .from(students).where(and(eq(students.institutionId, context.institutionId), eq(students.id, child.id))).limit(1);
  return <div className="space-y-6"><ParentChildHeader title="Student profile" description="Identity, enrolment and guardian information held by the institution." students={context.children} selectedStudentId={child.id} path="/parent/profile" />
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader className="border-b border-border"><CardTitle>Student information</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Full name" value={child.name} /><Field label="Father / guardian" value={record?.fatherName} /><Field label="Class" value={formatClassSection(child.className, child.sectionName)} /><Field label="Class roll number" value={record?.classRoll} /><Field label="Student login ID" value={record?.loginId} /><Field label="Campus" value={child.campusName} /><Field label="Year of joining" value={record?.year} /><Field label="Academic status" value={record?.status} /><Field label="Gender" value={record?.gender} /><Field label="Age" value={record?.age} /></CardContent></Card>
      <Card><CardHeader className="border-b border-border"><CardTitle>Guardian & contact details</CardTitle></CardHeader><CardContent className="grid gap-4 p-5 sm:grid-cols-2"><Field label="Parent portal email" value={context.parent.email} /><Field label="Guardian email on student" value={record?.guardianEmail} /><Field label="Student phone" value={record?.phone} /><Field label="Parent WhatsApp" value={record?.whatsapp} /><Field label="Emergency contact" value={record?.emergency} /></CardContent></Card>
    </div>
    <p className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">For safety, parents and students cannot directly alter identity or guardian details. Ask the institution to correct inaccurate information.</p>
  </div>;
}
function Field({ label, value }: { label: string; value: string | number | null | undefined }) { return <div><p className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1.5 text-sm font-semibold text-brand-950">{value === null || value === undefined || value === "" ? "Not provided" : String(value)}</p></div>; }
