"use client";

import { ManualPaymentForm } from "@/components/ManualPaymentForm";
import type { StudentFeeAccount, StudentFeeDetails } from "@/lib/student-fees";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { useAbortableReads } from "@/lib/use-abortable-reads";
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
  billingKind?: "MONTHLY" | "ONE_TIME";
  billingLabel?: string | null;
  dueDate: string;
  status: "DUE" | "PARTIAL" | "PAID" | "VOID";
  totalAmount: number;
  paidAmount: number;
};
const money = (value: number) =>
  `PKR ${Number(value || 0).toLocaleString("en-PK")}`;

export function StudentFeesClient({ studentId, initialData }: { studentId?: number; initialData?: StudentFeeAccount }) {
  const endpoint = `/api/student/fees${studentId ? `?studentId=${studentId}` : ""}`;
  const reads = useAbortableReads();
  const { toast } = useToast();
  const [data, setData] = useState<StudentFeeAccount | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [openId, setOpenId] = useState<number | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [paidPage, setPaidPage] = useState(1);
  const [details, setDetails] = useState<Record<number, StudentFeeDetails>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const detailRequest = useRef<AbortController | null>(null);
  const seeded = useRef(initialData ? `${endpoint}:1:1` : null);
  const load = useCallback(async (parentSignal?: AbortSignal) => {
    const signal = reads.begin("account", parentSignal);
    setLoading(true);
    try {
      const separator = endpoint.includes('?') ? '&' : '?';
      const result = await api.get<StudentFeeAccount>(endpoint + separator + new URLSearchParams({ activePage: String(activePage), paidPage: String(paidPage) }), { signal });
      if (!signal?.aborted) setData(result);
    } catch (error) {
      if (signal?.aborted) return;
      toast({ title: "Could not load fees", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [toast, endpoint, activePage, paidPage, reads]);
  useEffect(() => {
    if (seeded.current === `${endpoint}:${activePage}:${paidPage}`) return;
    seeded.current = null;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load, endpoint, activePage, paidPage]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  async function loadDetails(id: number, page = 1) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetailLoading(true); setDetailError("");
    try {
      const separator = endpoint.includes('?') ? '&' : '?';
      const result = await api.get<StudentFeeDetails>(endpoint + separator + new URLSearchParams({ invoiceId: String(id), page: String(page) }), { signal: controller.signal });
      if (!controller.signal.aborted) setDetails(current => {
        const next = { ...current, [id]: page === 1 ? result : { ...result, items: [...current[id].items, ...result.items], payments: [...current[id].payments, ...result.payments] } };
        while (Object.keys(next).length > 10) delete next[Number(Object.keys(next).find(key => Number(key) !== id))];
        return next;
      });
    } catch (error) { if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "Could not load challan details."); }
    finally { if (!controller.signal.aborted) setDetailLoading(false); }
  }
  function toggleDetails(id: number) {
    detailRequest.current?.abort(); setDetailLoading(false); setDetailError("");
    setOpenId(current => current === id ? null : id);
    if (openId !== id && !details[id]) void loadDetails(id);
  }
  function pager(paging: StudentFeeAccount['activePagination'], setPage: (page: number) => void) {
    return <nav aria-label="Challan pagination" className="flex flex-wrap justify-between gap-3 p-4 text-sm">
      <span>Page {paging.page} of {paging.pages} ? {paging.total} challans</span>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={loading || paging.page <= 1} onClick={() => setPage(paging.page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={loading || paging.page >= paging.pages} onClick={() => setPage(paging.page + 1)}>Next</Button></div>
    </nav>;
  }

  if (loading)
    return (
      <p className="py-12 text-center text-sm text-stone-500">
        Loading fee account…
      </p>
    );
  if (data && !data.activePagination.total && !data.paidPagination.total)
    return (
      <><Card>
        <CardContent className="p-10 text-center">
          <WalletCards className="mx-auto h-10 w-10 text-stone-300" />
          <h2 className="mt-3 font-semibold">No fee challans issued yet</h2>
        </CardContent>
      </Card></>
    );
  if (!data) return <Button onClick={() => void load()}>Retry loading fees</Button>;
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
                onClick={() => toggleDetails(invoice.id)}
              >
                <div>
                  <p className="font-semibold text-brand-950">
                    {invoice.billingKind === "ONE_TIME" && <span className="mb-1 block break-words">{invoice.billingLabel || "One-time charge"}</span>}
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
                {detailLoading && <p role="status">Loading challan details?</p>}
                {detailError && <div role="alert">{detailError} <Button onClick={() => void loadDetails(invoice.id)}>Retry</Button></div>}
                {details[invoice.id]?.hasMore && <Button disabled={detailLoading} onClick={() => void loadDetails(invoice.id, details[invoice.id].page + 1)}>More items & receipts</Button>}
                <div>
                  <h3 className="text-xs font-bold uppercase text-stone-500">
                    Challan
                  </h3>
                  {(details[invoice.id]?.items ?? [])
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
                  {(details[invoice.id]?.payments ?? [])
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
          <Card key={label} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">{label}</p>
                <div className="rounded-lg bg-stone-100 p-2.5">
                  <Icon className="h-4 w-4 text-brand-700" />
                </div>
              </div>
              <div className="mt-5">
                <p className="text-2xl font-bold tabular-nums tracking-tight text-brand-950 sm:text-3xl">{money(value)}</p>
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
        {pager(feeData.activePagination, setActivePage)}
      </Card>
      <Card>
        <CardHeader className="border-b border-border bg-stone-50/70">
          <CardTitle>Paid challans & receipts</CardTitle>
        </CardHeader>
        <CardContent className="divide-y p-0">{rows(paid, true)}</CardContent>
        {pager(feeData.paidPagination, setPaidPage)}
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
              <ManualPaymentForm endpoint={endpoint} invoiceId={paying.id} amount={paying.totalAmount - paying.paidAmount} allowPartial paymentAccounts={feeData.paymentAccounts} onSubmitted={() => { setPaying(null); setDetails({}); void load(); }} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
