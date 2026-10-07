import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  classes,
  classFeeItems,
  feeHeads,
  feeInvoiceItems,
  feeInvoices,
  feePayments,
  feePaymentSubmissions,
  institutions,
  sections,
  studentFeeAdjustments,
  students,
} from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { feeActionSchema } from "@/lib/validators/fees";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";

const PAGE_SIZE = 50;
const INSERT_CHUNK = 1_000;

function chunks<T>(rows: T[], size = INSERT_CHUNK) {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size)
    result.push(rows.slice(index, index + size));
  return result;
}

export const GET = requireRole(
  ["INSTITUTION", "INSTITUTION_ADMIN"],
  async (req: NextRequest, { session }) => {
    const institutionId = getTenantContext(session);
    const params = req.nextUrl.searchParams;
    const billingMonth =
      params.get("month") || new Date().toISOString().slice(0, 7);
    const status = params.get("status");
    const query = (params.get("q") || "").trim().slice(0, 80);
    const includeMeta = params.get("meta") !== "0";
    const view = params.get("view") || "all";
    const includeSetup = view === "all" || view === "setup";
    const includeCollections =
      view === "all" || view === "collections" || view === "paid";

    const invoiceConditions = [eq(feeInvoices.institutionId, institutionId)];
    if (view !== "paid")
      invoiceConditions.push(eq(feeInvoices.billingMonth, billingMonth));
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
    ] = await Promise.all([
      includeSetup && includeMeta
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
              className: classes.name,
              sectionName: sections.name,
              billingMonth: feeInvoices.billingMonth,
              dueDate: feeInvoices.dueDate,
              status: feeInvoices.status,
              totalAmount: feeInvoices.totalAmount,
              paidAmount: feeInvoices.paidAmount,
              balance: sql<number>`${feeInvoices.totalAmount} - ${feeInvoices.paidAmount}`,
            })
            .from(feeInvoices)
            .innerJoin(students, eq(feeInvoices.studentId, students.id))
            .innerJoin(classes, eq(students.classId, classes.id))
            .innerJoin(sections, eq(students.sectionId, sections.id))
            .where(and(...invoiceConditions))
            .orderBy(desc(feeInvoices.createdAt))
            .limit(PAGE_SIZE)
        : Promise.resolve(null),
      includeCollections
        ? db
            .select({
              invoiceCount: sql<number>`count(*)::int`,
              billed: sql<number>`coalesce(sum(${feeInvoices.totalAmount}), 0)::int`,
              collected: sql<number>`coalesce(sum(${feeInvoices.paidAmount}), 0)::int`,
              outstanding: sql<number>`coalesce(sum(${feeInvoices.totalAmount} - ${feeInvoices.paidAmount}) filter (where ${feeInvoices.status} <> 'VOID'), 0)::int`,
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

    ]);
    const invoiceIds = invoices?.map((invoice) => invoice.id) || [];
    const submissions =
      invoiceIds.length > 0
        ? await db
            .select()
            .from(feePaymentSubmissions)
            .where(
              and(
                eq(feePaymentSubmissions.institutionId, institutionId),
                inArray(feePaymentSubmissions.invoiceId, invoiceIds),
              ),
            )
            .orderBy(desc(feePaymentSubmissions.submittedAt))
        : [];

    return NextResponse.json({
      billingMonth,
      ...(includeSetup && includeMeta
        ? {
            classes: classRows,
            heads,
            classItems,
          }
        : {}),
      ...(includeCollections
        ? {
            invoices,
            submissions,
            summary: summaryRows?.[0] || {
              invoiceCount: 0,
              billed: 0,
              collected: 0,
              outstanding: 0,
              defaulters: 0,
            },
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
        { error: parsed.error.issues[0]?.message || "Invalid fee request" },
        { status: 400 },
      );
    const action = parsed.data;

    try {
      if (action.action === "createHead") {
        const [head] = await db
          .insert(feeHeads)
          .values({ institutionId, name: action.name, kind: action.kind })
          .returning();
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

      if (action.action === "generateMonth") {
        if (!action.dueDate.startsWith(`${action.billingMonth}-`)) {
          return NextResponse.json(
            { error: "Due date must fall inside the billing month" },
            { status: 400 },
          );
        }
        const [studentRows, feeRows, adjustmentRows, existingRows, allRecurringHeads] =
          await Promise.all([
            db
              .select({ id: students.id, classId: students.classId })
              .from(students)
              .where(
                and(
                  eq(students.institutionId, institutionId),
                  eq(students.isActive, true),
                  eq(students.academicStatus, "ACTIVE"),
                  isNull(students.deletedAt),
                ),
              ),
            db
              .select({
                classId: classFeeItems.classId,
                feeHeadId: feeHeads.id,
                label: feeHeads.name,
                amount: classFeeItems.amount,
              })
              .from(classFeeItems)
              .innerJoin(feeHeads, eq(classFeeItems.feeHeadId, feeHeads.id))
              .where(
                and(
                  eq(classFeeItems.institutionId, institutionId),
                  eq(feeHeads.isActive, true),
                  eq(feeHeads.kind, "RECURRING"),
                ),
              ),
            db
              .select()
              .from(studentFeeAdjustments)
              .where(
                and(
                  eq(studentFeeAdjustments.institutionId, institutionId),
                  eq(studentFeeAdjustments.isActive, true),
                ),
              ),
            db
              .select({ studentId: feeInvoices.studentId })
              .from(feeInvoices)
              .where(
                and(
                  eq(feeInvoices.institutionId, institutionId),
                  eq(feeInvoices.billingMonth, action.billingMonth),
                ),
              ),
            db
              .select({
                feeHeadId: feeHeads.id,
                label: feeHeads.name,
              })
              .from(feeHeads)
              .where(
                and(
                  eq(feeHeads.institutionId, institutionId),
                  eq(feeHeads.isActive, true),
                  eq(feeHeads.kind, "RECURRING"),
                ),
              ),
          ]);
        const existing = new Set(existingRows.map((row) => row.studentId));
        const feesByClass = new Map<number, typeof feeRows>();
        for (const fee of feeRows)
          feesByClass.set(fee.classId, [
            ...(feesByClass.get(fee.classId) || []),
            fee,
          ]);
        const adjustmentsByStudent = new Map<number, typeof adjustmentRows>();
        for (const adjustment of adjustmentRows)
          adjustmentsByStudent.set(adjustment.studentId, [
            ...(adjustmentsByStudent.get(adjustment.studentId) || []),
            adjustment,
          ]);

        const prepared = studentRows.flatMap((student) => {
          if (existing.has(student.id)) return [];
          const classFees = feesByClass.get(student.classId) || [];

          const fees = allRecurringHeads.map((head) => {
            const existingFee = classFees.find(
              (f) => f.feeHeadId === head.feeHeadId,
            );
            return {
              feeHeadId: head.feeHeadId,
              label: head.label,
              amount: existingFee ? existingFee.amount : 0,
            };
          });

          if (fees.length === 0) return [];
          const adjustments = adjustmentsByStudent.get(student.id) || [];
          const subtotal = fees.reduce((sum, row) => sum + row.amount, 0);
          const additionalAmount = adjustments
            .filter((row) => row.type === "CHARGE")
            .reduce((sum, row) => sum + row.amount, 0);
          const rawDiscount = adjustments
            .filter((row) => row.type === "DISCOUNT")
            .reduce((sum, row) => sum + row.amount, 0);
          const discountAmount = Math.min(
            rawDiscount,
            subtotal + additionalAmount,
          );
          return [
            {
              student,
              fees,
              adjustments,
              subtotal,
              additionalAmount,
              discountAmount,
              totalAmount: subtotal + additionalAmount - discountAmount,
            },
          ];
        });

        let created = 0;
        await db.transaction(async (tx) => {
          for (const group of chunks(prepared, 500)) {
            const inserted = await tx
              .insert(feeInvoices)
              .values(
                group.map((row) => ({
                  institutionId,
                  studentId: row.student.id,
                  billingMonth: action.billingMonth,
                  dueDate: action.dueDate,
                  subtotal: row.subtotal,
                  discountAmount: row.discountAmount,
                  additionalAmount: row.additionalAmount,
                  totalAmount: row.totalAmount,
                })),
              )
              .onConflictDoNothing()
              .returning({
                id: feeInvoices.id,
                studentId: feeInvoices.studentId,
              });
            created += inserted.length;
            const insertedByStudent = new Map(
              inserted.map((row) => [row.studentId, row.id]),
            );
            const itemValues = group.flatMap((row) => {
              const invoiceId = insertedByStudent.get(row.student.id);
              if (!invoiceId) return [];
              const feeItems = row.fees.map((fee) => ({
                invoiceId,
                feeHeadId: fee.feeHeadId,
                label: fee.label,
                type: "FEE" as const,
                amount: fee.amount,
              }));
              let remainingDiscount = row.discountAmount;
              const adjustmentItems = row.adjustments.flatMap((item) => {
                const amount =
                  item.type === "DISCOUNT"
                    ? Math.min(item.amount, remainingDiscount)
                    : item.amount;
                if (item.type === "DISCOUNT") remainingDiscount -= amount;
                return amount > 0
                  ? [
                      {
                        invoiceId,
                        feeHeadId: null,
                        label: item.label,
                        type: item.type,
                        amount,
                      },
                    ]
                  : [];
              });
              return [...feeItems, ...adjustmentItems];
            });
            for (const itemChunk of chunks(itemValues))
              await tx.insert(feeInvoiceItems).values(itemChunk);
          }
        });
        await logAudit({
          institutionId,
          actorId: session.userId,
          actorRole: session.role,
          action: "GENERATE_FEE_INVOICES",
          target: `${action.billingMonth}: ${created} invoices`,
          ip: getClientIp(req),
        });
        return NextResponse.json({
          created,
          skipped: studentRows.length - created,
        });
      }

      if (action.action === "reviewStudentPayment") {
        const result = await db.transaction(async (tx) => {
          await tx.execute(
            sql`select ${feePaymentSubmissions.id} from ${feePaymentSubmissions} where ${feePaymentSubmissions.id} = ${action.submissionId} and ${feePaymentSubmissions.institutionId} = ${institutionId} for update`,
          );
          const [submission] = await tx
            .select()
            .from(feePaymentSubmissions)
            .where(
              and(
                eq(feePaymentSubmissions.id, action.submissionId),
                eq(feePaymentSubmissions.institutionId, institutionId),
              ),
            )
            .limit(1);
          if (!submission || submission.status !== "SUBMITTED")
            throw new Error("SUBMISSION_NOT_FOUND");
          if (action.status === "REJECTED") {
            await tx
              .update(feePaymentSubmissions)
              .set({
                status: "REJECTED",
                reviewerNote: action.note,
                updatedAt: new Date(),
              })
              .where(eq(feePaymentSubmissions.id, submission.id));
            return { status: "REJECTED" as const };
          }
          await tx.execute(
            sql`select ${feeInvoices.id} from ${feeInvoices} where ${feeInvoices.id} = ${submission.invoiceId} and ${feeInvoices.institutionId} = ${institutionId} for update`,
          );
          const [invoice] = await tx
            .select()
            .from(feeInvoices)
            .where(
              and(
                eq(feeInvoices.id, submission.invoiceId),
                eq(feeInvoices.institutionId, institutionId),
              ),
            )
            .limit(1);
          if (
            !invoice ||
            invoice.status === "VOID" ||
            submission.amount > invoice.totalAmount - invoice.paidAmount
          )
            throw new Error("SUBMISSION_AMOUNT_INVALID");
          const receiptNumber = `R-${invoice.id}-${Date.now().toString(36).toUpperCase()}`;
          const [payment] = await tx
            .insert(feePayments)
            .values({
              institutionId,
              invoiceId: invoice.id,
              studentId: invoice.studentId,
              receiptNumber,
              amount: submission.amount,
              method: "BANK",
              reference: submission.transactionId,
              notes: `Source: ${submission.sourceBankName}`,
              recordedBy: session.userId,
            })
            .returning();
          const paidAmount = invoice.paidAmount + submission.amount;
          await tx
            .update(feeInvoices)
            .set({
              paidAmount,
              status: paidAmount >= invoice.totalAmount ? "PAID" : "PARTIAL",
              updatedAt: new Date(),
            })
            .where(eq(feeInvoices.id, invoice.id));
          await tx
            .update(feePaymentSubmissions)
            .set({
              status: "VERIFIED",
              reviewerNote: action.note || null,
              verifiedBy: session.userId,
              verifiedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(feePaymentSubmissions.id, submission.id));
          return { status: "VERIFIED" as const, payment };
        });
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
