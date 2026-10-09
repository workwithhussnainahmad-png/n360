import { db } from "@/db";
import { classes, sections, students } from "@/db/schema";
import { eq, desc, count, and, or, ilike } from "drizzle-orm";
import { positiveInteger, pagination } from "@/lib/pagination";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StudentsPageTabs } from "./StudentsPageTabs";

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ page?: string, limit?: string, classId?: string, sectionId?: string, q?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) redirect("/login");
  
  const institutionId = session.institutionId || session.userId;
  const requestedPage = positiveInteger(resolvedSearchParams.page);
  const limit = positiveInteger(resolvedSearchParams.limit, 50, 100);
  const filterClassId = resolvedSearchParams.classId ? positiveInteger(resolvedSearchParams.classId, 0) : 0;
  const filterSectionId = resolvedSearchParams.sectionId ? positiveInteger(resolvedSearchParams.sectionId, 0) : 0;
  const query = (resolvedSearchParams.q || '').trim().slice(0, 80);
  const pattern = '%' + query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') + '%';
  const conditions = and(eq(students.institutionId, institutionId), filterClassId ? eq(students.classId, filterClassId) : undefined,
    filterSectionId ? eq(students.sectionId, filterSectionId) : undefined,
    query ? or(ilike(students.name, pattern), ilike(students.loginRollNumber, pattern), ilike(students.classRollNumber, pattern)) : undefined);
  const [{ value: totalCount }] = await db.select({ value: count() }).from(students).where(conditions);
  const { page, offset } = pagination(requestedPage, totalCount, limit);

  // Requests tab data is fetched lazily on the client only when that tab is opened.
  // Campuses are loaded only when the Add Student dialog opens.
  const [allClasses, allSections, allStudents] = await Promise.all([
    db.select({ id: classes.id, name: classes.name }).from(classes).where(eq(classes.institutionId, institutionId)),
    db.select({ id: sections.id, name: sections.name, classId: sections.classId }).from(sections).where(eq(sections.institutionId, institutionId)),
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
      .where(conditions)
      .orderBy(desc(students.createdAt), desc(students.id))
      .limit(limit)
      .offset(offset),
  ]);


  return (
    <div className="space-y-6 animate-fade-in">
      <StudentsPageTabs
        students={allStudents}
        classes={allClasses}
        sections={allSections}
        totalCount={totalCount}
        page={page}
        limit={limit}
        filterClassId={filterClassId ? String(filterClassId) : ""}
        filterSectionId={filterSectionId ? String(filterSectionId) : ""}
        query={query}
      />
    </div>
  );
}
