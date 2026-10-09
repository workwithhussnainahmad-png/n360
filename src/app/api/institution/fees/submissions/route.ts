import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  feeInvoices,
  feePaymentSubmissions as proofs,
  students,
} from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";

const PAGE_SIZE = 20;

export const GET = requireRole(
  ["INSTITUTION", "INSTITUTION_ADMIN"],
  async (req: NextRequest, { session }) => {
    const institutionId = getTenantContext(session);
    const params = req.nextUrl.searchParams;
    const requestedPage = Number(params.get("page") || 1);
    const status = params.get("status") || "ALL";
    if (
      !Number.isSafeInteger(requestedPage) ||
      requestedPage < 1 ||
      !["ALL", "SUBMITTED", "VERIFIED", "REJECTED"].includes(status)
    ) {
      return NextResponse.json(
        { error: "Invalid page or payment status" },
        { status: 400 },
      );
    }
    const conditions = [eq(proofs.institutionId, institutionId)];
    if (status !== "ALL")
      conditions.push(
        eq(proofs.status, status as "SUBMITTED" | "VERIFIED" | "REJECTED"),
      );
    const query = (params.get("q") || "").trim().slice(0, 80);
    if (query) {
      const pattern = `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      conditions.push(
        or(
          ilike(students.name, pattern),
          ilike(students.loginRollNumber, pattern),
          ilike(proofs.transactionId, pattern),
          sql`cast(${proofs.invoiceId} as text) ilike ${pattern}`,
        )!,
      );
    }
    const invoiceJoin = and(
      eq(proofs.invoiceId, feeInvoices.id),
      eq(feeInvoices.institutionId, institutionId),
    );
    const studentJoin = and(
      eq(proofs.studentId, students.id),
      eq(students.institutionId, institutionId),
      eq(feeInvoices.studentId, students.id),
    );
    const [{ total }] = await db
      .select({ total: count() })
      .from(proofs)
      .innerJoin(feeInvoices, invoiceJoin)
      .innerJoin(students, studentJoin)
      .where(and(...conditions));
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const records = await db
      .select({
        id: proofs.id,
        invoiceId: proofs.invoiceId,
        studentName: students.name,
        rollNumber: students.loginRollNumber,
        billingMonth: feeInvoices.billingMonth,
        amount: proofs.amount,
        sourceBankName: proofs.sourceBankName,
        transactionId: proofs.transactionId,
        paymentAccount: proofs.paymentAccount,
        status: proofs.status,
        reviewerNote: proofs.reviewerNote,
        submittedAt: proofs.submittedAt,
        verifiedAt: proofs.verifiedAt,
      })
      .from(proofs)
      .innerJoin(feeInvoices, invoiceJoin)
      .innerJoin(students, studentJoin)
      .where(and(...conditions))
      .orderBy(desc(proofs.submittedAt), desc(proofs.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    return NextResponse.json(
      { records, total, page, pageSize: PAGE_SIZE, totalPages },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
