import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { db } from "@/db";
import { leaveRequests, tickets } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getParentPortalContext } from "@/lib/parent-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";
import { ParentRequestActions } from "./ParentRequestActions";

export default async function ParentRequestsPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const session = await getSession(); if (!session || session.role !== "PARENT") redirect("/parent-login");
  const context = await getParentPortalContext(session, (await searchParams).student); const child = context.selectedChild; if (!child) return <ParentNoChildren />;
  const [leaves, support] = await Promise.all([
    db.select().from(leaveRequests).where(and(eq(leaveRequests.institutionId, context.institutionId), eq(leaveRequests.userRole, "STUDENT"), eq(leaveRequests.userId, child.id))).orderBy(desc(leaveRequests.createdAt)).limit(20),
    db.select().from(tickets).where(and(eq(tickets.institutionId, context.institutionId), eq(tickets.creatorRole, "PARENT"), eq(tickets.creatorId, context.parent.id))).orderBy(desc(tickets.createdAt)).limit(20),
  ]);
  return <div className="space-y-6"><ParentChildHeader title="Requests & support" description="Submit and track student leave applications and parent helpdesk requests." students={context.children} selectedStudentId={child.id} path="/parent/requests" />
    <ParentRequestActions studentId={child.id} />
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader className="border-b border-border"><CardTitle>Student leave history</CardTitle></CardHeader><CardContent className="p-0">{leaves.length === 0 ? <Empty text="No leave requests have been submitted for this student." /> : <div className="divide-y divide-border">{leaves.map((row) => <div key={row.id} className="p-4"><div className="flex items-start justify-between gap-4"><p className="font-semibold text-brand-950">{row.startDate} to {row.endDate}</p><Status value={row.status} /></div><p className="mt-2 text-sm leading-6 text-stone-600">{row.reason}</p></div>)}</div>}</CardContent></Card>
      <Card><CardHeader className="border-b border-border"><CardTitle>Parent helpdesk history</CardTitle></CardHeader><CardContent className="p-0">{support.length === 0 ? <Empty text="No parent support requests have been recorded." /> : <div className="divide-y divide-border">{support.map((row) => <div key={row.id} className="p-4"><div className="flex items-start justify-between gap-4"><p className="font-semibold text-brand-950">{row.title}</p><Status value={row.status} /></div><p className="mt-2 line-clamp-3 text-sm leading-6 text-stone-600">{row.description}</p><p className="mt-2 text-xs text-stone-500">{new Date(row.createdAt).toLocaleDateString("en-PK")}</p></div>)}</div>}</CardContent></Card>
    </div>
  </div>;
}
function Status({ value }: { value: string }) { const good = value === "APPROVED" || value === "RESOLVED" || value === "CLOSED"; const bad = value === "REJECTED"; return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${good ? "bg-emerald-100 text-emerald-800" : bad ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{value}</span>; }
function Empty({ text }: { text: string }) { return <div className="grid min-h-44 place-items-center p-8 text-center"><div><MessagesSquare className="mx-auto h-8 w-8 text-stone-300" /><p className="mt-3 text-sm text-stone-500">{text}</p></div></div>; }
