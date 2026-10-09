import { positiveInteger } from "@/lib/pagination";
import { ServerPagination } from "@/components/ui/server-pagination";
import { actionFeedback } from '@/lib/action-feedback';
import { ActionForm } from '@/components/ui/action-form';
import { formatDefaultDate } from "@/lib/date-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { db } from "@/db";
import { classes, marks, sections, staffAssignments, subjects, tests } from "@/db/schema";
import { createStaffAssessmentAction } from "@/app/actions/assessment-actions";
import { getSession } from "@/lib/auth";
import { and, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { ClipboardList, FileEdit } from "lucide-react";
import { redirect } from "next/navigation";
import { TestMarksEntry } from "./TestMarksEntry";
import { BulkMarksUpload } from "./BulkMarksUpload";
import { formatClassSection } from "@/lib/class-section-label";

export default async function StaffMarksPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
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

  const sectionOptions = Array.from(new Map(assignedSlots.map((slot) => [slot.sectionId, slot])).values());
  const subjectOptions = Array.from(
    new Map(
      assignedSlots
        .filter((slot) => slot.subjectId && slot.subjectName)
        .map((slot) => [slot.subjectId, { id: slot.subjectId as number, name: slot.subjectName as string }])
    ).values()
  );

  const classIds = Array.from(new Set(assignedSlots.map((slot) => slot.classId)));
  const sectionIds = Array.from(new Set(assignedSlots.map((slot) => slot.sectionId)));
  const subjectIds = Array.from(new Set(assignedSlots.map((slot) => slot.subjectId).filter((id): id is number => Boolean(id))));

  const eligibleTestRows = sectionIds.length === 0 ? [] : await db.select({
    test: tests,
    subjectName: subjects.name,
    className: classes.name,
    sectionName: sections.name,
  })
    .from(tests)
    .innerJoin(classes, eq(tests.classId, classes.id))
    .leftJoin(sections, eq(tests.sectionId, sections.id))
    .leftJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(and(eq(tests.institutionId, session.institutionId), or(
      and(eq(tests.createdByRole, "STAFF"), eq(tests.staffId, session.userId), inArray(tests.sectionId, sectionIds)),
      and(eq(tests.createdByRole, "INSTITUTION"), inArray(tests.classId, classIds), inArray(tests.subjectId, subjectIds), or(inArray(tests.sectionId, sectionIds), isNull(tests.sectionId)))
    ))).orderBy(desc(tests.createdAt), desc(tests.id)).limit(51).offset((page - 1) * 50);

  const eligibleTests = eligibleTestRows.slice(0, 50);
  const testIds = eligibleTests.map(({ test }) => test.id);

  // Aggregate-only: per-student rosters and existing marks are intentionally not
  // loaded here to avoid pulling every student/mark row on each page visit.
  // TestMarksEntry fetches the scoped roster (+ any existing marks) lazily when
  // a staff member opens manual entry for a specific test.
  const uploadedCountRows = testIds.length ? await db.select({
    testId: marks.testId,
    uploadedCount: count(),
  }).from(marks).where(and(eq(marks.institutionId, session.institutionId), inArray(marks.testId, testIds))).groupBy(marks.testId) : [];

  const marksByTest = new Map<number, number>();
  for (const row of uploadedCountRows) {
    marksByTest.set(row.testId, row.uploadedCount);
  }

  return (
    <div className="space-y-8 animate-fade-in">

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileEdit className="h-5 w-5 text-brand-600" />
              Daily / Weekly / Quiz
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ActionForm action={async (formData: FormData) => { "use server"; return actionFeedback(() => createStaffAssessmentAction(formData)); }} className="space-y-4 pt-2 text-left">
              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">Class / Section</label>
                <select name="sectionId" required className="w-full rounded-md border border-border px-3 py-2 text-sm bg-surface">
                  <option value="">Select class...</option>
                  {sectionOptions.map((slot) => (
                    <option key={slot.sectionId} value={slot.sectionId}>{formatClassSection(slot.className, slot.sectionName)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">Type</label>
                <select name="type" required className="w-full rounded-md border border-border px-3 py-2 text-sm bg-surface">
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="QUIZ">Quiz</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">Title</label>
                <input name="title" required placeholder="e.g. Chapter 3 Quiz" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">Date</label>
                  <input name="date" type="date" required className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">Total</label>
                  <input name="maxMarks" type="number" min="1" step="0.01" required className="w-full rounded-md border border-border px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Subject(s)</label>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2 space-y-2">
                  {subjectOptions.map((subject) => (
                    <label key={subject.id} className="flex items-center gap-2 text-sm text-stone-700">
                      <input type="checkbox" name="subjectIds" value={subject.id} className="rounded border-stone-300" />
                      {subject.name}
                    </label>
                  ))}
                </div>
              </div>

              <SubmitButton className="w-full">Create Assessment</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-brand-600" />
              Assessments Ready For Marks
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {eligibleTests.length === 0 ? (
              <p className="p-6 text-sm text-stone-500">No assessments are available for your assigned classes yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {eligibleTests.map(({ test, className, sectionName, subjectName }) => {
                  // Both controls previously discarded these same unrelated sections.
                  const testSectionOptions = sectionOptions
                    .filter((slot) => test.sectionId ? slot.sectionId === test.sectionId : slot.classId === test.classId)
                    .map(({ sectionId, sectionName, classId, className }) => ({ sectionId, sectionName, classId, className }));
                  return (
                  <div key={test.id} className="p-5 grid gap-4 xl:grid-cols-[1fr_360px] xl:items-center">
                    <div>
                      <h3 className="font-semibold text-brand-950">{test.title}</h3>
                      <p className="text-sm text-stone-500">
                        {test.type} - {formatClassSection(className, sectionName)} - {subjectName || "Subject"}
                      </p>
                      <p className="text-xs text-stone-500">
                        {formatDefaultDate(new Date(test.date))} - {test.maxMarks} marks - {marksByTest.get(test.id) || 0} uploaded
                      </p>
                      {test.createdByRole === "STAFF" && (
                        <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${test.resultsPublishedAt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {test.resultsPublishedAt ? "Published" : "Draft results"}
                        </span>
                      )}
                    </div>

                    <div className="space-y-4 xl:col-span-2">
                      <TestMarksEntry
                        testId={test.id}
                        classId={test.classId}
                        maxMarks={Number(test.maxMarks)}
                        fixedSectionId={test.sectionId}
                        sectionOptions={testSectionOptions}
                      />

                      <BulkMarksUpload
                        testId={test.id}
                        classId={test.classId}
                        fixedSectionId={test.sectionId}
                        sectionOptions={testSectionOptions}
                        canPublish={test.createdByRole === "STAFF" && test.staffId === session.userId}
                        published={Boolean(test.resultsPublishedAt)}
                      />
                    </div>
                  </div>
                )})}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 text-sm text-stone-600">
          Download each assessment&apos;s prefilled roster, enter marks in the Marks Obtained column, save it as CSV, and upload it. Results are checked against the assigned section and remain private until published.
        </CardContent>
      </Card>
      <ServerPagination page={page} hasMore={eligibleTestRows.length > 50} />
    </div>
  );
}
