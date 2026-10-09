"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileCheck2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import type { PaymentAccount } from "@/lib/payment-account-types";

type Status = "SUBMITTED" | "VERIFIED" | "REJECTED";
type Submission = {
  id: number;
  invoiceId: number;
  studentName: string;
  rollNumber: string;
  billingMonth: string;
  amount: number;
  sourceBankName: string;
  transactionId: string;
  paymentAccount: PaymentAccount | null;
  status: Status;
  reviewerNote: string | null;
  submittedAt: string;
  verifiedAt: string | null;
};
type Result = {
  records: Submission[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
const labels = {
  SUBMITTED: "Awaiting review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};
const colors = {
  SUBMITTED: "bg-amber-50 text-amber-800 ring-amber-200",
  VERIFIED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-red-50 text-red-700 ring-red-200",
};
const money = (amount: number) => `PKR ${amount.toLocaleString("en-PK")}`;
const date = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function PaymentSubmissionsPanel() {
  const [status, setStatus] = useState<Status | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setLoading(true);
        setError("");
      }
    });
    const params = new URLSearchParams({
      page: String(page),
      status,
      q: search,
    });
    api
      .get<Result>(`/api/institution/fees/submissions?${params}`, {
        signal: controller.signal,
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult(data);
          setPage(data.page);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : "Unable to load submissions",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, status, search, revision]);

  async function review(nextStatus: "VERIFIED" | "REJECTED") {
    if (!selected || saving) return;
    if (nextStatus === 'REJECTED' && note.trim().length < 2) { setReviewError('Enter at least 2 characters explaining why the payment is rejected.'); return; }
    setSaving(true);
    setReviewError("");
    try {
      await api.post("/api/institution/fees", {
        action: "reviewStudentPayment",
        submissionId: selected.id,
        status: nextStatus,
        note,
      });
      setSelected(null);
      setRevision((value) => value + 1);
    } catch (err) {
      setReviewError(
        err instanceof Error ? err.message : "Unable to review payment",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-50 p-3 text-brand-700">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-950">
                Payment submissions
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Review student and parent payments and their saved screenshots.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
            {loading ? "Loading…" : `${result?.total ?? 0} submissions`}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 bg-stone-50/60 px-6 py-4">
          <div className="flex flex-wrap gap-1" aria-label="Submission status">
            {(["ALL", "SUBMITTED", "VERIFIED", "REJECTED"] as const).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => {
                    setStatus(value);
                    setPage(1);
                  }}
                  className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-brand-600 ${status === value ? "bg-brand-950 text-white shadow-sm" : "text-stone-600 hover:bg-stone-200"}`}
                >
                  {value === "ALL" ? "All submissions" : labels[value]}
                </button>
              ),
            )}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" />
            <Input
              aria-label="Search payment submissions"
              placeholder="Student, roll, challan or transaction"
              className="bg-white pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        {error ? (
          <div role="alert" className="p-8 text-center text-red-700">
            {error}
            <Button
              variant="outline"
              className="ml-3 cursor-pointer"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div
            role="status"
            className="p-12 text-center text-sm text-stone-500"
          >
            Loading payment submissions…
          </div>
        ) : !result?.records.length ? (
          <div className="p-12 text-center">
            <FileCheck2 className="mx-auto mb-3 h-8 w-8 text-stone-300" />
            <p className="font-medium text-stone-700">No submissions found</p>
            <p className="mt-1 text-sm text-stone-500">
              {search || status !== "ALL"
                ? "Try a different search or status."
                : "Payments submitted by students or parents will appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-100 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  {[
                    "Student / challan",
                    "Payment",
                    "Submitted",
                    "Status",
                    "",
                  ].map((heading, index) => (
                    <th key={index} className="px-6 py-4 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {result.records.map((record) => (
                  <tr
                    key={record.id}
                    className="transition hover:bg-stone-50/70"
                  >
                    <td className="px-6 py-5">
                      <p className="font-semibold text-brand-950">
                        {record.studentName}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {record.rollNumber} · Challan {record.invoiceId} ·{" "}
                        {record.billingMonth}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <p className="font-semibold tabular-nums text-stone-800">
                        {money(record.amount)}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {record.paymentAccount?.providerName ||
                          record.sourceBankName}
                      </p>
                      <p
                        className="mt-1 max-w-56 truncate text-xs text-stone-500"
                        title={record.transactionId}
                      >
                        Txn: {record.transactionId}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-5 text-xs text-stone-500">
                      {date(record.submittedAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${colors[record.status]}`}
                      >
                        {labels[record.status]}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Button
                        variant="outline"
                        className="cursor-pointer whitespace-nowrap"
                        onClick={() => {
                          setSelected(record);
                          setNote("");
                          setReviewError("");
                        }}
                      >
                        {record.status === "SUBMITTED"
                          ? "Review payment"
                          : "View details"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-6 py-4 text-sm text-stone-500">
          <p>
            {!loading && !error && result?.total
              ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total}`
              : "20 submissions per page"}
          </p>
          <div className="flex items-center gap-3">
            <Button
              aria-label="Previous page"
              variant="outline"
              className="cursor-pointer"
              disabled={loading || !!error || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>
              Page {result?.page ?? 1} of {result?.totalPages ?? 1}
            </span>
            <Button
              aria-label="Next page"
              variant="outline"
              className="cursor-pointer"
              disabled={
                loading || !!error || !result || page >= result.totalPages
              }
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !saving) setSelected(null);
        }}
      >
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Payment details</DialogTitle>
            <DialogDescription>
              Check the saved screenshot and transaction before confirming
              collection.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className="flex items-start justify-between gap-3 rounded-xl bg-stone-50 p-4">
                <div>
                  <p className="font-semibold text-brand-950">
                    {selected.studentName}
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    Challan {selected.invoiceId} · {selected.billingMonth}
                  </p>
                  <p className="mt-3 text-xl font-semibold tabular-nums">
                    {money(selected.amount)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${colors[selected.status]}`}
                >
                  {labels[selected.status]}
                </span>
              </div>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                {[
                  [
                    "Payment account",
                    selected.paymentAccount?.providerName ||
                      selected.sourceBankName,
                  ],
                  [
                    "Account name",
                    selected.paymentAccount?.accountTitle || "—",
                  ],
                  [
                    "Account number",
                    selected.paymentAccount?.accountNumber || "—",
                  ],
                  ["Transaction ID", selected.transactionId],
                  ["Submitted", date(selected.submittedAt)],
                  [
                    "Reviewed",
                    selected.verifiedAt
                      ? date(selected.verifiedAt)
                      : "Awaiting review",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-stone-500">{label}</dt>
                    <dd className="mt-1 break-all font-medium text-stone-800">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <a
                href={`/api/institution/fees/files/${selected.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-100"
              >
                View saved payment screenshot
                <ExternalLink className="h-4 w-4" />
              </a>
              {selected.reviewerNote && (
                <div className="rounded-xl bg-stone-50 p-4 text-sm">
                  <p className="mb-1 text-xs text-stone-500">Review note</p>
                  <p className="whitespace-pre-wrap">{selected.reviewerNote}</p>
                </div>
              )}
              {selected.status === "SUBMITTED" && (
                <>
                  <label className="text-sm font-medium">
                    Review note{" "}
                    <span className="font-normal text-stone-500">
                      (required for rejection)
                    </span>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      maxLength={500}
                      disabled={saving}
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-stone-200 bg-white p-3 text-sm focus:outline-brand-500"
                      placeholder="Add a note for the student or parent"
                    />
                  </label>
                  {reviewError && (
                    <p role="alert" className="text-sm text-red-700">
                      {reviewError}
                    </p>
                  )}
                  <div className="flex justify-end gap-3 border-t border-stone-100 pt-4">
                    <Button
                      variant="outline"
                      className="cursor-pointer text-red-700 hover:bg-red-50"
                      disabled={saving}
                      onClick={() => void review("REJECTED")}
                    >
                      Reject payment
                    </Button>
                    <Button
                      className="cursor-pointer"
                      disabled={saving}
                      onClick={() => void review("VERIFIED")}
                    >
                      {saving ? "Saving…" : "Verify & collect"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
