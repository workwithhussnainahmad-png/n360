import { positiveInteger } from "@/lib/pagination";
import { ServerPagination } from "@/components/ui/server-pagination";
import { actionFeedback } from '@/lib/action-feedback';
import { ActionForm } from '@/components/ui/action-form';
import { formatUtcDateTime } from "@/lib/date-format";
import { db } from "@/db";
import { assignments, classes, sections, staffAssignments, students, subjects, submissions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { ClipboardList, ExternalLink, UploadCloud } from "lucide-react";
import { createStaffAssignmentAction } from "@/app/actions/assessment-actions";
import { ReferenceFileInput } from "./ReferenceFileInput";
import { AssignmentDetails } from "./AssignmentDetails";
import { formatClassSection } from "@/lib/class-section-label";

export default async function StaffAssignmentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = positiveInteger((await searchParams).page);
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) redirect("/login");

  const assignedSlots = await db.select({
    sectionId: sections.id,
    sectionName: sections.name,
    classId: classes.id,
    className: classes.name,
    subjectId: subjects.id,
    subjectName: subjects.name,
  })
    .from(staffAssignments)
    .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
    .innerJoin(classes, eq(sections.classId, classes.id))
    .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
    .where(and(eq(staffAssignments.staffId, session.userId), eq(staffAssignments.institutionId, session.institutionId)));

  const sectionOptions = Array.from(
    new Map(assignedSlots.map((slot) => [slot.sectionId, slot])).values()
  );

  const subjectOptions = Array.from(
    new Map(
      assignedSlots
        .filter((slot) => slot.subjectId && slot.subjectName)
        .map((slot) => [slot.subjectId, { id: slot.subjectId as number, name: slot.subjectName as string }])
    ).values()
  );

  const sectionIds = sectionOptions.map((slot) => slot.sectionId);

  const createdAssignmentRows = await db.select({
    assignment: assignments,
    className: classes.name,
    sectionName: sections.name,
    subjectName: subjects.name,
  })
    .from(assignments)
    .innerJoin(classes, eq(assignments.classId, classes.id))
    .leftJoin(sections, eq(assignments.sectionId, sections.id))
    .leftJoin(subjects, eq(assignments.subjectId, subjects.id))
    .where(and(eq(assignments.staffId, session.userId), eq(assignments.institutionId, session.institutionId)))
    .orderBy(desc(assignments.createdAt), desc(assignments.id)).limit(51).offset((page - 1) * 50);
  const createdAssignments = createdAssignmentRows.slice(0, 50);

  const assignmentIds = createdAssignments.map(({ assignment }) => assignment.id);
  const classIds = Array.from(new Set(createdAssignments.map(({ assignment }) => assignment.classId)));

  // Only aggregate counts are loaded on page render — full submitted/pending
  // rosters are fetched lazily by AssignmentDetails when a card is expanded.
  const [submissionCountRows, studentCountRows] = await Promise.all([
    assignmentIds.length
      ? db.select({ assignmentId: submissions.assignmentId, cnt: count() })
        .from(submissions)
        .where(and(eq(submissions.institutionId, session.institutionId), inArray(submissions.assignmentId, assignmentIds)))
        .groupBy(submissions.assignmentId)
      : Promise.resolve([]),
    classIds.length
      ? db.select({ classId: students.classId, sectionId: students.sectionId, cnt: count() })
        .from(students)
        .where(and(eq(students.institutionId, session.institutionId), inArray(students.classId, classIds)))
        .groupBy(students.classId, students.sectionId)
      : Promise.resolve([]),
  ]);

  const submissionsByAssignment = new Map<number, number>();
  for (const row of submissionCountRows) {
    submissionsByAssignment.set(row.assignmentId, row.cnt);
  }

  const studentCountBySection = new Map<number, number>();
  const studentCountByClass = new Map<number, number>();
  for (const row of studentCountRows) {
    studentCountBySection.set(row.sectionId, row.cnt);
    studentCountByClass.set(row.classId, (studentCountByClass.get(row.classId) || 0) + row.cnt);
  }

  const targetStudentCount = (classId: number, sectionId: number | null) =>
    sectionId ? (studentCountBySection.get(sectionId) || 0) : (studentCountByClass.get(classId) || 0);

  return (
    <div className="space-y-8 animate-fade-in">

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-brand-600" />
              New Assignment
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ActionForm action={async (formData: FormData) => { "use server"; return actionFeedback(() => createStaffAssignmentAction(formData)); }} className="space-y-4 pt-2 text-left">
              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">Class / Section</label>
                <select name="sectionId" required className="w-full rounded-md border border-border px-3 py-2 text-sm bg-surface">
                  <option value="">Select class...</option>
                  {sectionOptions.map((slot) => (
                    <option key={slot.sectionId} value={slot.sectionId}>
                      {formatClassSection(slot.className, slot.sectionName)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">Subject</label>
                <select name="subjectId" className="w-full rounded-md border border-border px-3 py-2 text-sm bg-surface">
                  <option value="">General assignment</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject.id} value={subject.id}>{subject.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">Title</label>
                <input name="title" required className="w-full rounded-md border border-border px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">Description</label>
                <textarea name="description" rows={3} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">Due Date</label>
                <input name="dueAt" type="datetime-local" required className="w-full rounded-md border border-border px-3 py-2 text-sm" />
              </div>

              <ReferenceFileInput />

              <SubmitButton className="w-full">Create Assignment</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-brand-600" />
              Created Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {createdAssignments.length === 0 ? (
              <p className="p-6 text-sm text-stone-500">No assignments created yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {createdAssignments.map(({ assignment, className, sectionName, subjectName }) => {
                  const targetCount = targetStudentCount(assignment.classId, assignment.sectionId);
                  const dueLabel = formatUtcDateTime(assignment.dueAt);

                  return (
                    <div key={assignment.id} className="p-5 space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-brand-950">{assignment.title}</h3>
                          <p className="text-sm text-stone-500">
                            {formatClassSection(className, sectionName)}{subjectName ? ` - ${subjectName}` : ""}
                          </p>
                          <p className="text-xs text-stone-500">Due {dueLabel}</p>
                          {assignment.referenceFileUrl && (
                            <a href={assignment.referenceFileUrl} download={assignment.referenceFileName || undefined} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-800 hover:underline">
                              Reference: {assignment.referenceFileName || "Download file"}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        <span className="text-sm font-medium text-brand-800">
                          {submissionsByAssignment.get(assignment.id) || 0}/{targetCount} submissions
                        </span>
                      </div>

                      <AssignmentDetails assignmentId={assignment.id} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <ServerPagination page={page} hasMore={createdAssignmentRows.length > 50} />
    </div>
  );
}
