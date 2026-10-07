import { db } from "@/db";
import { classes, sections, students } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StudentsPageTabs } from "./StudentsPageTabs";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ page?: string, limit?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) redirect("/login");
  
  const institutionId = session.institutionId || session.userId;
  const page = parseInt(resolvedSearchParams.page || "1") || 1;
  const limit = parseInt(resolvedSearchParams.limit || "50") || 50;
  const offset = (page - 1) * limit;

  // Requests tab data is fetched lazily on the client only when that tab is opened.
  // Campuses are loaded only when the Add Student dialog opens.
  const [allClasses, allSections, allStudents, totalCountResult] = await Promise.all([
    db.select().from(classes).where(eq(classes.institutionId, institutionId)),
    db.select().from(sections).where(eq(sections.institutionId, institutionId)),
    db.select({
      id: students.id,
      loginRollNumber: students.loginRollNumber,
      name: students.name,
      gender: students.gender,
      yearOfJoining: students.yearOfJoining,
      classId: students.classId,
      sectionId: students.sectionId,
      classRollNumber: students.classRollNumber,
      phone: students.phone,
      guardianEmail: students.guardianEmail,
    })
      .from(students)
      .where(eq(students.institutionId, institutionId))
      .orderBy(desc(students.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(students).where(eq(students.institutionId, institutionId)),
  ]);

  const totalCount = totalCountResult[0].value;

  return (
    <div className="space-y-6 animate-fade-in">
      <StudentsPageTabs
        students={allStudents}
        classes={allClasses}
        sections={allSections}
        totalCount={totalCount}
        page={page}
        limit={limit}
      />
    </div>
  );
}
