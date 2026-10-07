"use client";

import { PaymentHistory } from "@/components/PaymentHistory";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { api } from "@/lib/api-client";
import {
  Banknote,
  ChevronDown,
  ChevronUp,
  ReceiptText,
  WalletCards,
  X,
} from "lucide-react";

type Invoice = {
  id: number;
  billingMonth: string;
  dueDate: string;
  status: "DUE" | "PARTIAL" | "PAID" | "VOID";
  totalAmount: number;
  paidAmount: number;
};
type Item = {
  id: number;
  invoiceId: number;
  label: string;
  type: "FEE" | "DISCOUNT" | "CHARGE" | "LATE_FEE";
  amount: number;
};
type Payment = {
  id: number;
  invoiceId: number;
  receiptNumber: string;
  amount: number;
  method: string;
  receivedAt: string;
};
type Submission = {
  id: number;
  invoiceId: number;
  status: "SUBMITTED" | "VERIFIED" | "REJECTED";
  reviewerNote: string | null;
};
type Response = {
  invoices: Invoice[];
  items: Item[];
  payments: Payment[];
  submissions: Submission[];
  gateways: string[];
  summary: { billed: number; paid: number; balance: number };
};
const money = (value: number) =>
  `PKR ${Number(value || 0).toLocaleString("en-PK")}`;

export function StudentFeesClient() {
  const { toast } = useToast();
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api.get<Response>("/api/student/fees"));
    } catch (error) {
      toast({
        title: "Could not load fees",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function payWithGateway(gateway: string) {
    if (!paying) return;
    setBusy(true);
    try {
      const { redirectUrl, payload, checkoutUrl } = await api.post<{ redirectUrl: string; payload: Record<string, string>; checkoutUrl?: string }>(
        "/api/student/fees/pay",
        { invoiceId: paying.id, gateway }
      );

      if (checkoutUrl) { window.location.assign(checkoutUrl); return; }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = redirectUrl;
      form.style.display = "none";

      for (const [key, value] of Object.entries(payload)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      toast({
        title: "Payment initialization failed",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
      setBusy(false);
    }
  }

  if (loading)
    return (
      <p className="py-12 text-center text-sm text-stone-500">
        Loading fee account…
      </p>
    );
  if (!data?.invoices.length)
    return (
      <><PaymentHistory /><Card>
        <CardContent className="p-10 text-center">
          <WalletCards className="mx-auto h-10 w-10 text-stone-300" />
          <h2 className="mt-3 font-semibold">No fee challans issued yet</h2>
        </CardContent>
      </Card></>
    );
  const feeData = data;
  const active = feeData.invoices.filter(
    (invoice) => !["PAID", "VOID"].includes(invoice.status),
  );
  const paid = feeData.invoices.filter((invoice) => invoice.status === "PAID");

  function rows(invoices: Invoice[], paidMode = false) {
    return invoices.length ? (
      invoices.map((invoice) => {
        const balance = invoice.totalAmount - invoice.paidAmount;
        const pending = feeData.submissions.find(
          (item) =>
            item.invoiceId === invoice.id && item.status === "SUBMITTED",
        );
        const rejected = feeData.submissions.find(
          (item) => item.invoiceId === invoice.id && item.status === "REJECTED",
        );
        const expanded = openId === invoice.id;
        return (
          <div key={invoice.id} className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                className="flex flex-1 items-center justify-between gap-4 text-left"
                onClick={() => setOpenId(expanded ? null : invoice.id)}
              >
                <div>
                  <p className="font-semibold text-brand-950">
                    {new Date(
                      `${invoice.billingMonth}-01T00:00:00`,
                    ).toLocaleDateString("en-PK", {
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Due {invoice.dueDate} · {money(invoice.totalAmount)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={paidMode ? "default" : "outline"}>
                    {paidMode ? "PAID" : pending ? "VERIFYING" : invoice.status}
                  </Badge>
                  {expanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </button>
              {!paidMode && (
                <Button
                  disabled={Boolean(pending)}
                  onClick={() => setPaying(invoice)}
                >
                  {pending ? "Awaiting verification" : "Pay challan"}
                </Button>
              )}
            </div>
            {rejected?.reviewerNote && (
              <p className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-700">
                Previous proof rejected: {rejected.reviewerNote}
              </p>
            )}
            {expanded && (
              <div className="mt-4 grid gap-5 border-t pt-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs font-bold uppercase text-stone-500">
                    Challan
                  </h3>
                  {feeData.items
                    .filter((item) => item.invoiceId === invoice.id)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="mt-2 flex justify-between text-sm"
                      >
                        <span>{item.label}</span>
                        <span>
                          {item.type === "DISCOUNT" ? "−" : ""}
                          {money(item.amount)}
                        </span>
                      </div>
                    ))}
                  <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                    <span>Balance</span>
                    <span>{money(balance)}</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase text-stone-500">
                    Receipts
                  </h3>
                  {feeData.payments
                    .filter((item) => item.invoiceId === invoice.id)
                    .map((receipt) => (
                      <div
                        key={receipt.id}
                        className="mt-2 rounded-md border bg-stone-50 p-3"
                      >
                        <div className="flex justify-between gap-3">
                          <span className="font-mono text-xs font-bold">
                            {receipt.receiptNumber}
                          </span>
                          <strong>{money(receipt.amount)}</strong>
                        </div>
                        <p className="mt-1 text-xs text-stone-500">
                          {new Date(receipt.receivedAt).toLocaleString("en-PK")}{" "}
                          · {receipt.method}
                        </p>
                        {balance > 0 && !pending && (
                          <Button
                            size="sm"
                            className="mt-3"
                            onClick={() => setPaying(invoice)}
                          >
                            Pay remaining balance
                          </Button>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        );
      })
    ) : (
      <p className="p-8 text-center text-sm text-stone-500">Nothing to show.</p>
    );
  }

  return (
    <div className="space-y-6">
      <PaymentHistory />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Total billed",
            value: feeData.summary.billed,
            Icon: ReceiptText,
          },
          {
            label: "Payments received",
            value: feeData.summary.paid,
            Icon: Banknote,
          },
          {
            label: "Outstanding",
            value: feeData.summary.balance,
            Icon: WalletCards,
          },
        ].map(({ label, value, Icon }) => (
          <Card key={label} className="overflow-hidden rounded-xl border border-stone-200 bg-gradient-to-b from-white to-stone-50/50 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{label}</p>
                <div className="rounded-lg bg-brand-50/80 p-2.5 ring-1 ring-brand-100/50">
                  <Icon className="h-4 w-4 text-brand-700" />
                </div>
              </div>
              <div className="mt-5">
                <p className="text-3xl font-bold tracking-tight text-white">{money(value)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="border-b border-border bg-stone-50/70">
          <CardTitle>Active challans</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">{rows(active)}</CardContent>
      </Card>
      <Card>
        <CardHeader className="border-b border-border bg-stone-50/70">
          <CardTitle>Paid challans & receipts</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">{rows(paid, true)}</CardContent>
      </Card>
      {paying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/55 p-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <CardHeader className="flex-row justify-between border-b border-border bg-stone-50/70 text-left">
              <div>
                <CardTitle>Pay challan</CardTitle>
                <p className="mt-1 text-sm text-stone-500">
                  Balance {money(paying.totalAmount - paying.paidAmount)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPaying(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-6 pt-7 text-left">
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                {feeData.gateways.includes("easypaisa") && (
                  <Button
                    className="w-full h-14 text-base font-medium shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                    onClick={() => payWithGateway("easypaisa")}
                    disabled={busy}
                  >
                    Pay with Easypaisa
                  </Button>
                )}
                {feeData.gateways.includes("jazzcash") && (
                  <Button
                    className="w-full h-14 text-base font-medium shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                    onClick={() => payWithGateway("jazzcash")}
                    disabled={busy}
                  >
                    Pay with JazzCash
                  </Button>
                )}
                {feeData.gateways.includes("hblpay") && (
                  <Button
                    className="w-full h-14 text-base font-medium shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                    onClick={() => payWithGateway("hblpay")}
                    disabled={busy}
                  >
                    Pay with HBL Pay
                  </Button>
                )}
              </div>
              {!feeData.gateways.length && (
                <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  Contact the accounts office; online payment details are not
                  configured.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
