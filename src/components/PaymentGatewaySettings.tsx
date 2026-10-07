"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Gateway } from "@/lib/payments/policy";

type Status = { configured: boolean; enabled: boolean; environment: string; ready: boolean; reason: string };
const fields = {
  jazzcash: [["merchantId", "Merchant ID", "text"], ["password", "Merchant password", "password"], ["hashKey", "Integrity salt / hash key", "password"]],
  easypaisa: [["accountNum", "Merchant account number", "text"], ["storeId", "Store ID", "text"], ["username", "Partner username", "text"], ["password", "Partner password", "password"], ["privateKey", "Client RSA private key (PEM)", "textarea"], ["easypaisaPublicKey", "Easypaisa RSA public key (PEM)", "textarea"]],
  hblpay: [["profileId", "HBL-issued Cybersource profile ID", "text"], ["accessKey", "Secure Acceptance access key", "password"], ["secretKey", "Secure Acceptance secret key", "password"]],
};
export function PaymentGatewaySettings({ gateway, title }: { gateway: Gateway; title: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  async function load() {
    const response = await fetch("/api/institution/settings/payment-gateway", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load gateway settings");
    setStatus((await response.json()).gateways[gateway]);
  }
  useEffect(() => { let mounted = true;
    fetch("/api/institution/settings/payment-gateway", { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error("Unable to load gateway settings");
      const data = await r.json(); if (mounted) setStatus(data.gateways[gateway]);
    }).catch(() => { if (mounted) setMessage("Unable to load gateway settings"); });
    return () => { mounted = false; };
  }, [gateway]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setMessage("");
    const credentials = Object.fromEntries(fields[gateway].map(([name]) => [name, String(data.get(name) || "")]));
    if (gateway === "hblpay") credentials.integration = "cybersource-hosted";
    try {
      const response = await fetch("/api/institution/settings/payment-gateway", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway, credentials, environment: data.get("environment"), enabled: data.get("enabled") === "on" }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      form.reset(); await load(); setMessage(result.ready ? "Live payment collection enabled." : `Configuration saved. ${result.reason}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save settings"); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button className="w-full rounded-md border p-4 text-left">
      <strong>{title}</strong><p className="mt-1 text-sm text-stone-600">{status?.reason || message || "Loading settings..."}</p>
    </button></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{title} settings</DialogTitle></DialogHeader>
      {gateway === "hblpay" && <p className="text-sm">For an HBL-issued Cybersource Secure Acceptance Hosted Checkout profile only. Other HBL payment products require a separate integration.</p>}
      <form key={`${status?.environment}-${status?.enabled}`} onSubmit={save} autoComplete="off" className="space-y-4">
        <p className="text-sm text-stone-600">Use credentials issued to this institution. Saving credentials does not complete provider acceptance testing.</p>
        {fields[gateway].map(([name, label, type]) => <label key={name} className="block text-sm">{label}
          {type === "textarea" ? <textarea name={name} required maxLength={8192} rows={4} className="mt-1 w-full rounded border p-2 font-mono" /> :
            <input name={name} type={type} required maxLength={1024} autoComplete="off" className="mt-1 w-full rounded border p-2" />}
        </label>)}
        <label className="block text-sm">Environment<select name="environment" defaultValue={status?.environment || "sandbox"} className="ml-2 rounded border p-2"><option value="sandbox">Sandbox</option><option value="production">Production</option></select></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={status?.enabled} />Enable collection after provider acceptance testing</label>
        <button disabled={busy || !status} className="rounded bg-brand-800 px-4 py-2 text-white disabled:opacity-50">{busy ? "Saving..." : "Save configuration"}</button>
      </form>
      {status?.configured && status.environment === "sandbox" && <form className="space-y-2 rounded border p-3" onSubmit={async (event) => {
        event.preventDefault(); const invoiceId = Number(new FormData(event.currentTarget).get("invoiceId"));
        setBusy(true); setMessage("");
        try {
          const response = await fetch("/api/institution/settings/payment-gateway/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gateway, invoiceId }) });
          const data = await response.json(); if (!response.ok) throw new Error(data.error);
          if (data.checkoutUrl) { window.location.assign(data.checkoutUrl); return; }
          const checkout = document.createElement("form"); checkout.method = "POST"; checkout.action = data.redirectUrl;
          for (const [name, value] of Object.entries(data.payload)) {
            const field = document.createElement("input"); field.type = "hidden"; field.name = name; field.value = String(value); checkout.appendChild(field);
          }
          document.body.appendChild(checkout); checkout.submit(); checkout.remove();
        } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start sandbox checkout"); } finally { setBusy(false); }
      }}>
        <p className="text-sm">Test with an unpaid challan from this institution. Sandbox payments never change its balance.</p>
        <label className="block text-sm">Challan ID<input name="invoiceId" type="number" min="1" step="1" required className="ml-2 w-28 rounded border p-2" /></label>
        <button disabled={busy} className="rounded border px-3 py-2 text-sm">Start sandbox checkout</button>
      </form>}
      {status?.configured && <button disabled={busy} className="text-sm text-red-700" onClick={async () => {
        setBusy(true); try {
          const response = await fetch("/api/institution/settings/payment-gateway", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gateway }) });
          if (!response.ok) throw new Error("Could not remove configuration"); await load(); setMessage("Configuration removed. Existing payment records are retained.");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove configuration"); } finally { setBusy(false); }
      }}>Remove saved configuration</button>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </DialogContent>
  </Dialog>;
}
