import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { admissionApplications, admissionFeePayments, admissionFeeProofs } from '@/db/schema';
import { resolvePaymentAccount, assertPaymentReferenceUnused } from './manual-payment-accounts';
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function submitAdmissionFeeProof(tx: Transaction, input: { institutionId: number; applicationId: number; paymentId: number; expectedStatus: string; paymentAccountId: string; transactionId: string; sourceBankName: string; proofFileKey: string }) {
    const [current] = await tx.select({ status: admissionApplications.status }).from(admissionApplications)
      .where(and(eq(admissionApplications.id, input.applicationId), eq(admissionApplications.institutionId, input.institutionId))).for("update");
    if (!current || current.status !== "FEE_PENDING") return false;
    const [fee] = await tx.select({ status: admissionFeePayments.status }).from(admissionFeePayments)
      .where(and(eq(admissionFeePayments.id, input.paymentId), eq(admissionFeePayments.applicationId, input.applicationId), eq(admissionFeePayments.institutionId, input.institutionId))).for("update");
    if (!fee || !["PENDING", "REJECTED"].includes(fee.status) || fee.status !== input.expectedStatus) return false;
    const paymentAccount = await resolvePaymentAccount(tx, input.institutionId, input.paymentAccountId);
    await assertPaymentReferenceUnused(tx, input.institutionId, paymentAccount.id, input.transactionId);
    await tx.insert(admissionFeeProofs).values({ institutionId: input.institutionId, applicationId: input.applicationId,
      paymentId: input.paymentId, paymentAccount, sourceBankName: input.sourceBankName, transactionId: input.transactionId,
      proofFileKey: input.proofFileKey });
    await tx
      .update(admissionFeePayments)
      .set({
        payerReference: input.transactionId,
        paymentAccount,
        payerSourceBank: input.sourceBankName,
        proofFileKey: input.proofFileKey,
        status: "SUBMITTED",
        reviewerNote: null,
        verifiedBy: null,
        verifiedAt: null,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(admissionFeePayments.id, input.paymentId),
          eq(
            admissionFeePayments.institutionId,
            input.institutionId,
          ),
          eq(admissionFeePayments.status, input.expectedStatus),
        ),
      );
    await tx
      .update(admissionApplications)
      .set({ status: "FEE_VERIFICATION", updatedAt: new Date() })
      .where(
        and(
          eq(admissionApplications.id, input.applicationId),
          eq(
            admissionApplications.institutionId,
            input.institutionId,
          ),
          eq(admissionApplications.status, "FEE_PENDING"),
        ),
      );
    return true;

}
