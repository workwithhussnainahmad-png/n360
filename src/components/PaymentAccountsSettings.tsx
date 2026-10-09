"use client";
import { responseErrorMessage } from '@/lib/validation-errors';


import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Building2, CheckCircle2, ImagePlus, Loader2, Plus, QrCode, Trash2, X } from "lucide-react";
import type { PaymentAccount } from "@/lib/payment-account-types";
import { uploadPaymentImage } from "@/lib/upload-payment-image";
import { Button } from "@/components/ui/button";

const endpoint = "/api/institution/settings/payment-accounts";
const inputClass = "mt-2 block h-11 w-full rounded-md border border-border bg-white px-3 text-sm text-brand-950 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60";

export function PaymentAccountsSettings() {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [imageName, setImageName] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  async function load() {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error(await responseErrorMessage(response));
    setAccounts((await response.json()).accounts);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(await responseErrorMessage(response)); return response.json(); })
      .then(data => setAccounts(data.accounts))
      .catch(error => { if (!controller.signal.aborted) setNotice({ text: error.message, error: true }); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, values = new FormData(form);
    setBusy(true); setNotice(null);
    try {
      const image = values.get("image") as File;
      let asset = {};
      if (image?.size) {
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "qrSignature" }) });
        const signature = await response.json();
        if (!response.ok) throw new Error(signature.error);
        asset = await uploadPaymentImage(image, signature);
      }
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerName: values.get("providerName"), accountNumber: values.get("accountNumber"), accountTitle: values.get("accountTitle"), ...asset }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAccounts(current => [...current, result.account]);
      form.reset(); setImageName(""); setShowForm(false);
      setNotice({ text: "Payment gateway added. It is now available to your payers.", error: false });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "Could not save payment account.", error: true }); }
    finally { setBusy(false); }
  }

  async function remove(account: PaymentAccount) {
    if (!window.confirm(`Delete ${account.providerName}? Submitted payment evidence will be retained.`)) return;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`${endpoint}?id=${encodeURIComponent(account.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseErrorMessage(response));
      setAccounts(current => current.filter(row => row.id !== account.id));
      setNotice({ text: "Payment gateway removed. Previous payment records are preserved.", error: false });
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "Could not delete account.", error: true }); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-semibold text-brand-950">Your payment accounts</p><p className="mt-1 text-xs text-stone-500">{loading ? "Loading accounts…" : `${accounts.length} ${accounts.length === 1 ? "gateway" : "gateways"} available`}</p></div>
      {!showForm && <Button type="button" size="sm" disabled={busy || loading} onClick={() => { setShowForm(true); setNotice(null); }}><Plus className="mr-2 h-4 w-4" />Add gateway</Button>}
    </div>
    {notice && <div role={notice.error ? "alert" : "status"} className={`flex items-start gap-2 rounded-md border px-3 py-3 text-sm ${notice.error ? "border-red-200 bg-red-50 text-red-800" : "border-teal-200 bg-teal-50 text-teal-900"}`}>
      {!notice.error && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}<span>{notice.text}</span>
      {notice.error && !loading && !accounts.length && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await load(); setNotice(null); } catch { /* Keep the load error visible. */ } finally { setBusy(false); } }}>Retry</Button>}
    </div>}
    {loading ? <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-stone-50 py-10 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" />Loading payment gateways</div> : accounts.length > 0 ? <div className="grid gap-3 md:grid-cols-2">
      {accounts.map(account => <article key={account.id} className="min-w-0 overflow-hidden rounded-lg border border-border bg-white">
        <div className="flex items-center gap-3 border-b border-border bg-stone-50/70 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand-100 bg-white text-brand-700"><Building2 className="h-4 w-4" /></span>
          <p className="min-w-0 flex-1 break-words text-sm font-semibold text-brand-950">{account.providerName}</p>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-stone-400 hover:bg-red-50 hover:text-red-700" disabled={busy} aria-label={`Delete ${account.providerName}`} title="Delete gateway" onClick={() => void remove(account)}><Trash2 className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-start gap-4 p-4">
          <dl className="min-w-0 flex-1 space-y-4">
            <div><dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Account name</dt><dd className="mt-1 break-words text-sm font-medium text-stone-800">{account.accountTitle}</dd></div>
            <div><dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Account number / IBAN</dt><dd className="mt-1 break-all font-mono text-sm text-brand-950">{account.accountNumber}</dd></div>
          </dl>
          {account.qrUrl && <a href={account.qrUrl} target="_blank" rel="noreferrer" aria-label={`View ${account.providerName} QR image`} className="shrink-0 rounded-md border border-border bg-white p-2 focus-ring">
            <Image unoptimized width={72} height={72} src={account.qrUrl} alt={`${account.providerName} payment QR`} className="h-16 w-16 object-contain sm:h-[72px] sm:w-[72px]" />
            <span className="mt-1 flex items-center justify-center gap-1 text-[10px] font-medium text-stone-500">View QR<ArrowUpRight className="h-3 w-3" /></span>
          </a>}
        </div>
      </article>)}
    </div> : !showForm && !notice?.error && <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50/60 px-5 py-9 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white text-brand-700"><Building2 className="h-5 w-5" /></span>
      <p className="mt-3 text-sm font-semibold text-brand-950">Add your first payment gateway</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-stone-500">Add a bank or wallet account where students, parents, and applicants can send their fees.</p>
    </div>}
    {showForm && <form onSubmit={add} className="overflow-hidden rounded-lg border border-brand-200 bg-stone-50/50">
      <div className="flex items-center justify-between border-b border-brand-100 px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-brand-950">New payment gateway</p>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={busy} aria-label="Close add gateway form" onClick={() => { setShowForm(false); setImageName(""); }}><X className="h-4 w-4" /></Button>
      </div>
      <fieldset disabled={busy} className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
        <label className="text-xs font-medium text-stone-700">Payment gateway name<input name="providerName" required minLength={2} maxLength={120} placeholder="e.g. Meezan Bank or JazzCash" className={inputClass} /></label>
        <label className="text-xs font-medium text-stone-700">Account name<input name="accountTitle" required minLength={2} maxLength={160} placeholder="Name registered on the account" className={inputClass} /></label>
        <label className="text-xs font-medium text-stone-700 sm:col-span-2">Account number / IBAN<input name="accountNumber" required minLength={2} maxLength={160} placeholder="Enter the full account number or IBAN" className={inputClass + " font-mono"} /></label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-stone-700">QR code or image <span className="font-normal text-stone-400">(optional)</span></span>
          <span className="relative mt-2 flex items-center gap-3 rounded-md border border-dashed border-stone-300 bg-white p-4 transition-colors hover:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500">
            <ImagePlus className="h-5 w-5 shrink-0 text-stone-400" />
            <span className="min-w-0"><span className="block break-all text-sm font-medium text-stone-700">{imageName || "Choose a QR code or payment image"}</span><span className="mt-1 block text-xs text-stone-400">JPG, PNG, or WebP · Up to 5 MB</span></span>
            <input name="image" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload optional payment QR image" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={event => setImageName(event.target.files?.[0]?.name ?? "")} />
          </span>
        </label>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2 border-t border-brand-100 bg-white px-4 py-3 sm:px-5">
        <Button type="button" variant="outline" disabled={busy} onClick={() => { setShowForm(false); setImageName(""); }}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}{busy ? "Saving gateway…" : "Save gateway"}</Button>
      </div>
    </form>}
    <div className="flex items-start gap-2 text-xs leading-5 text-stone-500"><QrCode className="mt-0.5 h-4 w-4 shrink-0" /><p>Payers choose an account and submit a screenshot and transaction ID. You review each payment before it is confirmed.</p></div>
  </div>;
}
