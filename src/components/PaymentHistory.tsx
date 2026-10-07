"use client";
import { useEffect, useState } from "react";

export type PublicPayment = {
  id: string; status: "PENDING" | "PAID" | "REVIEW"; amount: number; currency: string; gateway: string;
  environment: string; receiptNumber: string | null; providerReference: string | null;
  institutionName: string; payerName: string; description: string; createdAt: string; verifiedAt: string | null; expiresAt: string;
  qrImage?: string | null;
};
export function paymentStatus(payment: PublicPayment) {
  if (payment.environment === "sandbox" && payment.receiptNumber) return "Sandbox payment verified — fee unchanged";
  return payment.status === "PAID" ? "Paid and verified" : payment.status === "REVIEW" ? "Payment received — institution review required"
    : Date.parse(payment.expiresAt) < Date.now() ? "Payment not confirmed — check before retrying" : "Awaiting payment confirmation";
}
export function PaymentHistory({ invoiceId, applicationId, studentId }: { invoiceId?: number; applicationId?: number; studentId?: number }) {
  const [payments, setPayments] = useState<PublicPayment[]>([]); const [error, setError] = useState("");
  const [next, setNext] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(); if (invoiceId) params.set("invoiceId", String(invoiceId)); if (applicationId) params.set("applicationId", String(applicationId));
  if (studentId) params.set("studentId", String(studentId));
  const url = `/api/payments?${params}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load payment history");
      const data = await response.json(); setPayments(data.payments); setNext(data.next);
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load payment history"); });
    return () => controller.abort();
  }, [url]);
  return <section className="rounded-md border bg-white p-4 text-stone-900">
    <h3 className="font-semibold">Online payments & receipts</h3>
    {payments.map((payment) => <a key={payment.id} href={`/payments/${payment.id}`} className="mt-3 block rounded border p-3 hover:bg-stone-50">
      <div className="flex justify-between gap-3"><span>{payment.description}</span><strong>PKR {payment.amount.toLocaleString("en-PK")}</strong></div>
      <p className="mt-1 text-xs">{paymentStatus(payment)} · {payment.gateway} · {new Date(payment.createdAt).toLocaleString("en-PK")}</p>
      <p className="mt-1 font-mono text-xs">{payment.receiptNumber || payment.id}</p>
    </a>)}
    {!payments.length && !error && <p className="mt-2 text-sm text-stone-500">No online payment records yet.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {next && <button disabled={busy} className="mt-3 text-sm underline" onClick={async () => {
      setBusy(true); try {
        const response = await fetch(`${url}&before=${encodeURIComponent(next)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(); const data = await response.json(); setPayments((previous) => [...previous, ...data.payments]); setNext(data.next);
      } catch { setError("Could not load older payments"); } finally { setBusy(false); }
    }}>Older payments</button>}
  </section>;
}
