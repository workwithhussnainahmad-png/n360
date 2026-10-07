import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { getParentPortalContext } from "@/lib/parent-access";
import { Card, CardContent } from "@/components/ui/card";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";
import { pakistanDateKey, resolveParentPeriod } from "@/lib/parent-period";

export default async function ParentAnnouncementsPage({ searchParams }: { searchParams: Promise<{ student?: string; period?: string; anchor?: string }> }) {
  const session = await getSession(); if (!session || session.role !== "PARENT") redirect("/parent-login");
  const params = await searchParams;
  const context = await getParentPortalContext(session, params.student); const child = context.selectedChild; if (!child) return <ParentNoChildren />;
  const period = resolveParentPeriod(params.period, params.anchor);
  const visibleRows = await getVisibleAnnouncements({ ...session, role: "STUDENT", userId: child.id }, 30, { campusId: child.campusId, classId: child.classId, sectionId: child.sectionId, createdAt: child.createdAt }, { includeReadStatus: false });
  const rows = visibleRows.filter((item) => pakistanDateKey(item.createdAtIso) >= period.from && pakistanDateKey(item.createdAtIso) <= period.to);
  return <div className="space-y-6"><ParentChildHeader title="Notices & announcements" description="Institution, campus and class updates relevant to this student." students={context.children} selectedStudentId={child.id} path="/parent/announcements" />
    {rows.length === 0 ? <Card><CardContent className="grid min-h-52 place-items-center p-8 text-center"><div><Megaphone className="mx-auto h-9 w-9 text-stone-300" /><p className="mt-3 text-sm text-stone-500">No announcements are available.</p></div></CardContent></Card> : <div className="space-y-4">{rows.map((row) => <Card key={row.id}><CardContent className="p-5"><div className="flex flex-col justify-between gap-2 sm:flex-row"><h2 className="font-bold text-brand-950">{row.title}</h2><time className="shrink-0 text-xs text-stone-500">{new Date(row.createdAtIso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{row.content}</p></CardContent></Card>)}</div>}
  </div>;
}
