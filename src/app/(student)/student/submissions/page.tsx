import { positiveInteger } from "@/lib/pagination";
import { ServerPagination } from "@/components/ui/server-pagination";
import { formatUtcDateTime } from "@/lib/date-format";
import { db } from "@/db";
import { assignments, students, subjects, submissions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getAuthenticatedStudentPlacement } from "@/lib/auth-student";
import { studentPlacementColumns } from "@/lib/student-columns";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SubmissionsClient } from "./SubmissionsClient";

export default async function StudentSubmissionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = positiveInteger((await searchParams).page);
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) redirect("/login");

  const student = getAuthenticatedStudentPlacement(session) ?? (await db
    .select(studentPlacementColumns)
    .from(students)
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
    .limit(1))[0];
  if (!student) redirect("/login");

  const assignmentRows = await db.select({
    assignment: assignments,
    subjectName: subjects.name,
    fileKey: submissions.fileKey,
  })
    .from(assignments)
    .leftJoin(subjects, eq(assignments.subjectId, subjects.id))
    .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, student.id)))
    .where(
      and(
        eq(assignments.institutionId, session.institutionId),
        eq(assignments.classId, student.classId),
        or(eq(assignments.sectionId, student.sectionId), isNull(assignments.sectionId))
      )
    ).orderBy(desc(assignments.createdAt), desc(assignments.id)).limit(51).offset((page - 1) * 50);
  const rows = assignmentRows.slice(0, 50);

  return (
    <div className="space-y-6 animate-fade-in pb-20 lg:pb-0">

      <SubmissionsClient key={page}
        assignments={rows.map(({ assignment, subjectName, fileKey }) => ({
          id: assignment.id,
          title: assignment.title,
          description: assignment.description,
          dueAtLabel: formatUtcDateTime(assignment.dueAt),
          subjectName,
          referenceFileUrl: assignment.referenceFileUrl,
          referenceFileName: assignment.referenceFileName,
          submittedFileKey: fileKey,
        }))}
      />
      <ServerPagination page={page} hasMore={assignmentRows.length > 50} />
    </div>
  );
}
