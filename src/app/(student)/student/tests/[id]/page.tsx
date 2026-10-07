import { StudentTestTaker } from "@/components/tests/StudentTestTaker";
import { db } from "@/db";
import { onlineTestQuestions, onlineTestSubmissions, onlineTests, students, subjects, tests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { studentPlacementColumns } from "@/lib/student-columns";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TakeStudentTestPage({ params }: PageProps) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) redirect("/login");

  const { id } = await params;
  const onlineTestId = Number(id);
  if (!Number.isInteger(onlineTestId)) redirect("/student/tests");

  const [student] = await db
    .select(studentPlacementColumns)
    .from(students)
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
    .limit(1);
  if (!student) redirect("/login");

  const [row] = await db.select({
    onlineTest: onlineTests,
    test: tests,
    subjectName: subjects.name,
  })
    .from(onlineTests)
    .innerJoin(tests, eq(onlineTests.testId, tests.id))
    .leftJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(and(eq(onlineTests.id, onlineTestId), eq(onlineTests.institutionId, session.institutionId)))
    .limit(1);

  if (!row || row.test.classId !== student.classId || row.test.sectionId !== student.sectionId) redirect("/student/tests");

  const [submission] = await db.select().from(onlineTestSubmissions).where(and(
    eq(onlineTestSubmissions.institutionId, session.institutionId),
    eq(onlineTestSubmissions.onlineTestId, onlineTestId),
    eq(onlineTestSubmissions.studentId, session.userId)
  )).limit(1);
  const isFinished = submission && submission.status !== "IN_PROGRESS";
  const nowMs = new Date().getTime();
  if (!submission && row.onlineTest.createdAt.getTime() + row.onlineTest.durationMinutes * 60 * 1000 <= nowMs) redirect("/student/tests");

  const questionRows = await db.select().from(onlineTestQuestions).where(eq(onlineTestQuestions.onlineTestId, onlineTestId)).orderBy(onlineTestQuestions.orderIndex);
  const questions = questionRows.map((question) => ({
    id: question.id,
    questionType: question.questionType,
    prompt: question.prompt,
    options: Array.isArray(question.options) ? question.options.map(String) : null,
    marks: Number(question.marks),
    correctOptionIndex: isFinished ? question.correctOptionIndex : undefined,
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="border-b border-border pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{row.subjectName || "Online test"}</p>
        <h1 className="mt-2 text-3xl font-display font-bold text-brand-950">{row.test.title}</h1>
        <p className="mt-1 text-stone-500">{isFinished ? "Review your answers and score." : "Answer all questions before submitting."}</p>
      </div>

      <StudentTestTaker
        onlineTestId={row.onlineTest.id}
        title={row.test.title}
        durationMinutes={row.onlineTest.durationMinutes}
        mode={row.onlineTest.mode}
        questions={questions}
        isReviewing={!!isFinished}
        answers={(submission?.answers as Record<string, string | number>) || {}}
        totalScore={submission?.totalScore ?? undefined}
      />
    </div>
  );
}
