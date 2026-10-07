import Link from "next/link";
import { Clock, FileQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { onlineTestSubmissions, onlineTests, students, subjects, tests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { studentPlacementColumns } from "@/lib/student-columns";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

export default async function StudentTestsPage() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) redirect("/login");

  const [student] = await db
    .select(studentPlacementColumns)
    .from(students)
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)))
    .limit(1);
  if (!student) redirect("/login");

  const rows = await db.select({
    onlineTest: {
      id: onlineTests.id,
      mode: onlineTests.mode,
      durationMinutes: onlineTests.durationMinutes,
    },
    test: {
      title: tests.title,
      maxMarks: tests.maxMarks,
    },
    subjectName: subjects.name,
  })
    .from(onlineTests)
    .innerJoin(tests, eq(onlineTests.testId, tests.id))
    .leftJoin(subjects, eq(tests.subjectId, subjects.id))
    .leftJoin(onlineTestSubmissions, and(
      eq(onlineTestSubmissions.onlineTestId, onlineTests.id),
      eq(onlineTestSubmissions.institutionId, session.institutionId),
      eq(onlineTestSubmissions.studentId, session.userId)
    ))
    .where(and(
      eq(onlineTests.institutionId, session.institutionId),
      eq(tests.classId, student.classId),
      eq(tests.sectionId, student.sectionId),
      isNull(onlineTestSubmissions.id),
      sql`${onlineTests.createdAt} + ${onlineTests.durationMinutes} * interval '1 minute' > now()`
    ))
    .orderBy(desc(onlineTests.createdAt), desc(onlineTests.id))
    .limit(50);

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="border-b border-border pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Online tests</p>
        <h1 className="mt-2 text-3xl font-display font-bold text-brand-950">My Tests</h1>
        <p className="mt-1 text-stone-500">Start hosted tests from your teachers and submit answers before the timer ends.</p>
      </div>

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/70">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileQuestion className="h-5 w-5 text-brand-700" />
            Available Tests
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-4 sm:p-8 text-sm text-stone-500">No online tests are available for your class right now.</p>
          ) : (
            <div className="divide-y divide-border">
              {rows.map(({ onlineTest, test, subjectName }) => (
                  <div key={onlineTest.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <h3 className="font-semibold text-brand-950">{test.title}</h3>
                      <p className="text-sm text-stone-500">{onlineTest.mode} - {subjectName || "Subject"} - {test.maxMarks} marks</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-stone-500">
                        <Clock className="h-3.5 w-3.5" />
                        {onlineTest.durationMinutes} minutes
                      </p>
                    </div>
                    <Link href={`/student/tests/${onlineTest.id}`} prefetch={false} className="rounded-md bg-brand-900 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-800">
                      Start
                    </Link>
                  </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
