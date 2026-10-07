import { db } from "@/db";
import { students, classes, sections, studentPromotions } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ArrowLeft, CreditCard, User } from "lucide-react";
import Link from "next/link";
import { PrintButton } from "./PrintButton";
import { StudentDetailHistory } from "./StudentDetailHistory";
import { formatClassSection } from "@/lib/class-section-label";

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) redirect("/login");

  const { id } = await params;
  const studentId = parseInt(id);
  const institutionId = session.institutionId || session.userId;

  if (isNaN(studentId)) redirect("/institution/students");

  const [student] = await db.select({
    id: students.id,
    name: students.name,
    gender: students.gender,
    loginRollNumber: students.loginRollNumber,
    classRollNumber: students.classRollNumber,
    profilePictureUrl: students.profilePictureUrl,
    emergencyContact: students.emergencyContact,
    parentalWhatsapp: students.parentalWhatsapp,
    guardianEmail: students.guardianEmail,
    yearOfJoining: students.yearOfJoining,
    className: classes.name,
    sectionName: sections.name,
  })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .innerJoin(sections, eq(students.sectionId, sections.id))
    .where(and(eq(students.id, studentId), eq(students.institutionId, institutionId)))
    .limit(1);

  if (!student) redirect("/institution/students");

  const promotionHistory = await db.select().from(studentPromotions)
    .where(and(eq(studentPromotions.studentId, studentId), eq(studentPromotions.institutionId, institutionId)))
    .orderBy(desc(studentPromotions.createdAt));
  const historyClassIds = [...new Set(promotionHistory.flatMap((row) => [row.fromClassId, row.toClassId].filter((value): value is number => value !== null)))];
  const historyClasses = historyClassIds.length
    ? await db.select({ id: classes.id, name: classes.name })
      .from(classes)
      .where(and(eq(classes.institutionId, institutionId), inArray(classes.id, historyClassIds)))
    : [];
  const historyClassNames = new Map(historyClasses.map((row) => [row.id, row.name]));

  return (
    <div className="space-y-6 animate-fade-in print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/institution/students" prefetch={false} className="flex items-center text-sm text-stone-500 hover:text-brand-600 transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Directory
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/institution/students/id-cards?studentId=${studentId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100 transition-colors"
          >
            <CreditCard className="h-4 w-4" /> ID Card
          </Link>
          <PrintButton />
        </div>
      </div>

      <div className="print-document space-y-6">
      {promotionHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Promotion History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {promotionHistory.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm">
                <div>
                  <b>{historyClassNames.get(row.fromClassId) || "Previous class"}</b>{" "}
                  <span className="text-stone-500">Roll {row.fromRollNumber || "—"} →</span>{" "}
                  <b>{row.status === "GRADUATED" ? "Graduated" : historyClassNames.get(row.toClassId || 0) || "Current class"}</b>{" "}
                  <span className="text-stone-500">Roll {row.toRollNumber || "—"}</span>
                </div>
                <span className="rounded bg-brand-100 px-2 py-1 text-xs font-semibold text-brand-800">{row.status}</span>
                <span className="text-xs text-stone-500">{row.createdAt.toLocaleDateString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6">
        <Card className="border-t-4 border-t-brand-600">
          <CardHeader className="bg-stone-50/50 flex flex-row items-center gap-4">
            <div className="h-16 w-16 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm shrink-0">
              {student.profilePictureUrl ? (
                // User-uploaded URLs are intentionally rendered directly; adding image proxying would add server load.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={student.profilePictureUrl} alt={student.name} className="w-full h-full object-cover" />
              ) : (
                <User className="h-8 w-8" />
              )}
            </div>
            <div>
              <CardTitle className="text-2xl text-brand-950">{student.name}</CardTitle>
              <p className="text-stone-500 font-mono mt-1">{student.loginRollNumber}</p>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Class</p>
                <p className="mt-1 text-stone-800">{formatClassSection(student.className, student.sectionName)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Class Roll No.</p>
                <p className="mt-1 text-stone-800">{student.classRollNumber}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Gender</p>
                <p className="mt-1 text-stone-800">{student.gender}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Year of Joining</p>
                <p className="mt-1 text-stone-800">{student.yearOfJoining}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Emergency Contact</p>
                <p className="mt-1 text-stone-800">{student.emergencyContact || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Parental Whatsapp</p>
                <p className="mt-1 text-stone-800">{student.parentalWhatsapp || "N/A"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Guardian Email</p>
                <p className="mt-1 text-stone-800">{student.guardianEmail || "Not linked"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <StudentDetailHistory studentId={studentId} />
      </div>
      </div>
    </div>
  );
}
