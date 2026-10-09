"use client";
import { ManualPaymentForm } from '@/components/ManualPaymentForm';
export function ApplicantFeePayment({ applicationId, amount }: { applicationId: number; amount: number }) {
  return <ManualPaymentForm endpoint={`/api/public/admissions/fees/${applicationId}`} amount={amount} />;
}
