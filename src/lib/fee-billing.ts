import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { classes, sections, students, feeHeads, classFeeItems, studentFeeAdjustments, feeInvoices, feeInvoiceItems, feeBillingBatches } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class FeeBillingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type BillingPeriod = { billingMonth: string; dueDate: string; expectedPreviewHash?: string };
type EventBilling = BillingPeriod & { batchId: string; label: string; feeHeadId: number; classId?: number; studentIds?: number[]; amount: number };
async function billingStudents(tx: Tx, institutionId: number, selection?: { classId?: number; studentIds?: number[] }) {
  return tx.select({ id: students.id, classId: students.classId, className: classes.name, sectionId: students.sectionId, sectionName: sections.name })
    .from(students).innerJoin(classes, and(eq(classes.id, students.classId), eq(classes.institutionId, institutionId)))
    .leftJoin(sections, and(eq(sections.id, students.sectionId), eq(sections.institutionId, institutionId), eq(sections.classId, students.classId)))
    .where(and(eq(students.institutionId, institutionId), eq(students.isActive, true), eq(students.academicStatus, "ACTIVE"), isNull(students.deletedAt), isNull(classes.deletedAt), eq(classes.isGraduatedArchive, false), selection?.classId ? eq(students.classId, selection.classId) : undefined, selection?.studentIds ? inArray(students.id, selection.studentIds) : undefined))
    .orderBy(students.id);
}
function snapshot(student: Awaited<ReturnType<typeof billingStudents>>[number]) {
  return { studentId: student.id, classIdAtIssue: student.classId, classNameAtIssue: student.className, sectionIdAtIssue: student.sectionName ? student.sectionId : null, sectionNameAtIssue: student.sectionName };
}
export async function issueMonthlyFees(tx: Tx, institutionId: number, period: BillingPeriod, preview = false) {
  if (!period.dueDate.startsWith(period.billingMonth + "-")) throw new FeeBillingError("Due date must fall inside the billing month");
  // Serialize billing for this institution, including one-off adjustment consumption.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(36074, ${institutionId})`);
  const studentRows = await billingStudents(tx, institutionId);
  const heads = await tx.select().from(feeHeads).where(and(eq(feeHeads.institutionId, institutionId), eq(feeHeads.isActive, true), eq(feeHeads.kind, "RECURRING"))).orderBy(feeHeads.id);
  if (!heads.length) throw new FeeBillingError("Add an active recurring fee head in Fee structure before generating monthly challans.");
  if (!studentRows.length) throw new FeeBillingError("No active students are eligible for monthly challans.");
  const fees = await tx.select().from(classFeeItems).where(eq(classFeeItems.institutionId, institutionId));
  const adjustments = await tx.select().from(studentFeeAdjustments).where(and(eq(studentFeeAdjustments.institutionId, institutionId), eq(studentFeeAdjustments.isActive, true))).orderBy(studentFeeAdjustments.id);
  const existingRows = await tx.select({ studentId: feeInvoices.studentId }).from(feeInvoices).where(and(eq(feeInvoices.institutionId, institutionId), eq(feeInvoices.billingMonth, period.billingMonth), eq(feeInvoices.billingKey, "MONTHLY")));
  const eligibleIds = new Set(studentRows.map(row => row.id));
  const existing = new Set(existingRows.filter(row => eligibleIds.has(row.studentId)).map(row => row.studentId));
  const amounts = new Map(fees.map(row => [`${row.classId}:${row.feeHeadId}`, row.amount]));
  const byStudent = new Map<number, typeof adjustments>();
  for (const row of adjustments) byStudent.set(row.studentId, [...(byStudent.get(row.studentId) || []), row]);
  const missing = new Map<string, { classId: number; className: string; headName: string }>();
  let missingStudents = 0;
  const prepared = studentRows.filter(row => !existing.has(row.id)).flatMap(student => {
    const absent = heads.filter(head => !amounts.has(`${student.classId}:${head.id}`));
    if (absent.length) {
      missingStudents++;
      for (const head of absent) missing.set(`${student.classId}:${head.id}`, { classId: student.classId, className: student.className, headName: head.name });
      return [];
    }
    const items = heads.map(head => ({ feeHeadId: head.id as number | null, label: head.name, type: "FEE" as "FEE" | "DISCOUNT" | "CHARGE", amount: amounts.get(`${student.classId}:${head.id}`)! }));
    const eligibleAdjustments = (byStudent.get(student.id) || []).filter(row =>
      (!row.startMonth || row.startMonth <= period.billingMonth) && (!row.endMonth || row.endMonth >= period.billingMonth) && (row.frequency !== "ONCE" || row.consumedInvoiceId === null));
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const additionalAmount = eligibleAdjustments.filter(row => row.type === "CHARGE").reduce((sum, row) => sum + row.amount, 0);
    const discountAmount = Math.min(subtotal + additionalAmount, eligibleAdjustments.filter(row => row.type === "DISCOUNT").reduce((sum, row) => sum + row.amount, 0));
    let remainingDiscount = discountAmount;
    const usedOnce: number[] = [];
    for (const row of eligibleAdjustments) {
      const amount = row.type === "DISCOUNT" ? Math.min(row.amount, remainingDiscount) : row.amount;
      if (row.type === "DISCOUNT") remainingDiscount -= amount;
      if (amount > 0) {
        items.push({ feeHeadId: null, label: row.label, type: row.type, amount });
        if (row.frequency === "ONCE") usedOnce.push(row.id);
      }
    }
    const totalAmount = subtotal + additionalAmount - discountAmount;
    if (subtotal + additionalAmount > 2_000_000_000) throw new FeeBillingError("Student charges exceed the supported total; reduce the configured amounts.");
    return [{ student, items, usedOnce, subtotal, additionalAmount, discountAmount, totalAmount }];
  });
  const previewHash = createHash("sha256").update(JSON.stringify({billingMonth:period.billingMonth,dueDate:period.dueDate,prepared,existing:[...existing].sort((a,b)=>a-b),missing:[...missing.values()]})).digest("hex");
  const result = { previewHash, eligible: studentRows.length, alreadyBilled: existing.size, ready: prepared.length, missingStudents, missingAmounts: [...missing.values()], zeroTotal: prepared.filter(row => row.totalAmount === 0).length, totalAmount: prepared.reduce((sum, row) => sum + row.totalAmount, 0) };
  if (preview) return { ...result, created: 0, skipped: existing.size };
  if (missing.size) throw new FeeBillingError("Some classes are missing fee amounts. Preview billing and save an explicit amount, including 0 for free fees, before generating.", 409);
  if (period.expectedPreviewHash && period.expectedPreviewHash !== previewHash) throw new FeeBillingError("Billing details changed after the preview. Preview again before generating.", 409);
  let created = 0;
  for (let offset = 0; offset < prepared.length; offset += 500) {
    const group = prepared.slice(offset, offset + 500);
    const inserted = await tx.insert(feeInvoices).values(group.map(row => ({ institutionId, ...snapshot(row.student), billingMonth: period.billingMonth, dueDate: period.dueDate, subtotal: row.subtotal, additionalAmount: row.additionalAmount, discountAmount: row.discountAmount, totalAmount: row.totalAmount, status: row.totalAmount === 0 ? "PAID" as const : "DUE" as const }))).onConflictDoNothing().returning({ id: feeInvoices.id, studentId: feeInvoices.studentId });
    created += inserted.length;
    const invoiceIds = new Map(inserted.map(invoice => [invoice.studentId, invoice.id]));
    const items = group.flatMap(row => {
      const invoiceId = invoiceIds.get(row.student.id);
      return invoiceId ? row.items.map(item => ({ ...item, invoiceId })) : [];
    });
    for (let start = 0; start < items.length; start += 1000) await tx.insert(feeInvoiceItems).values(items.slice(start, start + 1000));
    const consumed = group.flatMap(row => {
      const invoiceId = invoiceIds.get(row.student.id);
      return invoiceId ? row.usedOnce.map(id => ({ id, invoiceId })) : [];
    });
    for (let start = 0; start < consumed.length; start += 1000) {
      const values = consumed.slice(start, start + 1000).map(row => sql`(${row.id}::integer, ${row.invoiceId}::integer)`);
      await tx.execute(sql`UPDATE ${studentFeeAdjustments} SET consumed_invoice_id = used.invoice_id
        FROM (VALUES ${sql.join(values, sql`, `)}) AS used(id, invoice_id)
        WHERE ${studentFeeAdjustments.id} = used.id AND ${studentFeeAdjustments.institutionId} = ${institutionId}
          AND ${studentFeeAdjustments.consumedInvoiceId} IS NULL`);
    }
  }
  return { ...result, created, skipped: studentRows.length - created };
}

export async function issueOneTimeFees(tx: Tx, institutionId: number, input: EventBilling) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(36074, ${institutionId})`);
  const normalized = { label: input.label, feeHeadId: input.feeHeadId, classId: input.classId ?? null, studentIds: input.studentIds ? [...new Set(input.studentIds)].sort((a,b) => a-b) : null, amount: input.amount, billingMonth: input.billingMonth, dueDate: input.dueDate };
  const requestHash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  const [batch] = await tx.select().from(feeBillingBatches).where(eq(feeBillingBatches.id, input.batchId)).limit(1);
  if (batch) {
    if (batch.institutionId !== institutionId || batch.requestHash !== requestHash) throw new FeeBillingError("This billing request was already used with different details. Start a new one-time charge.", 409);
    return { created: 0, alreadyIssued: true, batchId: batch.id };
  }
  const [head] = await tx.select().from(feeHeads).where(and(eq(feeHeads.id, input.feeHeadId), eq(feeHeads.institutionId, institutionId), eq(feeHeads.kind, "ONE_TIME"), eq(feeHeads.isActive, true))).limit(1);
  if (!head) throw new FeeBillingError("Select an active one-time fee head.");
  const recipients = await billingStudents(tx, institutionId, input);
  if (input.studentIds) {
    const selected = new Set(input.studentIds);
    if (recipients.length !== selected.size) throw new FeeBillingError("Some selected students are unavailable or outside the selected class.");
  }
  if (!recipients.length) throw new FeeBillingError("No active students match this one-time charge.");
  await tx.insert(feeBillingBatches).values({ id: input.batchId, institutionId, label: input.label, requestHash });
  for (let offset = 0; offset < recipients.length; offset += 500) {
    const inserted = await tx.insert(feeInvoices).values(recipients.slice(offset, offset + 500).map(student => ({ institutionId, ...snapshot(student), billingKey: input.batchId, billingKind: "ONE_TIME" as const, billingLabel: input.label, billingMonth: input.billingMonth, dueDate: input.dueDate, subtotal: input.amount, totalAmount: input.amount }))).returning({ id: feeInvoices.id });
    await tx.insert(feeInvoiceItems).values(inserted.map(invoice => ({ invoiceId: invoice.id, feeHeadId: head.id, label: input.label, type: "FEE" as const, amount: input.amount })));
  }
  return { created: recipients.length, alreadyIssued: false, batchId: input.batchId };
}
