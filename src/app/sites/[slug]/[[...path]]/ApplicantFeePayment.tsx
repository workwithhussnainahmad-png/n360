"use client";

import { useState } from "react";

export function ApplicantFeePayment({
  applicationId,
  gateways,
}: {
  applicationId: number;
  accentColor: string;
  gateways: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function payWithGateway(gateway: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/admissions/fees/${applicationId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gateway }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Payment initialization failed");
      }

      if (data.checkoutUrl) { window.location.assign(data.checkoutUrl); return; }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.redirectUrl;
      form.style.display = "none";

      for (const [key, value] of Object.entries(data.payload)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value as string;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment initialization failed");
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-4 border-t border-emerald-200 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {gateways.includes("easypaisa") && (
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-md bg-stone-900 text-sm font-medium text-stone-50 shadow transition-colors hover:bg-stone-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-950 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => payWithGateway("easypaisa")}
            disabled={busy}
          >
            Pay with Easypaisa
          </button>
        )}
        {gateways.includes("jazzcash") && (
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-md bg-stone-900 text-sm font-medium text-stone-50 shadow transition-colors hover:bg-stone-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-950 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => payWithGateway("jazzcash")}
            disabled={busy}
          >
            Pay with JazzCash
          </button>
        )}
        {gateways.includes("hblpay") && (
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center rounded-md bg-stone-900 text-sm font-medium text-stone-50 shadow transition-colors hover:bg-stone-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-stone-950 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => payWithGateway("hblpay")}
            disabled={busy}
          >
            Pay with HBL Pay
          </button>
        )}
      </div>
      {!gateways.length && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Contact the admissions office; online payment details are not configured.
        </p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
