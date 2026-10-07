import { formatDefaultDate } from "@/lib/date-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { marks, subjects, tests, onlineTests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { windowRange } from "@/lib/month-window";
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { FileText, Trophy } from "lucide-react";
import { redirect } from "next/navigation";

export default async function StudentMarksPage() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) redirect("/login");

  const { from, to } = windowRange(new Date(), 1);

  const rows = await db.select({
    mark: marks,
    test: tests,
    subjectName: subjects.name,
    onlineTestId: onlineTests.id,
  })
    .from(marks)
    .innerJoin(tests, eq(marks.testId, tests.id))
    .leftJoin(subjects, eq(tests.subjectId, subjects.id))
    .leftJoin(onlineTests, eq(tests.id, onlineTests.testId))
    .where(and(
      eq(marks.studentId, session.userId),
      eq(marks.institutionId, session.institutionId),
      isNotNull(tests.resultsPublishedAt),
      gte(tests.date, from),
      lte(tests.date, to),
    ))
    .orderBy(desc(marks.createdAt));

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">My Marks</h1>
        <p className="text-stone-500 mt-1">Review uploaded assessment and exam scores.</p>
      </div>

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/50">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-600" />
            Performance Report
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6 sm:p-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center">
                <Trophy className="h-8 w-8 text-brand-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-stone-800">No Grades Posted</h3>
                <p className="text-stone-500 max-w-md mx-auto mt-2">
                  There are currently no marks uploaded for your account.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map(({ mark, test, subjectName, onlineTestId }) => {
                const percentage = mark.totalMarks > 0 ? Math.round((mark.marksObtained / mark.totalMarks) * 100) : 0;
                return (
                  <div key={mark.id} className="p-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-brand-950 flex items-center gap-2">
                        {onlineTestId ? (
                          <a href={`/student/tests/${onlineTestId}`} className="hover:underline text-brand-600">
                            {test.title}
                          </a>
                        ) : (
                          test.title
                        )}
                        {onlineTestId && (
                          <span className="text-[10px] font-bold bg-brand-100 text-brand-700 px-2 py-0.5 rounded uppercase tracking-wider">
                            Online
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-stone-500">
                        {test.type} - {subjectName || "Subject"} - {formatDefaultDate(new Date(test.date))}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-lg font-bold text-brand-900">
                        {mark.marksObtained}/{mark.totalMarks}
                      </p>
                      <p className="text-xs text-stone-500">{percentage}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
