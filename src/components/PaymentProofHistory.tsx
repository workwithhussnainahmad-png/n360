import type { PaymentAccount } from '@/lib/payment-account-types';
export type PaymentProofRecord = { id: number; label?: string; amount?: number; paymentAccount?: PaymentAccount | null; sourceBankName: string; transactionId: string; status: string; reviewerNote: string | null; submittedAt: string };
export function PaymentProofHistory({ records, fileBase }: { records: PaymentProofRecord[]; fileBase: string }) {
  if (!records.length) return null;
  return <section className="space-y-3 rounded border p-4">
    <h3 className="font-semibold">Payment submissions &amp; saved screenshots</h3>
    {records.map(record => <div key={record.id} className="space-y-1 border-t pt-3 text-sm">
      <p className="font-medium">{record.label || `Submission ${record.id}`} · {record.status.toLowerCase()}</p>
      <p>{record.amount != null ? `PKR ${record.amount.toLocaleString('en-PK')} · ` : ''}Transaction ID: <span className="break-all font-mono">{record.transactionId}</span></p>
      {record.paymentAccount ? <p className="break-words">{record.paymentAccount.providerName} · {record.paymentAccount.accountTitle} · {record.paymentAccount.accountNumber}</p> : <p>{record.sourceBankName}</p>}
      <p className="text-xs text-stone-500">Submitted {new Date(record.submittedAt).toLocaleString('en-PK')}{record.reviewerNote ? ` · ${record.reviewerNote}` : ''}</p>
      <a href={`${fileBase}/${record.id}`} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline">View saved payment screenshot</a>
    </div>)}
  </section>;
}
