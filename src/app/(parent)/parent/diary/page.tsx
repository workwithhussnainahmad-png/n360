import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { redirect } from "next/navigation";
import { BookOpen, CalendarDays } from "lucide-react";
import { db } from "@/db";
import { assignments, diaries, staff, subjects } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getParentPortalContext } from "@/lib/parent-access";
import { Card, CardContent } from "@/components/ui/card";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";
import { resolveParentPeriod } from "@/lib/parent-period";

export default async function ParentDiaryPage({ searchParams }: { searchParams: Promise<{ student?: string; period?: string; anchor?: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "PARENT") redirect("/parent-login");
  const params = await searchParams;
  const context = await getParentPortalContext(session, params.student);
  const child = context.selectedChild;
  if (!child) return <ParentNoChildren />;
  const range = resolveParentPeriod(params.period, params.anchor);
  const [rows, homework] = await Promise.all([
    db.select({ id: diaries.id, date: diaries.date, content: diaries.content, subject: subjects.name, teacher: staff.name })
      .from(diaries).leftJoin(subjects, eq(diaries.subjectId, subjects.id)).innerJoin(staff, eq(diaries.staffId, staff.id))
      .where(and(eq(diaries.institutionId, context.institutionId), eq(diaries.classId, child.classId), gte(diaries.date, range.from), lte(diaries.date, range.to)))
      .orderBy(desc(diaries.date), desc(diaries.id)).limit(40),
    db.select({ id: assignments.id, title: assignments.title, description: assignments.description, dueAt: assignments.dueAt, subject: subjects.name, teacher: staff.name, fileName: assignments.referenceFileName })
      .from(assignments).leftJoin(subjects, eq(assignments.subjectId, subjects.id)).innerJoin(staff, eq(assignments.staffId, staff.id))
      .where(and(eq(assignments.institutionId, context.institutionId), eq(assignments.classId, child.classId), or(eq(assignments.sectionId, child.sectionId), isNull(assignments.sectionId)), gte(assignments.dueAt, new Date(`${range.from}T00:00:00Z`)), lte(assignments.dueAt, new Date(`${range.to}T23:59:59Z`))))
      .orderBy(asc(assignments.dueAt)).limit(20),
  ]);
  return <div className="space-y-6"><ParentChildHeader title="Diary & homework" description="Recent classwork, homework and teacher instructions." students={context.children} selectedStudentId={child.id} path="/parent/diary" />
    <section><h2 className="mb-3 text-lg font-bold text-brand-950">Upcoming homework</h2>{homework.length === 0 ? <Card><CardContent className="p-6 text-sm text-stone-500">No upcoming assignments.</CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{homework.map((item) => <Card key={item.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-brand-950">{item.title}</p><p className="mt-1 text-xs text-stone-500">{item.subject || "General"} · {item.teacher}</p></div><span className="shrink-0 text-xs font-semibold text-brand-800">Due {item.dueAt.toLocaleDateString("en-PK")}</span></div>{item.description && <p className="mt-3 text-sm leading-6 text-stone-700">{item.description}</p>}{item.fileName && <p className="mt-2 text-xs text-stone-500">Attachment: {item.fileName}</p>}</CardContent></Card>)}</div>}</section>
    <section><h2 className="mb-3 text-lg font-bold text-brand-950">Class diary</h2>{rows.length === 0 ? <Empty text="No diary entries are available for this period." /> : <div className="grid gap-4 lg:grid-cols-2">{rows.map((row) => <Card key={row.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-brand-950">{row.subject || "General class diary"}</p><p className="mt-1 text-xs text-stone-500">{row.teacher}</p></div><span className="flex items-center gap-1 text-xs text-stone-500"><CalendarDays className="h-4 w-4" />{row.date}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-stone-700">{row.content}</p></CardContent></Card>)}</div>}</section>
  </div>;
}
function Empty({ text }: { text: string }) { return <Card><CardContent className="grid min-h-44 place-items-center p-8 text-center"><div><BookOpen className="mx-auto h-8 w-8 text-stone-300" /><p className="mt-3 text-sm text-stone-500">{text}</p></div></CardContent></Card>; }
