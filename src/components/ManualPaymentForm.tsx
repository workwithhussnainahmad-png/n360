"use client";
import Image from 'next/image';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { PaymentAccount } from '@/lib/payment-account-types';
import { uploadPaymentImage } from '@/lib/upload-payment-image';
import { Button } from '@/components/ui/button';

export function ManualPaymentForm({ endpoint, invoiceId, amount, paymentAccounts, allowPartial = false, onSubmitted }: {
  endpoint: string; invoiceId?: number; amount: number; paymentAccounts?: PaymentAccount[]; allowPartial?: boolean; onSubmitted?: () => void;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<PaymentAccount[]>(paymentAccounts ?? []), [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    if (paymentAccounts) return;
    let active = true;
    fetch(endpoint, { cache: 'no-store' }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load payment accounts.'); if (active) setAccounts(data.paymentAccounts); })
      .catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [endpoint, paymentAccounts]);
  const account = accounts.find(row => row.id === selectedId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget), file = values.get('screenshot') as File;
    if (!account || !file?.size) { setMessage('Select a payment account and attach your payment screenshot.'); return; }
    setBusy(true); setMessage('');
    try {
      const request = async (body: object) => {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not submit payment.'); return result;
      };
      const signature = await request({ action: 'signature', invoiceId });
      const asset = await uploadPaymentImage(file, signature);
      const transactionId = String(values.get('transactionId')).trim();
      await request({ action: 'complete', invoiceId, amount: allowPartial ? Number(values.get('amount')) : amount,
        paymentAccountId: account.id, transactionId, payerReference: transactionId, sourceBankName: account.providerName,
        payerSourceBank: account.providerName, ...asset });
      setMessage('Payment submitted. Your institution will review the screenshot and transaction ID before confirming payment.');
      if (onSubmitted) onSubmitted(); else router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not submit payment.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <p className="text-sm text-stone-600">Transfer the fee to one of these accounts, then submit your payment screenshot and transaction ID. Payment remains pending until your institution verifies it.</p>
    {!accounts.length && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No payment accounts are available. Contact your institution.</p>}
    <label className="block text-sm font-medium">Payment gateway<select required value={selectedId} onChange={event => setSelectedId(event.target.value)} className="mt-1 block w-full rounded border p-2">
      <option value="">Select an account</option>{accounts.map(row => <option key={row.id} value={row.id}>{row.providerName} — {row.accountNumber}</option>)}
    </select></label>
    {account && <div className="space-y-2 rounded border bg-stone-50 p-4 text-sm"><p><strong>{account.providerName}</strong></p><p>Account name: {account.accountTitle}</p><p className="break-all">Account number / IBAN: <strong className="font-mono">{account.accountNumber}</strong></p>
      {account.qrUrl && <Image unoptimized width={160} height={160} src={account.qrUrl} alt={`${account.providerName} payment QR`} className="h-40 w-40 object-contain" />}</div>}
    {allowPartial ? <label className="block text-sm font-medium">Amount paid (PKR)<input name="amount" type="number" min={1} max={amount} step={1} defaultValue={amount} required className="mt-1 block w-full rounded border p-2" /></label> : <p className="text-sm font-medium">Amount to pay: PKR {amount.toLocaleString('en-PK')}</p>}
    <label className="block text-sm font-medium">Transaction ID<input name="transactionId" minLength={2} maxLength={160} required className="mt-1 block w-full rounded border p-2" /></label>
    <label className="block text-sm font-medium">Payment screenshot<input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full text-sm" /><span className="text-xs font-normal text-stone-500">JPG, PNG, or WebP, up to 5 MB. Stored privately for institution review.</span></label>
    <Button type="submit" disabled={busy || !accounts.length}>{busy ? 'Uploading and submitting…' : 'Submit payment for verification'}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
