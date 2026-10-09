"use client";
import { useEffect, useState } from "react";
import { paymentStatus, type PublicPayment } from "@/components/PaymentHistory";
export function PaymentDetails({ id }: { id: string }) {
  const [payment,setPayment]=useState<PublicPayment|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();fetch(`/api/payments/${encodeURIComponent(id)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setPayment(data.payment);}).catch(error=>{if(!controller.signal.aborted)setError(error.message);});return()=>controller.abort();},[id]);
  return <main className="mx-auto max-w-lg space-y-4 p-6"><h1 className="text-xl font-semibold">Archived payment record</h1><p className="text-sm">Online checkout has been retired. Submit fee payments through your portal for institution verification.</p>{payment&&<div className="rounded border p-4"><p>Payment {payment.id}</p><p>{paymentStatus(payment)}</p><p>PKR {payment.amount.toLocaleString('en-PK')}</p></div>}{error&&<p role="alert">{error}</p>}</main>;
}
