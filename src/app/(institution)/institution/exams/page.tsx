import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InstitutionExamForm } from "@/components/exams/InstitutionExamForm";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteInstitutionExamAction, updateInstitutionExamAction } from "@/app/actions/assessment-actions";
import { db } from "@/db";
import { classes, subjects, tests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, desc, eq, inArray } from "drizzle-orm";
import { CalendarDays, ClipboardList, Pencil, Trash2 } from "lucide-react";
import { redirect } from "next/navigation";
import { ExamsPageTabs } from "./ExamsPageTabs";

function formatExamDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function countSundays(start: string, end: string) {
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  let total = 0;

  while (current <= last) {
    if (current.getUTCDay() === 0) total += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return total;
}

export default async function InstitutionExamsPage() {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) redirect("/login");

  const institutionId = session.institutionId || session.userId;
  // Sections are only needed by the Publish Results tab; fetched lazily on the client
  // once that tab is opened so the Timetable tab doesn't force that extra query.
  const [allClasses, allSubjects, examRows] = await Promise.all([
    db.select().from(classes).where(eq(classes.institutionId, institutionId)).orderBy(classes.level),
    db.select().from(subjects).where(eq(subjects.institutionId, institutionId)),
    db.select({
      id: tests.id,
      title: tests.title,
      type: tests.type,
      date: tests.date,
      endDate: tests.endDate,
      maxMarks: tests.maxMarks,
      classId: tests.classId,
      subjectId: tests.subjectId,
      className: classes.name,
      subjectName: subjects.name,
    })
      .from(tests)
      .innerJoin(classes, eq(tests.classId, classes.id))
      .innerJoin(subjects, eq(tests.subjectId, subjects.id))
      .where(and(
        eq(tests.institutionId, institutionId),
        eq(tests.createdByRole, "INSTITUTION"),
        inArray(tests.type, ["MONTHLY", "MID", "FINAL", "PROMOTION"])
      ))
      .orderBy(desc(tests.createdAt)),
  ]);

  const examGroups = Array.from(
    examRows.reduce((groups, exam) => {
      const key = `${exam.title}-${exam.type}-${exam.classId}-${exam.maxMarks}-${exam.endDate || exam.date}`;
      const existing = groups.get(key);
      if (existing) {
        existing.examIds.push(exam.id);
        existing.subjectIds.push(exam.subjectId);
        existing.subjectCount += 1;
        if (exam.date < existing.startDate) existing.startDate = exam.date;
        if ((exam.endDate || exam.date) > existing.endDate) existing.endDate = exam.endDate || exam.date;
      } else {
        groups.set(key, {
          key,
          title: exam.title,
          type: exam.type,
          classId: exam.classId,
          className: exam.className,
          maxMarks: exam.maxMarks,
          examIds: [exam.id],
          subjectIds: [exam.subjectId],
          subjectCount: 1,
          startDate: exam.date,
          endDate: exam.endDate || exam.date,
        });
      }
      return groups;
    }, new Map<string, {
      key: string;
      title: string;
      type: string;
      classId: number;
      className: string;
      maxMarks: number;
      examIds: number[];
      subjectIds: number[];
      subjectCount: number;
      startDate: string;
      endDate: string;
    }>())
      .values()
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Exam Management</h1>
        <p className="text-stone-500 mt-1">Create institution exams for classes. Monthly, Mid, and Final exams are scheduled here without questions or MCQs.</p>
      </div>

      <ExamsPageTabs
        classes={allClasses}
        subjects={allSubjects}
        timetable={
          <>
          <Card className="h-fit">
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-brand-700" />
                Create Institution Exam
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <InstitutionExamForm
                classes={allClasses.map((classRow) => ({ id: classRow.id, name: classRow.name }))}
                subjects={allSubjects.map((subject) => ({ id: subject.id, name: subject.name }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardList className="h-5 w-5 text-brand-700" />
                Scheduled Exams
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {examRows.length === 0 ? (
                <p className="p-4 sm:p-8 text-sm text-stone-500">No institution exams scheduled yet.</p>
              ) : (
                <div>
                  <div className="grid gap-4 border-b border-border p-5 xl:grid-cols-2">
                    {examGroups.map((group) => {
                      const skippedSundays = countSundays(group.startDate, group.endDate);
                      return (
                        <div key={group.key} className="rounded-xl border border-border bg-white shadow-sm overflow-hidden flex flex-col">
                          <div className="bg-brand-50/50 p-4 border-b border-border flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-brand-950 text-base">{group.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs font-medium bg-white border border-border px-2 py-0.5 rounded text-stone-600">{group.className}</span>
                                <span className="text-xs font-medium bg-brand-100 text-brand-700 px-2 py-0.5 rounded">{group.type}</span>
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full bg-white border border-border px-3 py-1 text-xs font-semibold text-brand-800 shadow-sm">
                              {group.subjectCount} books
                            </span>
                          </div>

                          <div className="p-4 flex-1">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-stone-500 text-xs uppercase tracking-wider font-semibold mb-1">Start Date</p>
                                <p className="font-medium text-stone-900">{formatExamDate(group.startDate)}</p>
                              </div>
                              <div>
                                <p className="text-stone-500 text-xs uppercase tracking-wider font-semibold mb-1">End Date</p>
                                <p className="font-medium text-stone-900">{formatExamDate(group.endDate)}</p>
                              </div>
                            </div>
                            <p className="mt-4 text-xs text-stone-500 bg-stone-50 p-2 rounded border border-border">
                              <span className="font-medium text-stone-700">Sundays skipped: {skippedSundays}.</span> End date is calculated from the selected books.
                            </p>
                          </div>

                          <div className="p-4 border-t border-border bg-stone-50/30 flex flex-wrap gap-2 mt-auto">
                            <details className="w-full">
                              <summary className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50">
                                <Pencil className="h-3.5 w-3.5" />
                                Update exam
                              </summary>
                              <div className="mt-3 rounded-md border border-border bg-white p-4">
                                <InstitutionExamForm
                                  classes={allClasses.map((classRow) => ({ id: classRow.id, name: classRow.name }))}
                                  subjects={allSubjects.map((subject) => ({ id: subject.id, name: subject.name }))}
                                  action={updateInstitutionExamAction}
                                  submitLabel="Update Exam Dates"
                                  hiddenFields={{ examIds: group.examIds.join(",") }}
                                  initialValues={{
                                    classId: group.classId,
                                    type: group.type as "MONTHLY" | "MID" | "FINAL" | "PROMOTION",
                                    title: group.title,
                                    maxMarks: group.maxMarks,
                                    date: group.startDate,
                                    subjectIds: group.subjectIds,
                                  }}
                                />
                              </div>
                            </details>
                            <form action={deleteInstitutionExamAction}>
                              <input type="hidden" name="examIds" value={group.examIds.join(",")} />
                              <SubmitButton variant="outline" className="gap-2 border-danger/30 text-danger hover:bg-danger/10">
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete exam
                              </SubmitButton>
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="overflow-x-auto p-1">
                    <Table>
                      <TableHeader className="bg-stone-50/80">
                        <TableRow>
                          <TableHead className="w-[200px]">Exam</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Subject Date</TableHead>
                          <TableHead>End Date</TableHead>
                          <TableHead className="text-right">Marks</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {examRows.map((exam) => (
                          <TableRow key={exam.id}>
                            <TableCell className="font-medium">
                              <p className="text-brand-950">{exam.title}</p>
                              <p className="text-xs text-stone-500 font-normal">{exam.type}</p>
                            </TableCell>
                            <TableCell>{exam.className}</TableCell>
                            <TableCell>{exam.subjectName}</TableCell>
                            <TableCell>{formatExamDate(exam.date)}</TableCell>
                            <TableCell>{exam.endDate ? formatExamDate(exam.endDate) : "-"}</TableCell>
                            <TableCell className="text-right font-medium">{exam.maxMarks}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          </>
        }
      />
    </div>
  );
}
