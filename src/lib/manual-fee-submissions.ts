import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { feeInvoices, feePaymentSubmissions, feePayments } from '@/db/schema';
import { assertPaymentReferenceUnused, resolvePaymentAccount } from './manual-payment-accounts';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function submitStudentFeeProof(tx: Transaction, input: {
  institutionId: number; studentId: number; invoiceId: number; amount: number;
  paymentAccountId: string; transactionId: string; sourceBankName: string; proofFileKey: string;
  submittedByRole: string; submittedById: number;
}) {
  const [invoice] = await tx.select().from(feeInvoices).where(and(eq(feeInvoices.id, input.invoiceId),
    eq(feeInvoices.institutionId, input.institutionId), eq(feeInvoices.studentId, input.studentId))).limit(1).for('update');
  if (!invoice || !['DUE', 'PARTIAL'].includes(invoice.status)) throw new Error('INVOICE_NOT_PAYABLE');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > invoice.totalAmount - invoice.paidAmount) throw new Error('PAYMENT_EXCEEDS_BALANCE');
  const paymentAccount = await resolvePaymentAccount(tx, input.institutionId, input.paymentAccountId);
  await assertPaymentReferenceUnused(tx, input.institutionId, paymentAccount.id, input.transactionId);
  const [submission] = await tx.insert(feePaymentSubmissions).values({ institutionId: input.institutionId,
    invoiceId: input.invoiceId, studentId: input.studentId, amount: input.amount, paymentAccount,
    transactionId: input.transactionId, sourceBankName: input.sourceBankName, proofFileKey: input.proofFileKey,
    submittedByRole: input.submittedByRole, submittedById: input.submittedById }).returning();
  return submission;
}

export async function reviewStudentFeeProof(tx: Transaction, input: { institutionId: number; submissionId: number; status: "VERIFIED" | "REJECTED"; note?: string; reviewerId: number }) {
  await tx.execute(
    sql`select ${feePaymentSubmissions.id} from ${feePaymentSubmissions} where ${feePaymentSubmissions.id} = ${input.submissionId} and ${feePaymentSubmissions.institutionId} = ${input.institutionId} for update`,
  );
  const [submission] = await tx
    .select()
    .from(feePaymentSubmissions)
    .where(
      and(
        eq(feePaymentSubmissions.id, input.submissionId),
        eq(feePaymentSubmissions.institutionId, input.institutionId),
      ),
    )
    .limit(1);
  if (!submission || submission.status !== "SUBMITTED")
    throw new Error("SUBMISSION_NOT_FOUND");
  if (input.status === "REJECTED") {
    await tx
      .update(feePaymentSubmissions)
      .set({
        status: "REJECTED",
        reviewerNote: input.note,
        updatedAt: new Date(),
      })
      .where(eq(feePaymentSubmissions.id, submission.id));
    return { status: "REJECTED" as const };
  }
  await tx.execute(
    sql`select ${feeInvoices.id} from ${feeInvoices} where ${feeInvoices.id} = ${submission.invoiceId} and ${feeInvoices.institutionId} = ${input.institutionId} for update`,
  );
  const [invoice] = await tx
    .select()
    .from(feeInvoices)
    .where(
      and(
        eq(feeInvoices.id, submission.invoiceId),
        eq(feeInvoices.institutionId, input.institutionId),
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
      institutionId: input.institutionId,
      invoiceId: invoice.id,
      studentId: invoice.studentId,
      receiptNumber,
      amount: submission.amount,
      method: "BANK",
      reference: submission.transactionId,
      notes: `Source: ${submission.sourceBankName}`,
      recordedBy: input.reviewerId,
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
      reviewerNote: input.note || null,
      verifiedBy: input.reviewerId,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(feePaymentSubmissions.id, submission.id));
  return { status: "VERIFIED" as const, payment };

}
