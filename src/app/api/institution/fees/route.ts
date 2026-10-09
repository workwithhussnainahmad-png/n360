import { validationError } from '@/lib/validation-errors';
import { FeeBillingError, issueMonthlyFees, issueOneTimeFees } from "@/lib/fee-billing";
import { reviewStudentFeeProof } from '@/lib/manual-fee-submissions';
import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  classes,
  classFeeItems,
  feeHeads,
  feeInvoices,
  feePayments,
  feePaymentSubmissions,
  studentFeeAdjustments,
  students,
} from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { feeActionSchema } from "@/lib/validators/fees";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";

const PAGE_SIZE = 50;
export const GET = requireRole(
  ["INSTITUTION", "INSTITUTION_ADMIN"],
  async (req: NextRequest, { session }) => {
    const institutionId = getTenantContext(session);
    const params = req.nextUrl.searchParams;
    const page = Number(params.get("page") || 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    const billingMonth =
      params.get("month") || new Date().toISOString().slice(0, 7);
    const status = params.get("status");
    const query = (params.get("q") || "").trim().slice(0, 80);
    const includeMeta = params.get("meta") !== "0";
    const view = params.get("view") || "all";
    const requestedMonth = params.get("month");
    if (requestedMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)) {
      return NextResponse.json({ error: "Invalid billing month" }, { status: 400 });
    }
    const includeSetup = view === "all" || view === "setup" || view === "billing";
    const includeCollections =
      view === "all" || view === "collections" || view === "paid";
    const includeSummary = includeCollections && view !== "paid" && params.get("summary") !== "0";
    const includeClasses = includeMeta && (includeSetup || includeCollections);
    const classParam = params.get("classId");
    const classId = classParam ? Number(classParam) : null;
    if (classId !== null && (!Number.isSafeInteger(classId) || classId < 1)) {
      return NextResponse.json({ error: "Invalid class filter" }, { status: 400 });
    }

    const invoiceConditions = [eq(feeInvoices.institutionId, institutionId)];
    if (classId !== null) invoiceConditions.push(eq(feeInvoices.classIdAtIssue, classId));
    if (view !== "paid" || requestedMonth)
      invoiceConditions.push(eq(feeInvoices.billingMonth, billingMonth));
    if (view === "collections") invoiceConditions.push(inArray(feeInvoices.status, ["DUE", "PARTIAL"]));
    if (status && ["DUE", "PARTIAL", "PAID", "VOID"].includes(status)) {
      invoiceConditions.push(
        eq(feeInvoices.status, status as "DUE" | "PARTIAL" | "PAID" | "VOID"),
      );
    }
    if (view === "paid") invoiceConditions.push(eq(feeInvoices.status, "PAID"));
    if (query) {
      const pattern = `%${query.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      invoiceConditions.push(
        or(
          sql`lower(${students.name}) like ${pattern}`,
          sql`lower(${students.loginRollNumber}) like ${pattern}`,
          sql`lower(${students.classRollNumber}) like ${pattern}`,
        )!,
      );
    }

    const [
      classRows,
      heads,
      classItems,
      invoices,
      summaryRows,
      countRows,
    ] = await Promise.all([
      includeClasses
        ? db
            .select({ id: classes.id, name: classes.name })
            .from(classes)
            .where(
              and(
                eq(classes.institutionId, institutionId),
                isNull(classes.deletedAt),
                eq(classes.isGraduatedArchive, false),
              ),
            )
            .orderBy(asc(classes.level), asc(classes.name))
        : Promise.resolve(null),
      includeSetup && includeMeta
        ? db
            .select()
            .from(feeHeads)
            .where(eq(feeHeads.institutionId, institutionId))
            .orderBy(asc(feeHeads.name))
        : Promise.resolve(null),
      includeSetup && includeMeta
        ? db
            .select({
              id: classFeeItems.id,
              classId: classFeeItems.classId,
              feeHeadId: classFeeItems.feeHeadId,
              amount: classFeeItems.amount,
            })
            .from(classFeeItems)
            .where(eq(classFeeItems.institutionId, institutionId))
        : Promise.resolve(null),
      includeCollections
        ? db
            .select({
              id: feeInvoices.id,
              studentId: students.id,
              studentName: students.name,
              loginRollNumber: students.loginRollNumber,
              className: sql<string>`coalesce(${feeInvoices.classNameAtIssue}, 'Not recorded')`,
              sectionName: sql<string>`coalesce(${feeInvoices.sectionNameAtIssue}, '')`,
              billingMonth: feeInvoices.billingMonth,
              billingKind: feeInvoices.billingKind,
              billingLabel: feeInvoices.billingLabel,
              dueDate: feeInvoices.dueDate,
              status: feeInvoices.status,
              totalAmount: feeInvoices.totalAmount,
              paidAmount: feeInvoices.paidAmount,
              balance: sql<number>`${feeInvoices.totalAmount} - ${feeInvoices.paidAmount}`,
            })
            .from(feeInvoices)
            .innerJoin(students, and(eq(feeInvoices.studentId, students.id), eq(students.institutionId, institutionId)))
            .where(and(...invoiceConditions))
            .orderBy(...(view === "paid" ? [desc(feeInvoices.billingMonth)] : []), desc(feeInvoices.createdAt), desc(feeInvoices.id))
            .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE)
        : Promise.resolve(null),
      includeSummary
        ? db
            .select({
              invoiceCount: sql<number>`count(*)::int`,
              studentCount: sql<number>`count(distinct ${feeInvoices.studentId})::int`,
              billed: sql<number>`coalesce(sum(${feeInvoices.totalAmount}), 0)`.mapWith(Number),
              collected: sql<number>`coalesce(sum(${feeInvoices.paidAmount}), 0)`.mapWith(Number),
              outstanding: sql<number>`coalesce(sum(${feeInvoices.totalAmount} - ${feeInvoices.paidAmount}) filter (where ${feeInvoices.status} <> 'VOID'), 0)`.mapWith(Number),
              defaulters: sql<number>`count(*) filter (where ${feeInvoices.status} in ('DUE', 'PARTIAL') and ${feeInvoices.dueDate} < current_date)::int`,
            })
            .from(feeInvoices)
            .where(
              and(
                eq(feeInvoices.institutionId, institutionId),
                eq(feeInvoices.billingMonth, billingMonth),
              ),
            )
        : Promise.resolve(null),

      includeCollections ? db.select({ total: sql<number>`count(*)::int` }).from(feeInvoices)
        .innerJoin(students, and(eq(feeInvoices.studentId, students.id), eq(students.institutionId, institutionId)))
        .where(and(...invoiceConditions)) : Promise.resolve(null),
    ]);
    const invoiceIds = invoices?.map((invoice) => invoice.id) || [];
    // Issued classes remain selectable even after graduation or deletion.
    const issuedClasses = includeClasses && includeCollections
      ? await db.selectDistinctOn([feeInvoices.classIdAtIssue], {
          id: feeInvoices.classIdAtIssue,
          name: feeInvoices.classNameAtIssue,
        }).from(feeInvoices).where(and(
          eq(feeInvoices.institutionId, institutionId),
          isNotNull(feeInvoices.classIdAtIssue),
          isNotNull(feeInvoices.classNameAtIssue),
        )).orderBy(asc(feeInvoices.classIdAtIssue), desc(feeInvoices.createdAt), desc(feeInvoices.id))
      : [];
    const availableClasses = new Map((classRows || []).map(row => [row.id, row]));
    for (const row of issuedClasses) {
      if (row.id !== null && row.name !== null && !availableClasses.has(row.id)) {
        availableClasses.set(row.id, { id: row.id, name: row.name });
      }
    }
    const submissions =
      invoiceIds.length > 0
        ? await db
            .select({ id: feePaymentSubmissions.id, invoiceId: feePaymentSubmissions.invoiceId, amount: feePaymentSubmissions.amount,
              sourceBankName: feePaymentSubmissions.sourceBankName, transactionId: feePaymentSubmissions.transactionId,
              status: feePaymentSubmissions.status, reviewerNote: feePaymentSubmissions.reviewerNote,
              submittedAt: feePaymentSubmissions.submittedAt, paymentAccount: feePaymentSubmissions.paymentAccount })
            .from(feePaymentSubmissions)
            .where(
              and(
                eq(feePaymentSubmissions.institutionId, institutionId),
                inArray(feePaymentSubmissions.invoiceId, invoiceIds),
                eq(feePaymentSubmissions.status, "SUBMITTED"),
              ),
            )
            .orderBy(desc(feePaymentSubmissions.submittedAt))
        : [];

    return NextResponse.json({
      billingMonth,
      ...(includeClasses ? { classes: [...availableClasses.values()] } : {}),
      ...(includeSetup && includeMeta
        ? {
            heads,
            classItems,
          }
        : {}),
      ...(includeCollections
        ? {
            invoices,
            submissions,
            pagination: { page, pageSize: PAGE_SIZE, total: countRows?.[0]?.total || 0, pages: Math.max(1, Math.ceil((countRows?.[0]?.total || 0) / PAGE_SIZE)) },
            ...(includeSummary ? { summary: summaryRows?.[0] || { invoiceCount: 0, studentCount: 0, billed: 0, collected: 0, outstanding: 0, defaulters: 0 } } : {}),
          }
        : {}),
      pageSize: PAGE_SIZE,
    });
  },
);

export const POST = requireRole(
  ["INSTITUTION", "INSTITUTION_ADMIN"],
  async (req: NextRequest, { session }) => {
    const institutionId = getTenantContext(session);
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 },
      );
    }
    const parsed = feeActionSchema.safeParse(json);
    if (!parsed.success)
      return NextResponse.json(
        validationError(parsed.error),
        { status: 400 },
      );
    const action = parsed.data;

    try {
      if (action.action === "createHead") {
        const [head] = await db
          .insert(feeHeads)
          .values({ institutionId, name: action.name, kind: action.kind })
          .onConflictDoUpdate({
            target: [feeHeads.institutionId, feeHeads.name],
            set: { kind: action.kind, isActive: true },
            setWhere: eq(feeHeads.isActive, false),
          })
          .returning();
        if (!head) return NextResponse.json({ error: "An active fee head with this name already exists." }, { status: 409 });
        await logAudit({
          institutionId,
          actorId: session.userId,
          actorRole: session.role,
          action: "CREATE_FEE_HEAD",
          target: `Fee head ${head.id}`,
          ip: getClientIp(req),
        });
        return NextResponse.json({ head }, { status: 201 });
      }

      if (action.action === "removeHead" || action.action === "updateHeadKind") {
        const [head] = await db.update(feeHeads)
          .set(action.action === "removeHead" ? { isActive: false } : { kind: action.kind })
          .where(and(eq(feeHeads.id, action.feeHeadId), eq(feeHeads.institutionId, institutionId), eq(feeHeads.isActive, true)))
          .returning();
        if (!head) return NextResponse.json({ error: "Active fee head not found." }, { status: 404 });
        await logAudit({ institutionId, actorId: session.userId, actorRole: session.role,
          action: action.action === "removeHead" ? "REMOVE_FEE_HEAD" : "UPDATE_FEE_HEAD_KIND",
          target: `Fee head ${head.id}`, ip: getClientIp(req) });
        return NextResponse.json({ head });
      }

      if (action.action === "setClassFee") {
        const [[classRow], [headRow]] = await Promise.all([
          db
            .select({ id: classes.id })
            .from(classes)
            .where(
              and(
                eq(classes.id, action.classId),
                eq(classes.institutionId, institutionId),
              ),
            )
            .limit(1),
          db
            .select({ id: feeHeads.id })
            .from(feeHeads)
            .where(
              and(
                eq(feeHeads.id, action.feeHeadId),
                eq(feeHeads.institutionId, institutionId),
              ),
            )
            .limit(1),
        ]);
        if (!classRow || !headRow)
          return NextResponse.json(
            { error: "Class or fee head not found" },
            { status: 404 },
          );
        const [item] = await db
          .insert(classFeeItems)
          .values({
            institutionId,
            classId: action.classId,
            feeHeadId: action.feeHeadId,
            amount: action.amount,
          })
          .onConflictDoUpdate({
            target: [
              classFeeItems.institutionId,
              classFeeItems.classId,
              classFeeItems.feeHeadId,
            ],
            set: { amount: action.amount, updatedAt: new Date() },
          })
          .returning();
        return NextResponse.json({ item });
      }

      if (action.action === "addAdjustment") {
        if (action.startMonth && action.endMonth && action.endMonth < action.startMonth) return NextResponse.json({ error: "End month cannot be before start month" }, { status: 400 });
        const [student] = await db
          .select({ id: students.id })
          .from(students)
          .where(
            and(
              eq(students.id, action.studentId),
              eq(students.institutionId, institutionId),
              isNull(students.deletedAt),
            ),
          )
          .limit(1);
        if (!student)
          return NextResponse.json(
            { error: "Student not found" },
            { status: 404 },
          );
        const [adjustment] = await db
          .insert(studentFeeAdjustments)
          .values({
            institutionId,
            studentId: action.studentId,
            label: action.label,
            type: action.type,
            amount: action.amount,
            frequency: action.frequency,
            startMonth: action.startMonth,
            endMonth: action.endMonth,
          })
          .returning();
        return NextResponse.json({ adjustment }, { status: 201 });
      }
      if (action.action === "getAdjustmentsByRollNumber") {
        const [student] = await db
          .select({ id: students.id })
          .from(students)
          .where(
            and(
              eq(students.institutionId, institutionId),
              eq(students.loginRollNumber, action.rollNumber),
              isNull(students.deletedAt)
            )
          )
          .limit(1);
          
        if (!student) {
          return NextResponse.json({ error: "Student not found" }, { status: 404 });
        }
        
        const adjustments = await db
          .select()
          .from(studentFeeAdjustments)
          .where(
            and(
              eq(studentFeeAdjustments.studentId, student.id),
              eq(studentFeeAdjustments.institutionId, institutionId),
              eq(studentFeeAdjustments.isActive, true)
            )
          );
          
        return NextResponse.json({ adjustments });
      }

      if (action.action === "removeAdjustment") {
        const [updated] = await db
          .update(studentFeeAdjustments)
          .set({ isActive: false })
          .where(
            and(
              eq(studentFeeAdjustments.id, action.adjustmentId),
              eq(studentFeeAdjustments.institutionId, institutionId),
              eq(studentFeeAdjustments.isActive, true)
            )
          )
          .returning();
          
        if (!updated) {
          return NextResponse.json({ error: "Adjustment not found or already removed" }, { status: 404 });
        }
        return NextResponse.json({ adjustment: updated });
      }

      if (action.action === "generateMonth" || action.action === "previewMonth" || action.action === "issueOneTime") {
        const result = action.action === "issueOneTime"
          ? await db.transaction(tx => issueOneTimeFees(tx, institutionId, action))
          : await db.transaction(tx => issueMonthlyFees(tx, institutionId, action, action.action === "previewMonth"));
        if (action.action !== "previewMonth") await logAudit({ institutionId, actorId: session.userId, actorRole: session.role, action: "ISSUE_FEE_INVOICES", target: action.billingMonth + ": " + result.created + " invoices", ip: getClientIp(req) });
        return NextResponse.json(result);
      }

      if (action.action === "reviewStudentPayment") {
        const result = await db.transaction(tx => reviewStudentFeeProof(tx, { institutionId, submissionId: action.submissionId, status: action.status, note: action.note, reviewerId: session.userId }));
        await logAudit({
          institutionId,
          actorId: session.userId,
          actorRole: session.role,
          action: `REVIEW_STUDENT_FEE_PAYMENT_${action.status}`,
          target: `Submission ${action.submissionId}`,
          ip: getClientIp(req),
        });
        return NextResponse.json(result);
      }

      const payment = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select ${feeInvoices.id} from ${feeInvoices} where ${feeInvoices.id} = ${action.invoiceId} and ${feeInvoices.institutionId} = ${institutionId} for update`,
        );
        const [invoice] = await tx
          .select()
          .from(feeInvoices)
          .where(
            and(
              eq(feeInvoices.id, action.invoiceId),
              eq(feeInvoices.institutionId, institutionId),
            ),
          )
          .limit(1);
        if (!invoice || invoice.status === "VOID")
          throw new Error("INVOICE_NOT_FOUND");
        const balance = invoice.totalAmount - invoice.paidAmount;
        if (action.amount > balance) throw new Error("PAYMENT_EXCEEDS_BALANCE");
        const receiptNumber = `R-${action.invoiceId}-${Date.now().toString(36).toUpperCase()}`;
        const [createdPayment] = await tx
          .insert(feePayments)
          .values({
            institutionId,
            invoiceId: invoice.id,
            studentId: invoice.studentId,
            receiptNumber,
            amount: action.amount,
            method: action.method,
            reference: action.reference || null,
            notes: action.notes || null,
            recordedBy: session.userId,
          })
          .returning();
        const paidAmount = invoice.paidAmount + action.amount;
        await tx
          .update(feeInvoices)
          .set({
            paidAmount,
            status: paidAmount >= invoice.totalAmount ? "PAID" : "PARTIAL",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(feeInvoices.id, invoice.id),
              eq(feeInvoices.institutionId, institutionId),
            ),
          );
        return {
          payment: createdPayment,
          invoice: {
            id: invoice.id,
            paidAmount,
            balance: invoice.totalAmount - paidAmount,
            status:
              paidAmount >= invoice.totalAmount
                ? ("PAID" as const)
                : ("PARTIAL" as const),
          },
        };
      });
      await logAudit({
        institutionId,
        actorId: session.userId,
        actorRole: session.role,
        action: "RECORD_FEE_PAYMENT",
        target: `Receipt ${payment.payment.receiptNumber}`,
        ip: getClientIp(req),
      });
      return NextResponse.json(payment, { status: 201 });
    } catch (error) {
      if (error instanceof FeeBillingError) return NextResponse.json({ error: error.message }, { status: error.status });
      if (error instanceof Error && error.message === "INVOICE_NOT_FOUND")
        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 },
        );
      if (error instanceof Error && error.message === "PAYMENT_EXCEEDS_BALANCE")
        return NextResponse.json(
          { error: "Payment cannot be greater than the outstanding balance" },
          { status: 409 },
        );
      if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND")
        return NextResponse.json(
          { error: "Payment submission is no longer awaiting review" },
          { status: 409 },
        );
      if (
        error instanceof Error &&
        error.message === "SUBMISSION_AMOUNT_INVALID"
      )
        return NextResponse.json(
          {
            error:
              "Payment amount no longer matches the outstanding challan balance",
          },
          { status: 409 },
        );
      const dbError = error as { code?: string; cause?: { code?: string } };
      if ((dbError.code || dbError.cause?.code) === "23505")
        return NextResponse.json(
          { error: "This fee record already exists" },
          { status: 409 },
        );
      throw error;
    }
  },
);
