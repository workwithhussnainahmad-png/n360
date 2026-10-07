import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gatewayPaymentAttempts as attempts } from "@/db/schema";
import { paymentAccess, publicPaymentFields } from "@/lib/payments/access";

export async function GET(req: NextRequest) {
  const access = await paymentAccess(req);
  if (!access) return NextResponse.json({ error: "Sign in to view payment history" }, { status: 401 });
  const filters = [access];
  for (const key of ["invoiceId", "applicationId"] as const) {
    const value = req.nextUrl.searchParams.get(key);
    if (value !== null) {
      const id = Number(value);
      if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid payment filter" }, { status: 400 });
      filters.push(eq(attempts[key], id));
    }
  }
  const cursor = req.nextUrl.searchParams.get("before");
  const student = req.nextUrl.searchParams.get("studentId");
  if (student !== null) {
    const id = Number(student);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid student" }, { status: 400 });
    filters.push(sql`(exists (select 1 from fee_invoices fi where fi.id = ${attempts.invoiceId} and fi.institution_id = ${attempts.institutionId} and fi.student_id = ${id})
      or exists (select 1 from admission_enrollments ae where ae.application_id = ${attempts.applicationId} and ae.institution_id = ${attempts.institutionId} and ae.student_id = ${id}))`);
  }
  if (cursor) {
    const [date, id] = cursor.split("|");
    if (!date || Number.isNaN(Date.parse(date)) || !/^[A-Za-z0-9]{1,20}$/.test(id || "")) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    filters.push(sql`(${attempts.createdAt}, ${attempts.id}) < (${date}::timestamp, ${id})`);
  }
  const rows = await db.select(publicPaymentFields).from(attempts).where(and(...filters)).orderBy(desc(attempts.createdAt), desc(attempts.id)).limit(51);
  const payments = rows.slice(0, 50); const last = payments.at(-1);
  return NextResponse.json({ payments, next: rows.length > 50 && last ? `${last.createdAt.toISOString()}|${last.id}` : null }, { headers: { "Cache-Control": "no-store" } });
}
