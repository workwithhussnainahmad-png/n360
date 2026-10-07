"use client";
import { useEffect, useState } from "react";
import { paymentStatus, type PublicPayment } from "@/components/PaymentHistory";
import Image from "next/image";

export function PaymentDetails({ id }: { id: string }) {
  const [payment, setPayment] = useState<PublicPayment | null>(null); const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [checking, setChecking] = useState(false);
  const [expired, setExpired] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let checks = 0;
    async function load() {
      try {
        const response = await fetch(`/api/payments/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        setPayment(data.payment); setExpired(Date.parse(data.payment.expiresAt) <= Date.now()); setError("");
        if (data.payment.status === "PENDING" && checks++ < 30) {
          if (data.payment.gateway !== "hblpay") {
            await fetch(`/api/payments/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check" }), signal: controller.signal });
          }
          timer = setTimeout(load, 15000);
        }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load payment"); }
    }
    void load(); return () => { controller.abort(); clearTimeout(timer); };
  }, [id, refresh]);
  return <main className="mx-auto my-12 max-w-2xl space-y-5 p-6">
    <h1 className="text-2xl font-bold">Payment {payment?.receiptNumber ? "receipt" : "status"}</h1>
    {error && <p role="alert" className="rounded border p-4 text-red-700">{error}</p>}
    {payment && <article className="space-y-4 rounded border p-6">
      <h2 className="text-xl font-semibold">{payment.institutionName}</h2>
      <p>{payment.payerName}</p><p>{payment.description}</p>
      <p className="text-2xl font-bold">{payment.currency} {payment.amount.toLocaleString("en-PK")}</p>
      <p className="font-semibold">{paymentStatus(payment)}</p>
      {payment.environment === "sandbox" && <p>Sandbox test — no fee balance changed.</p>}
      {payment.gateway === "easypaisa" && payment.status === "PENDING" && !expired && payment.qrImage &&
        <div className="print:hidden"><Image src={payment.qrImage} alt="Scan in Easypaisa to pay this fee" width={256} height={256} unoptimized /><p className="mt-2 text-sm">Scan with Easypaisa and confirm the amount and institution. This page will check payment automatically.</p></div>}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt>Gateway</dt><dd>{payment.gateway}</dd><dt>Order</dt><dd className="break-all font-mono">{payment.id}</dd>
        {payment.receiptNumber && <><dt>Receipt</dt><dd className="break-all font-mono">{payment.receiptNumber}</dd></>}
        {payment.providerReference && <><dt>Provider reference</dt><dd className="break-all font-mono">{payment.providerReference}</dd></>}
        <dt>Started</dt><dd>{new Date(payment.createdAt).toLocaleString("en-PK")}</dd>
        {payment.verifiedAt && <><dt>Verified</dt><dd>{new Date(payment.verifiedAt).toLocaleString("en-PK")}</dd></>}
      </dl>
      {payment.status === "REVIEW" && <p className="text-sm">The gateway confirmed payment, but it could not be applied automatically. Contact the institution with this receipt. Do not pay again.</p>}
      {payment.status === "PENDING" && <p className="text-sm">Payment has not been verified. If your account was debited, check the status or contact the institution before making another payment.</p>}
    </article>}
    <div className="flex gap-4 print:hidden"><button disabled={checking} className="rounded border px-4 py-2" onClick={async () => {
      setChecking(true); try {
        const response = await fetch(`/api/payments/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check" }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error); setRefresh((n) => n + 1);
      } catch (err) { setError(err instanceof Error ? err.message : "Could not check payment"); } finally { setChecking(false); }
    }}>{checking ? "Checking..." : "Check payment status"}</button>
      {payment?.gateway === "easypaisa" && payment.status === "PENDING" && !expired && !payment.qrImage && <button disabled={checking} className="rounded border px-4 py-2" onClick={async () => {
        setChecking(true); try {
          const response = await fetch(`/api/payments/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "qr" }) });
          const data = await response.json(); if (!response.ok) throw new Error(data.error); setRefresh((n) => n + 1);
        } catch (err) { setError(err instanceof Error ? err.message : "Could not generate QR"); } finally { setChecking(false); }
      }}>Retry QR code</button>}
      {payment?.receiptNumber && <button className="rounded border px-4 py-2" onClick={() => window.print()}>Print / save receipt</button>}</div>
  </main>;
}
