import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { marks, subjects, tests } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getParentPortalContext, ParentChildAccessError } from "@/lib/parent-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";
import { resolveParentPeriod } from "@/lib/parent-period";

const PAGE_SIZE = 20;
const FILTERS = ["ALL", "DAILY", "WEEKLY", "QUIZ", "MONTHLY", "MID", "FINAL"] as const;
const PERFORMANCE_TYPES = ["DAILY", "WEEKLY", "QUIZ", "MONTHLY"] as const;
type ResultFilter = typeof FILTERS[number];

export default async function ParentResultsPage({ searchParams }: { searchParams: Promise<{ student?: string; type?: string; page?: string; period?: string; anchor?: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "PARENT") redirect("/parent-login");
  const params = await searchParams;
  let context;
  try {
    context = await getParentPortalContext(session, params.student);
  } catch (error) {
    if (error instanceof ParentChildAccessError) notFound();
    throw error;
  }
  const child = context.selectedChild;
  if (!child) return <ParentNoChildren />;

  const filter: ResultFilter = FILTERS.includes(params.type as ResultFilter) ? params.type as ResultFilter : "ALL";
  const requestedPage = Number(params.page || "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const range = resolveParentPeriod(params.period, params.anchor);
  const filters = [eq(marks.institutionId, context.institutionId), eq(marks.studentId, child.id), isNotNull(tests.resultsPublishedAt), gte(tests.date, range.from), lte(tests.date, range.to)];
  if (filter !== "ALL") filters.push(eq(tests.type, filter));

  const [rows, totalRows, subjectPerformance] = await Promise.all([
    db.select({
      id: marks.id,
      title: tests.title,
      type: tests.type,
      date: tests.date,
      subjectName: subjects.name,
      marksObtained: marks.marksObtained,
      totalMarks: marks.totalMarks,
    })
      .from(marks)
      .innerJoin(tests, eq(marks.testId, tests.id))
      .innerJoin(subjects, eq(tests.subjectId, subjects.id))
      .where(and(...filters))
      .orderBy(desc(tests.date), desc(marks.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() })
      .from(marks)
      .innerJoin(tests, eq(marks.testId, tests.id))
      .where(and(...filters)),
    db.select({
      subjectId: subjects.id,
      subjectName: subjects.name,
      average: sql<number>`round(avg(case when ${marks.totalMarks} > 0 then (${marks.marksObtained} * 100.0 / ${marks.totalMarks}) else null end))::int`,
      highest: sql<number>`round(max(case when ${marks.totalMarks} > 0 then (${marks.marksObtained} * 100.0 / ${marks.totalMarks}) else null end))::int`,
      assessments: sql<number>`count(*)::int`,
    })
      .from(marks)
      .innerJoin(tests, eq(marks.testId, tests.id))
      .innerJoin(subjects, eq(tests.subjectId, subjects.id))
      .where(and(
        eq(marks.institutionId, context.institutionId),
        eq(marks.studentId, child.id),
        isNotNull(tests.resultsPublishedAt),
        inArray(tests.type, [...PERFORMANCE_TYPES]),
        gte(tests.date, range.from),
        lte(tests.date, range.to),
      ))
      .groupBy(subjects.id, subjects.name)
      .orderBy(subjects.name),
  ]);

  const total = Number(totalRows[0]?.value || 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages && total > 0) notFound();

  return (
    <div className="space-y-6">
      <ParentChildHeader title="Academic results" description={`Published test results and subject trends for ${child.name}.`} students={context.children} selectedStudentId={child.id} path="/parent/results" />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => <Link key={item} href={`/parent/results?student=${child.id}&period=${range.period}&anchor=${range.anchor}&type=${item}`} className={`rounded-sm border px-3 py-2 text-xs font-bold uppercase tracking-wide ${filter === item ? "border-brand-800 bg-brand-800 text-white" : "border-stone-300 bg-white text-stone-600 hover:border-brand-500"}`}>{item === "ALL" ? "All results" : item}</Link>)}
      </div>

      <Card>
        <CardHeader className="border-b border-border"><CardTitle>Subject performance</CardTitle></CardHeader>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {subjectPerformance.length === 0 ? <p className="text-sm text-stone-500">No daily, weekly, quiz or monthly results are available.</p> : subjectPerformance.map((subject) => {
            const average = Number(subject.average || 0);
            return <div key={subject.subjectId} className="rounded-sm border border-stone-200 bg-stone-50 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-brand-950">{subject.subjectName}</p><p className="mt-1 text-xs text-stone-500">{subject.assessments} assessments · best {subject.highest || 0}%</p></div><p className="font-display text-2xl font-bold text-brand-900">{average}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-brand-700" style={{ width: `${Math.max(0, Math.min(100, average))}%` }} /></div></div>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border"><CardTitle>Result history</CardTitle><span className="text-sm text-stone-500">{total} records</span></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? <p className="px-6 py-12 text-center text-sm text-stone-500">No results match this filter.</p> : <div className="divide-y divide-border">{rows.map((row) => {
            const percentage = row.totalMarks > 0 ? Math.round((row.marksObtained / row.totalMarks) * 100) : 0;
            return <div key={row.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-5"><div><p className="font-semibold text-brand-950">{row.title}</p><p className="mt-1 text-xs text-stone-500">{row.subjectName} · {row.type} · {new Date(`${row.date}T00:00:00`).toLocaleDateString("en-PK")}</p></div><p className="text-sm font-semibold text-brand-900">{row.marksObtained}/{row.totalMarks}</p><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${percentage >= 80 ? "bg-emerald-100 text-emerald-800" : percentage >= 60 ? "bg-brand-100 text-brand-800" : percentage >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{percentage}%</span></div>;
          })}</div>}
        </CardContent>
      </Card>

      {totalPages > 1 && <div className="flex items-center justify-between"><Link aria-disabled={page <= 1} className={`rounded-sm border px-3 py-2 text-sm font-medium ${page <= 1 ? "pointer-events-none opacity-40" : "bg-white hover:bg-stone-50"}`} href={`/parent/results?student=${child.id}&period=${range.period}&anchor=${range.anchor}&type=${filter}&page=${page - 1}`}>← Previous</Link><span className="text-sm text-stone-500">Page {page} of {totalPages}</span><Link aria-disabled={page >= totalPages} className={`rounded-sm border px-3 py-2 text-sm font-medium ${page >= totalPages ? "pointer-events-none opacity-40" : "bg-white hover:bg-stone-50"}`} href={`/parent/results?student=${child.id}&period=${range.period}&anchor=${range.anchor}&type=${filter}&page=${page + 1}`}>Next →</Link></div>}
    </div>
  );
}
