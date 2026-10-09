import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { feeInvoices, feeInvoiceItems, feePayments, feePaymentSubmissions } from "@/db/schema";
import { getPaymentAccounts } from "@/lib/manual-payment-accounts";
import { pagination, positiveInteger } from "@/lib/pagination";

// Callers must obtain a fresh, authorized student/parent context before invoking.
export async function getStudentFeeAccount(institutionId: number, studentId: number, activePage = 1, paidPage = 1) {
  const owned = and(eq(feeInvoices.institutionId, institutionId), eq(feeInvoices.studentId, studentId));
  const [totals] = await db.select({
    billed: sql<number>`COALESCE(SUM(${feeInvoices.totalAmount}), 0)`.mapWith(Number),
    paid: sql<number>`COALESCE(SUM(${feeInvoices.paidAmount}), 0)`.mapWith(Number),
    activeCount: sql<number>`COUNT(*) FILTER (WHERE ${feeInvoices.status} IN ('DUE', 'PARTIAL'))`.mapWith(Number),
    paidCount: sql<number>`COUNT(*) FILTER (WHERE ${feeInvoices.status} = 'PAID')`.mapWith(Number),
  }).from(feeInvoices).where(and(owned, ne(feeInvoices.status, "VOID")));
  const activePagination = pagination(positiveInteger(activePage), totals.activeCount, 20);
  const paidPagination = pagination(positiveInteger(paidPage), totals.paidCount, 20);
  const fields = { id: feeInvoices.id, billingMonth: feeInvoices.billingMonth, billingKind: feeInvoices.billingKind, billingLabel: feeInvoices.billingLabel,
    dueDate: feeInvoices.dueDate, status: feeInvoices.status, totalAmount: feeInvoices.totalAmount, paidAmount: feeInvoices.paidAmount };
  const list = (status: ("DUE" | "PARTIAL" | "PAID")[], paging: typeof activePagination) => db.select(fields).from(feeInvoices)
    .where(and(owned, inArray(feeInvoices.status, status)))
    .orderBy(desc(feeInvoices.billingMonth), desc(feeInvoices.createdAt), desc(feeInvoices.id)).limit(paging.pageSize).offset(paging.offset);
  const [active, paid, paymentAccounts] = await Promise.all([list(["DUE", "PARTIAL"], activePagination), list(["PAID"], paidPagination), getPaymentAccounts(institutionId)]);
  const ids = [...active, ...paid].map(row => row.id);
  const submissions = ids.length ? await db.selectDistinctOn([feePaymentSubmissions.invoiceId], {
    id: feePaymentSubmissions.id, invoiceId: feePaymentSubmissions.invoiceId, status: feePaymentSubmissions.status, reviewerNote: feePaymentSubmissions.reviewerNote,
  }).from(feePaymentSubmissions).where(and(eq(feePaymentSubmissions.institutionId, institutionId), eq(feePaymentSubmissions.studentId, studentId), inArray(feePaymentSubmissions.invoiceId, ids)))
    .orderBy(feePaymentSubmissions.invoiceId, desc(feePaymentSubmissions.submittedAt), desc(feePaymentSubmissions.id)) : [];
  return { invoices: [...active, ...paid], submissions, paymentAccounts, activePagination, paidPagination,
    summary: { billed: totals.billed, paid: totals.paid, balance: totals.billed - totals.paid } };
}
export type StudentFeeAccount = Awaited<ReturnType<typeof getStudentFeeAccount>>;

export async function getStudentFeeDetails(institutionId: number, studentId: number, invoiceId: number, page = 1) {
  const [invoice] = await db.select({ id: feeInvoices.id }).from(feeInvoices)
    .where(and(eq(feeInvoices.id, invoiceId), eq(feeInvoices.institutionId, institutionId), eq(feeInvoices.studentId, studentId))).limit(1);
  if (!invoice) return null;
  const offset = (positiveInteger(page) - 1) * 50;
  const [items, payments] = await Promise.all([
    db.select({ id: feeInvoiceItems.id, invoiceId: feeInvoiceItems.invoiceId, label: feeInvoiceItems.label, type: feeInvoiceItems.type, amount: feeInvoiceItems.amount })
      .from(feeInvoiceItems).where(eq(feeInvoiceItems.invoiceId, invoice.id)).orderBy(feeInvoiceItems.id).limit(51).offset(offset),
    db.select({ id: feePayments.id, invoiceId: feePayments.invoiceId, receiptNumber: feePayments.receiptNumber, amount: feePayments.amount, method: feePayments.method, receivedAt: feePayments.receivedAt })
      .from(feePayments).where(and(eq(feePayments.institutionId, institutionId), eq(feePayments.studentId, studentId), eq(feePayments.invoiceId, invoice.id)))
      .orderBy(desc(feePayments.receivedAt), desc(feePayments.id)).limit(51).offset(offset),
  ]);
  return { items: items.slice(0, 50), payments: payments.slice(0, 50).map(row => ({ ...row, receivedAt: row.receivedAt.toISOString() })), page: positiveInteger(page), hasMore: items.length > 50 || payments.length > 50 };
}
export type StudentFeeDetails = NonNullable<Awaited<ReturnType<typeof getStudentFeeDetails>>>;
