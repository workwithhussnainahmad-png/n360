import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { batchExamResults, batchExamSubjects, batchExams, classes, sections, students, subjects } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { PromotionReviewActions, type PromotionReviewCsvRow } from "./PromotionReviewActions";
import { formatClassSection } from "@/lib/class-section-label";

function fileSlug(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "promotion-review";
}

export default async function PromotionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN") || !session.institutionId) {
    redirect("/institution-login");
  }

  const { id } = await params;
  const batchExamId = Number(id);
  if (!Number.isInteger(batchExamId)) notFound();

  const [batch] = await db.select({
    id: batchExams.id,
    title: batchExams.title,
    officialPublishedAt: batchExams.officialPublishedAt,
    className: classes.name,
    sectionName: sections.name,
  })
    .from(batchExams)
    .innerJoin(classes, eq(batchExams.classId, classes.id))
    .leftJoin(sections, eq(batchExams.sectionId, sections.id))
    .where(and(
      eq(batchExams.id, batchExamId),
      eq(batchExams.institutionId, session.institutionId),
      eq(batchExams.type, "PROMOTION")
    ))
    .limit(1);

  if (!batch) notFound();

  const rawRows = await db.select({
    studentId: students.id,
    student: students.name,
    roll: students.classRollNumber,
    subject: subjects.name,
    marks: batchExamResults.marksObtained,
    maxMarks: batchExamSubjects.maxMarks,
    isPublished: batchExamSubjects.isPublished,
  })
    .from(batchExamResults)
    .innerJoin(batchExamSubjects, eq(batchExamResults.batchExamSubjectId, batchExamSubjects.id))
    .innerJoin(subjects, eq(batchExamSubjects.subjectId, subjects.id))
    .innerJoin(students, eq(batchExamResults.studentId, students.id))
    .where(eq(batchExamSubjects.batchExamId, batch.id))
    .orderBy(students.classRollNumber, students.name, subjects.name);

  const subjectNames = Array.from(new Set(rawRows.map((row) => row.subject)));
  const allSubjectsPublished = rawRows.length > 0 && rawRows.every((row) => row.isPublished);
  const rowsByStudent = new Map<number, PromotionReviewCsvRow & { maxTotal: number }>();

  for (const row of rawRows) {
    const existing = rowsByStudent.get(row.studentId) || {
      roll: row.roll,
      student: row.student,
      total: 0,
      maxTotal: 0,
      percentage: 0,
      status: "",
      subjects: {},
    };
    existing.subjects[row.subject] = `${row.marks}/${row.maxMarks}`;
    existing.total += row.marks;
    existing.maxTotal += row.maxMarks;
    rowsByStudent.set(row.studentId, existing);
  }

  const reviewRows = Array.from(rowsByStudent.values()).map((row) => ({
    ...row,
    percentage: row.maxTotal > 0 ? (row.total / row.maxTotal) * 100 : 0,
    status: allSubjectsPublished ? "Ready for institution publish" : "Awaiting teachers",
  }));

  const csvRows = reviewRows.map((row) => ({
    roll: row.roll,
    student: row.student,
    total: row.total,
    percentage: row.percentage,
    status: row.status,
    subjects: row.subjects,
  }));

  return (
    <div className="print-document mx-auto max-w-7xl space-y-6 p-6 print:p-0">
      <div className="flex flex-col gap-4 border-b pb-5 print:border-b-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-stone-500">Promotion Review Sheet</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-brand-950">{batch.title}</h1>
          <p className="mt-2 text-sm text-stone-500">
            Class {formatClassSection(batch.className, batch.sectionName, ", ")}
          </p>
        </div>
        <PromotionReviewActions fileName={fileSlug(batch.title)} subjects={subjectNames} rows={csvRows} />
      </div>

      <div className="grid gap-3 md:grid-cols-3 print:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-stone-500">Students</p>
            <p className="text-2xl font-semibold">{reviewRows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-stone-500">Subjects</p>
            <p className="text-2xl font-semibold">{subjectNames.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-stone-500">Status</p>
            <Badge className={batch.officialPublishedAt ? "mt-2 bg-indigo-100 text-indigo-700" : allSubjectsPublished ? "mt-2 bg-emerald-100 text-emerald-700" : "mt-2 bg-amber-100 text-amber-700"}>
              {batch.officialPublishedAt ? "Official" : allSubjectsPublished ? "Ready" : "Awaiting teachers"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Roll</TableHead>
                <TableHead>Student</TableHead>
                {subjectNames.map((subject) => <TableHead key={subject}>{subject}</TableHead>)}
                <TableHead>Total</TableHead>
                <TableHead>Percentage</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviewRows.map((row) => (
                <TableRow key={row.roll}>
                  <TableCell>{row.roll}</TableCell>
                  <TableCell className="font-medium">{row.student}</TableCell>
                  {subjectNames.map((subject) => <TableCell key={subject}>{row.subjects[subject] || "-"}</TableCell>)}
                  <TableCell>{row.total}/{row.maxTotal}</TableCell>
                  <TableCell>{row.percentage.toFixed(2)}%</TableCell>
                  <TableCell>{row.status}</TableCell>
                </TableRow>
              ))}
              {reviewRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={subjectNames.length + 5} className="p-6 text-center text-stone-500">
                    No marks found for this Promotion result.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
