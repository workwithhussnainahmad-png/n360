
import { PaymentHistory } from "@/components/PaymentHistory";
import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CircleDollarSign } from "lucide-react";
import { db } from "@/db";
import { feeInvoices, feePaymentSubmissions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getParentPortalContext } from "@/lib/parent-access";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";

const money = (value: number) => `PKR ${value.toLocaleString("en-PK")}`;
export default async function ParentFeesPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const session = await getSession(); if (!session || session.role !== "PARENT") redirect("/parent-login");
  const context = await getParentPortalContext(session, (await searchParams).student); const child = context.selectedChild; if (!child) return <ParentNoChildren />;
  const invoices = await db.select().from(feeInvoices).where(and(eq(feeInvoices.institutionId, context.institutionId), eq(feeInvoices.studentId, child.id))).orderBy(desc(feeInvoices.billingMonth)).limit(24);
  const submissions = invoices.length ? await db.select().from(feePaymentSubmissions).where(and(eq(feePaymentSubmissions.institutionId, context.institutionId), inArray(feePaymentSubmissions.invoiceId, invoices.map((row) => row.id)))).orderBy(desc(feePaymentSubmissions.submittedAt)) : [];
  const latestSubmission = new Map<number, (typeof submissions)[number]>(); for (const item of submissions) if (!latestSubmission.has(item.invoiceId)) latestSubmission.set(item.invoiceId, item);
  const outstanding = invoices.filter((row) => row.status === "DUE" || row.status === "PARTIAL").reduce((sum, row) => sum + row.totalAmount - row.paidAmount, 0);
  return <div className="space-y-6"><ParentChildHeader title="Fees & payments" description="Challans, balances, payment verification and receipt history." students={context.children} selectedStudentId={child.id} path="/parent/fees" />
    <div className="grid gap-4 sm:grid-cols-3"><Metric label="Outstanding" value={money(outstanding)} /><Metric label="Open challans" value={String(invoices.filter((x) => x.status === "DUE" || x.status === "PARTIAL").length)} /><Metric label="Paid challans" value={String(invoices.filter((x) => x.status === "PAID").length)} /></div>
    <Card><CardContent className="p-0">{invoices.length === 0 ? <p className="p-10 text-center text-sm text-stone-500">No challans have been issued.</p> : <div className="divide-y divide-border">{invoices.map((invoice) => { const submission = latestSubmission.get(invoice.id); return <div key={invoice.id} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="font-semibold text-brand-950">Fee challan · {invoice.billingMonth}</p><p className="mt-1 text-xs text-stone-500">Due {invoice.dueDate}{submission ? ` · Payment ${submission.status.toLowerCase()}` : ""}</p></div><div className="sm:text-right"><p className="font-semibold">{money(invoice.totalAmount)}</p><p className="text-xs text-stone-500">Balance {money(invoice.totalAmount - invoice.paidAmount)}</p></div><Badge variant="secondary" className={invoice.status === "PAID" ? "bg-emerald-100 text-emerald-800" : undefined}>{invoice.status}</Badge></div>; })}</div>}</CardContent></Card>
    <PaymentHistory key={child.id} studentId={child.id} />
    <p className="text-xs text-stone-500">Payment submission remains available in the Student Portal so the enrolled student and guardian share one verified financial record.</p>
  </div>;
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">{label}</p>
          <div className="rounded-md bg-brand-50 p-2">
            <CircleDollarSign className="h-4 w-4 text-brand-700" />
          </div>
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold text-stone-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
