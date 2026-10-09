"use client";


import { MonthlyBillingPanel, OneTimeBillingPanel } from "@/components/fees/BillingPanels";
import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import { useAbortableReads } from "@/lib/use-abortable-reads";
import { api } from "@/lib/api-client";
import { formatClassSection } from "@/lib/class-section-label";
import {
  Banknote,
  CalendarDays,
  CircleDollarSign,
  Plus,
  ReceiptText,
  Search,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";

type FeeHead = {
  id: number;
  name: string;
  kind: "RECURRING" | "ONE_TIME";
  isActive: boolean;
};
type SchoolClass = { id: number; name: string };
type ClassItem = {
  id: number;
  classId: number;
  feeHeadId: number;
  amount: number;
};
type Invoice = {
  id: number;
  studentId: number;
  studentName: string;
  loginRollNumber: string;
  className: string;
  sectionName: string;
  billingMonth: string;
  billingKind?: "MONTHLY" | "ONE_TIME";
  billingLabel?: string | null;
  dueDate: string;
  status: "DUE" | "PARTIAL" | "PAID" | "VOID";
  totalAmount: number;
  paidAmount: number;
  balance: number;
};

type Submission = {
  paymentAccount: import("@/lib/payment-account-types").PaymentAccount | null;
  id: number;
  invoiceId: number;
  amount: number;
  sourceBankName: string;
  transactionId: string;
  status: "SUBMITTED" | "VERIFIED" | "REJECTED";
  reviewerNote: string | null;
  submittedAt: string;
};
type FeesResponse = {
  classes: SchoolClass[];
  heads: FeeHead[];
  classItems: ClassItem[];
  invoices: Invoice[];
  pagination: { page: number; pageSize: number; total: number; pages: number };

  submissions: Submission[];
  summary: {
    invoiceCount: number;
    studentCount?: number;
    billed: number;
    collected: number;
    outstanding: number;
    defaulters: number;
  };
};
type FeesApiResponse = Partial<FeesResponse>;
type StudentOption = {
  id: number;
  name: string;
  loginRollNumber: string;
  className: string;
  sectionName: string;
};
type FeeSection = "setup" | "billing" | "collections" | "paid";

const currentMonth = new Date().toISOString().slice(0, 7);
const money = (amount: number) =>
  `PKR ${Number(amount || 0).toLocaleString("en-PK")}`;
const statusTone = (
  status: Invoice["status"],
): "default" | "secondary" | "destructive" | "outline" =>
  status === "PAID"
    ? "default"
    : status === "VOID"
      ? "secondary"
      : status === "DUE"
        ? "destructive"
        : "outline";

export function FeesManager({ mode }: { mode: FeeSection }) {
  const reads = useAbortableReads();
  const { toast } = useToast();
  const [data, setData] = useState<FeesResponse | null>(null);
  const [loading, setLoading] = useState(mode !== "billing");
  const [busy, setBusy] = useState(false);
  const [headToRemove, setHeadToRemove] = useState<FeeHead | null>(null);
  const removeHeadTrigger = useRef<HTMLButtonElement | null>(null);
  const cancelHeadRemoval = useRef<HTMLButtonElement | null>(null);
  const [month, setMonth] = useState(mode === "paid" ? "" : currentMonth);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [classId, setClassId] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(
    null,
  );

  const [reviewSubmission, setReviewSubmission] = useState<Submission | null>(
    null,
  );
  const [reviewNote, setReviewNote] = useState("");

  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetRollNumber, setResetRollNumber] = useState("");
  const [resetSearchBusy, setResetSearchBusy] = useState(false);
  const [resetAdjustments, setResetAdjustments] = useState<any[] | null>(null);
  const [resetError, setResetError] = useState("");

  const handleSearchAdjustments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetRollNumber.trim()) { setResetError('Student roll number is required.'); return; }
    setResetSearchBusy(true);
    setResetError("");
    setResetAdjustments(null);
    try {
      const res = (await api.post("/api/institution/fees", {
        action: "getAdjustmentsByRollNumber",
        rollNumber: resetRollNumber.trim(),
      })) as any;
      if (res.adjustments) {
        setResetAdjustments(res.adjustments);
      }
    } catch (err: any) {
      setResetError(err.message || "Failed to find student");
    } finally {
      setResetSearchBusy(false);
    }
  };

  const handleRemoveAdjustment = async (adjustmentId: number) => {
    setResetSearchBusy(true);
    try {
      await api.post("/api/institution/fees", {
        action: "removeAdjustment",
        adjustmentId,
      });
      setResetAdjustments((prev) => prev?.filter(a => a.id !== adjustmentId) || null);
      toast({ title: "Removed successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setResetSearchBusy(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const metadataLoaded = useRef(0);
  const summaryMonth = useRef<string | null>(null);
  const summaryLoadedAt = useRef(0);
  const readMonth = mode === 'collections' || mode === 'paid' ? month : '';
  const load = useCallback(
    async (parentSignal?: AbortSignal, force = false) => {
      const signal = reads.begin("fees", parentSignal);
      setLoading(true);
      try {
        const params = new URLSearchParams({ view: mode });
        if (Date.now() - metadataLoaded.current < 30_000 && !force) params.set("meta", "0");
        if (mode === "collections" && summaryMonth.current === readMonth && Date.now() - summaryLoadedAt.current < 10_000 && !force) params.set("summary", "0");
        if (mode === "collections" || mode === "paid") {
          params.set("page", String(page));
          if (readMonth) params.set("month", readMonth);
          if (status) params.set("status", status);
          if (debouncedQuery) params.set("q", debouncedQuery);
          if (classId) params.set("classId", classId);
        }
        const result = await api.get<FeesApiResponse>(
          `/api/institution/fees?${params}`,
          { signal },
        );
        if (signal?.aborted) return;
        if (result.classes) metadataLoaded.current = Date.now();
        if (result.summary) { summaryMonth.current = readMonth; summaryLoadedAt.current = Date.now(); }
        if (result.pagination && page > result.pagination.pages) { setPage(result.pagination.pages); return; }
        setData((current) => ({
          classes: result.classes ?? current?.classes ?? [],
          heads: result.heads ?? current?.heads ?? [],
          classItems: result.classItems ?? current?.classItems ?? [],
          invoices: result.invoices ?? current?.invoices ?? [],
          pagination: result.pagination ?? current?.pagination ?? { page: 1, pageSize: 50, total: 0, pages: 1 },

          submissions: result.submissions ?? current?.submissions ?? [],
          summary: result.summary ??
            current?.summary ?? {
              invoiceCount: 0,
              billed: 0,
              collected: 0,
              outstanding: 0,
              defaulters: 0,
            },
        }));

      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        toast({
          title: "Could not load fees",
          description:
            error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [mode, readMonth, status, classId, debouncedQuery, page, toast, reads],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        if (mode !== "billing" || studentQuery.trim().length < 2) {
          setStudentOptions([]);
          return;
        }
        try {
          const result = await api.get<{ students: StudentOption[] }>(
            `/api/institution/students/picker?q=${encodeURIComponent(studentQuery)}&limit=8`,
            { signal: controller.signal },
          );
          setStudentOptions(result.students);
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError"))
            setStudentOptions([]);
        }
      },
      studentQuery.trim().length < 2 ? 0 : 250,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mode, studentQuery]);

  const post = async (body: unknown, success: string) => {
    setBusy(true);
    try {
      const result = await api.post<Record<string, unknown>>(
        "/api/institution/fees",
        body,
      );
      toast({
        title: body && typeof body === "object" && "action" in body && body.action === "generateMonth" && result.created === 0 ? "No new challans created" : success,
        description:
          typeof result.created === "number"
            ? result.created === 0
              ? "Eligible students already have a challan for this billing month. Existing challans were skipped."
              : `${result.created} student invoices created.`
            : undefined,
        variant: "success",
      });
      await load(undefined, true);
      return true;
    } catch (error) {
      toast({
        title: "Action failed",
        description:
          error instanceof Error
            ? error.message
            : "Please check the information.",
        variant: "destructive",
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const recurringHeads = useMemo(
    () =>
      data?.heads.filter(
        (head) => head.kind === "RECURRING" && head.isActive,
      ) || [],
    [data],
  );
  const feeAmount = (classId: number, headId: number) =>
    data?.classItems.find(
      (item) => item.classId === classId && item.feeHeadId === headId,
    )?.amount;

  async function reviewStudentPayment(statusValue: "VERIFIED" | "REJECTED") {
    if (!reviewSubmission) return;
    if (statusValue === "REJECTED" && reviewNote.trim().length < 2) {
      toast({ title: 'Review note required', description: 'Enter at least 2 characters explaining why the payment is rejected.', variant: 'destructive' });
      return;
    }
    const okay = await post(
      {
        action: "reviewStudentPayment",
        submissionId: reviewSubmission.id,
        status: statusValue,
        note: reviewNote,
      },
      statusValue === "VERIFIED"
        ? "Payment verified and receipt created"
        : "Payment proof rejected",
    );
    if (okay) {
      setReviewSubmission(null);
      setReviewNote("");
    }
  }

  const createHead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (
      await post(
        {
          action: "createHead",
          name: form.get("name"),
          kind: form.get("kind"),
        },
        "Fee head added",
      )
    )
      formElement.reset();
  };

  const saveClassFee = async (
    classId: number,
    feeHeadId: number,
    input: HTMLInputElement,
  ) => {
    if (!input.reportValidity()) return;
    await post(
      {
        action: "setClassFee",
        classId,
        feeHeadId,
        amount: Number(input.value || 0),
      },
      "Class fee updated",
    );
  };

  const addAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStudent) { toast({ title: 'Student required', description: 'Select a student from the search results before saving the adjustment.', variant: 'destructive' }); return; }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (
      await post(
        {
          action: "addAdjustment",
          frequency: form.get("frequency"),
          startMonth: form.get("startMonth") || undefined,
          endMonth: form.get("endMonth") || undefined,
          studentId: selectedStudent.id,
          label: form.get("label"),
          type: form.get("type"),
          amount: form.get("amount"),
        },
        "Student adjustment saved",
      )
    ) {
      setSelectedStudent(null);
      setStudentQuery("");
      formElement.reset();
    }
  };

  const recordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedInvoice) return;
    const form = new FormData(event.currentTarget);
    const okay = await post(
      {
        action: "recordPayment",
        invoiceId: selectedInvoice.id,
        amount: form.get("amount"),
        method: form.get("method"),
        reference: form.get("reference"),
        notes: form.get("notes"),
      },
      "Payment recorded and receipt created",
    );
    if (okay) setSelectedInvoice(null);
  };

  return (
    <div className="space-y-7">
      {mode === "collections" && (
        <div className="overflow-x-auto pb-1">
          <div className="grid min-w-[850px] grid-cols-5 gap-3">
          {[
            {
              label: "Students billed",
              value: data?.summary.studentCount ?? data?.summary.invoiceCount ?? 0,
              Icon: Users,
            },
            {
              label: "Monthly billed",
              value: money(data?.summary.billed || 0),
              Icon: ReceiptText,
            },
            {
              label: "Collected",
              value: money(data?.summary.collected || 0),
              Icon: Banknote,
            },
            {
              label: "Outstanding",
              value: money(data?.summary.outstanding || 0),
              Icon: CircleDollarSign,
            },
            {
              label: "Overdue accounts",
              value: data?.summary.defaulters || 0,
              Icon: CalendarDays,
            },
          ].map(({ label, value, Icon }) => (
            <Card key={label} className="min-w-0">
              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase leading-4 tracking-wide text-stone-500">
                    {label}
                  </p>
                  <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                </div>
                <p className="whitespace-nowrap text-sm font-semibold tabular-nums leading-5 text-brand-950">
                  {String(value)}
                </p>
              </div>
            </Card>
          ))}
          </div>
        </div>
      )}

      {mode === "setup" && (
        <div>
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/60">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2 className="h-5 w-5 text-brand-600" /> Class fee
                structure
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-b border-border p-5">
                <form
                  onSubmit={createHead}
                  className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
                >
                  <Input
                    name="name"
                    required
                    minLength={2}
                    placeholder="Fee head, e.g. Tuition fee"
                  />
                  <select
                    name="kind"
                    className="h-11 rounded-sm border border-border bg-white px-3 text-left text-sm text-brand-950"
                  >
                    <option value="RECURRING">Every month</option>
                    <option value="ONE_TIME">One time</option>
                  </select>
                  <Button className="h-11 whitespace-nowrap" disabled={busy}>
                    <Plus className="mr-2 h-4 w-4" /> Add head
                  </Button>
                </form>
                <p className="mt-2 text-xs text-stone-500">
                  Monthly heads are included automatically. One-time heads are
                  kept available for special charges.
                </p>
              </div>
              {!loading && data && data.heads.some(head => head.isActive) && <div className="space-y-3 border-b border-border p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Your fee heads</p>
                {data.heads.filter(head => head.isActive).map(head => <div key={head.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-stone-50/50 p-3">
                  <p className="min-w-0 flex-1 break-words text-sm font-semibold text-brand-950">{head.name}</p>
                  <select aria-label={`Frequency for ${head.name}`} value={head.kind} disabled={busy} className="h-9 rounded-md border border-border bg-white px-2 text-sm" onChange={event => void post({ action: "updateHeadKind", feeHeadId: head.id, kind: event.target.value }, "Fee head updated")}>
                    <option value="RECURRING">Every month</option><option value="ONE_TIME">One time</option>
                  </select>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} className="cursor-pointer border-red-200 bg-white text-red-700 hover:border-red-600 hover:bg-red-600 hover:text-white" onClick={event => {
                    removeHeadTrigger.current = event.currentTarget;
                    setHeadToRemove(head);
                  }}><Trash2 className="mr-1.5 h-4 w-4" />Remove</Button>
                </div>)}
              </div>}
              {loading ? (
                <div className="p-8 text-center text-sm text-stone-500">
                  Loading fee structure…
                </div>
              ) : !data ||
                data.classes.length === 0 ||
                recurringHeads.length === 0 ? (
                <div className="p-8 text-center text-sm text-stone-500">
                  Create classes and at least one monthly fee head to prepare
                  the structure.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                      <tr>
                        <th className="px-5 py-3 text-left align-middle">
                          Class
                        </th>
                        {recurringHeads.map((head) => (
                          <th
                            key={head.id}
                            className="px-3 py-3 text-right align-middle"
                          >
                            {head.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.classes.map((schoolClass) => (
                        <tr key={schoolClass.id}>
                          <td className="px-5 py-3 text-left align-middle font-semibold text-brand-950">
                            {schoolClass.name}
                          </td>
                          {recurringHeads.map((head) => (
                            <td
                              key={head.id}
                              className="px-3 py-2 align-middle"
                            >
                              <div className="ml-auto flex w-fit items-center justify-end gap-2">
                                <span className="text-xs font-medium text-stone-400">
                                  PKR
                                </span>
                                <input
                                  aria-label={`${head.name} for ${schoolClass.name}`}
                                  type="number"
                                  min="0"
                                  max="10000000"
                                  required
                                  defaultValue={feeAmount(
                                    schoolClass.id,
                                    head.id,
                                  ) ?? ""}
                                  placeholder="Not set"
                                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (event.currentTarget.reportValidity()) event.currentTarget.blur(); } }}
                                  className="w-28 rounded-md border border-border px-2 py-1.5 text-right tabular-nums"
                                  onBlur={(event) => {
                                    if (
                                      Number(event.currentTarget.value) !==
                                      feeAmount(schoolClass.id, head.id)
                                    )
                                      void saveClassFee(
                                        schoolClass.id,
                                        head.id,
                                        event.currentTarget,
                                      );
                                  }}
                                />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>


        </div>
      )}

      {mode === "billing" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <MonthlyBillingPanel month={month} disabled={loading || !data || recurringHeads.length === 0} onIssued={async billingMonth=>{setMonth(billingMonth);await load(undefined, true);}} />

          <Card>
            <CardHeader className="border-b border-border bg-stone-50/60">
              <CardTitle className="text-lg leading-6">
                Student concession or charge
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <form onSubmit={addAdjustment} className="space-y-3 text-left">
                <div className="relative">
                  <Input
                    value={studentQuery}
                    onChange={(event) => {
                      setStudentQuery(event.target.value);
                      setSelectedStudent(null);
                    }}
                    placeholder="Search student name or roll number"
                  />
                  {studentOptions.length > 0 && !selectedStudent && (
                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-white shadow-lg">
                      {studentOptions.map((student) => (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudent(student);
                            setStudentQuery(
                              `${student.name} — ${formatClassSection(student.className, student.sectionName)}`,
                            );
                            setStudentOptions([]);
                          }}
                          className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-stone-50"
                        >
                          <span className="font-medium">{student.name}</span>
                          <span className="mt-0.5 block text-xs leading-4 text-stone-500">
                            {student.loginRollNumber} · {formatClassSection(student.className, student.sectionName)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Input
                  name="label"
                  required
                  placeholder="Reason, e.g. Sibling concession"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select
                    name="type"
                    className="h-11 rounded-sm border border-border bg-white px-3 text-left text-sm text-brand-950"
                  >
                    <option value="DISCOUNT">Discount</option>
                    <option value="CHARGE">Extra charge</option>
                  </select>
                  <Input
                    name="amount"
                    className="text-right tabular-nums"
                    type="number"
                    min="1"
                    required
                    placeholder="Amount"
                  />
                </div>
                <label className="block space-y-1.5 text-sm"><span>Apply adjustment</span><select name="frequency" className="h-11 w-full rounded-sm border border-border bg-white px-3"><option value="ONCE">Once ? next eligible monthly challan</option><option value="RECURRING">Every month within the dates below</option></select></label>
                <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5 text-sm"><span>From month</span><Input type="month" name="startMonth" defaultValue={month} required /></label><label className="block space-y-1.5 text-sm"><span>Until month (optional)</span><Input type="month" name="endMonth" /></label></div>
                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    className="h-11 w-[70%]"
                    disabled={busy}
                  >
                    Save adjustment
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 w-[30%]"
                    type="button"
                    onClick={() => {
                      setResetDialogOpen(true);
                      setResetRollNumber("");
                      setResetAdjustments(null);
                      setResetError("");
                    }}
                  >
                    Reset
                  </Button>
                </div>
                <p className="text-xs leading-5 text-stone-500">
                  Applies to future challans; already issued challans remain
                  unchanged for clean records.
                </p>
              </form>
            </CardContent>
          </Card>
          <OneTimeBillingPanel month={month} heads={(data?.heads || []).filter(head=>head.isActive && head.kind === "ONE_TIME")} classes={data?.classes || []} onIssued={async billingMonth=>{setMonth(billingMonth);await load(undefined, true);}} />
        </div>
      )}

      {(mode === "collections" || mode === "paid") && (
        <Card>
          <CardHeader className="border-b border-border bg-stone-50/60">
            <div className="flex flex-col gap-4">
              <div className="text-left">
                <CardTitle className="text-lg leading-6">
                  {mode === "paid"
                    ? "Paid fees / challans"
                    : "Collection register"}
                </CardTitle>
                <p className="mt-1 text-sm leading-5 text-stone-500">
                  {mode === "paid"
                    ? "Paid challans grouped by billing month. 50 records per page."
                    : "50 unpaid challans per page. Fully paid challans appear in Paid fees / challans."}
                </p>
              </div>
              {mode === "collections" && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[160px_140px_minmax(180px,1fr)_180px]">
                  <Input
                    type="month"
                    aria-label="Billing month"
                    value={month}
                    onChange={(event) => { setMonth(event.target.value); setPage(1); }}
                    className="w-full min-w-0 tabular-nums"
                  />
                  <select
                    aria-label="Payment status"
                    value={status}
                    onChange={(event) => { setStatus(event.target.value); setPage(1); }}
                    className="h-11 rounded-sm border border-border bg-white px-3 text-left text-sm text-brand-950"
                  >
                    <option value="">All unpaid statuses</option>
                    <option value="DUE">Due</option>
                    <option value="PARTIAL">Partial</option>
                  </select>
                  <div className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-stone-400" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-9"
                      placeholder="Student or roll no."
                      aria-label="Search students"
                    />
                  </div>
                  <select
                    aria-label="Class"
                    value={classId}
                    onChange={(event) => { setClassId(event.target.value); setPage(1); }}
                    className="h-11 min-w-0 rounded-sm border border-border bg-white px-3 text-left text-sm text-brand-950"
                  >
                    <option value="">All classes</option>
                    {data?.classes.map((schoolClass) => (
                      <option key={schoolClass.id} value={schoolClass.id}>
                        {schoolClass.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {mode === "paid" && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[220px_180px_minmax(180px,1fr)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <Input type="month" aria-label="Billing month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }} className="min-w-0 flex-1 tabular-nums" />
                    {month ? <Button type="button" variant="ghost" size="sm" className="shrink-0 cursor-pointer" onClick={() => { setMonth(""); setPage(1); }}>Clear</Button> : <span className="shrink-0 text-xs text-stone-500">All months</span>}
                  </div>
                  <select aria-label="Class" value={classId} onChange={(event) => { setClassId(event.target.value); setPage(1); }} className="h-11 min-w-0 rounded-sm border border-border bg-white px-3 text-left text-sm text-brand-950">
                    <option value="">All classes</option>
                    {data?.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
                  </select>
                  <div className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-stone-400" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Student or roll no." aria-label="Search students" />
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center text-sm text-stone-500">
                Loading fee register…
              </div>
            ) : !data?.invoices.length ? (
              <div className="p-10 text-center">
                <ReceiptText className="mx-auto h-9 w-9 text-stone-300" />
                <p className="mt-3 font-medium text-stone-700">
                  No challans found
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {mode === "paid" ? "Try another month, class or student search. Fully paid challans appear here." : "No unpaid challans match these filters."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-5 py-3 text-left align-middle">
                        Student
                      </th>
                      <th className="px-3 py-3 text-left align-middle">
                        Class
                      </th>
                      <th className="px-3 py-3 text-left align-middle">Due</th>
                      <th className="px-3 py-3 text-right align-middle">
                        Total
                      </th>
                      <th className="px-3 py-3 text-right align-middle">
                        Balance
                      </th>
                      <th className="px-3 py-3 text-center align-middle">
                        Status
                      </th>
                      <th className="px-5 py-3 text-right align-middle">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.invoices.map((invoice, index) => {
                      const pendingSubmission = data.submissions.find(
                        (submission) =>
                          submission.invoiceId === invoice.id &&
                          submission.status === "SUBMITTED",
                      );
                      return (
                        <Fragment key={invoice.id}>
                        {mode === "paid" && (index === 0 || data.invoices[index - 1].billingMonth !== invoice.billingMonth) && <tr className="bg-stone-100/70"><th colSpan={7} scope="colgroup" className="px-5 py-3 text-left text-sm font-semibold text-brand-950">{new Date(`${invoice.billingMonth}-01T00:00:00`).toLocaleDateString("en-PK", { month: "long", year: "numeric" })}</th></tr>}
                        <tr key={invoice.id} className="hover:bg-stone-50/60">
                          <td className="px-5 py-3 text-left align-middle">
                            <p className="font-semibold leading-5 text-brand-950">
                              {invoice.studentName}
                            </p>
                            <p className="mt-0.5 text-xs leading-4 text-stone-500">
                              {invoice.loginRollNumber}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-left align-middle">
                            {formatClassSection(invoice.className, invoice.sectionName, " · ")}
                            {invoice.billingKind === "ONE_TIME" && <span className="mt-1 block break-words text-xs text-stone-500">One-time: {invoice.billingLabel}</span>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-left align-middle tabular-nums">
                            {new Date(
                              `${invoice.dueDate}T00:00:00`,
                            ).toLocaleDateString("en-PK")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right align-middle tabular-nums">
                            {money(invoice.totalAmount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right align-middle font-semibold tabular-nums">
                            {money(invoice.balance)}
                          </td>
                          <td className="px-3 py-3 text-center align-middle">
                            <Badge variant={statusTone(invoice.status)}>
                              {invoice.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-3 text-right align-middle">
                            {pendingSubmission && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setReviewSubmission(pendingSubmission);
                                  setReviewNote("");
                                }}
                              >
                                Review proof
                              </Button>
                            )}
                            {mode === "collections" && !pendingSubmission && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  invoice.status === "PAID" ||
                                  invoice.status === "VOID"
                                }
                                onClick={() => setSelectedInvoice(invoice)}
                              >
                                Collect
                              </Button>
                            )}
                          </td>
                        </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {data && !loading && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-sm">
              <span>{data.pagination.total.toLocaleString()} challans · Page {page} of {data.pagination.pages}</span>
              <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={busy || page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button type="button" size="sm" variant="outline" disabled={busy || page >= data.pagination.pages} onClick={() => setPage(page + 1)}>Next</Button></div>
            </div>}
          </CardContent>
        </Card>
      )}

      {reviewSubmission && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setReviewSubmission(null);
          }}
        >
          <Card className="w-full max-w-lg">
            <CardHeader className="border-b text-left">
              <CardTitle>Verify student payment</CardTitle>
              <p className="mt-1 text-sm text-stone-500">
                Match the source bank, transaction ID, amount, and receipt
                before approving.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 p-6 text-left">
              <dl className="grid gap-3 rounded-lg bg-stone-50 p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-stone-500">Amount</dt>
                  <dd className="font-bold">
                    {money(reviewSubmission.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">
                    Source bank / wallet
                  </dt>
                  <dd className="font-semibold">
                    {reviewSubmission.sourceBankName}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-stone-500">Transaction ID</dt>
                  <dd className="break-all font-mono font-bold">
                    {reviewSubmission.transactionId}
                  </dd>
                </div>
              </dl>
              {reviewSubmission.paymentAccount && <p className="rounded border p-3 text-sm">Paid to: {reviewSubmission.paymentAccount.providerName} · {reviewSubmission.paymentAccount.accountTitle} · {reviewSubmission.paymentAccount.accountNumber}</p>}
              <a
                href={`/api/institution/fees/files/${reviewSubmission.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block font-semibold text-brand-700 underline"
              >
                Open submitted receipt
              </a>
              <label className="block text-sm font-semibold">
                Review note
                <textarea
                  rows={3}
                  maxLength={500}
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-border px-3 py-2 font-normal"
                  placeholder="Optional when verifying; required when rejecting"
                />
              </label>
              <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setReviewSubmission(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => void reviewStudentPayment("REJECTED")}
                >
                  Reject proof
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void reviewStudentPayment("VERIFIED")}
                >
                  Verify & create receipt
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedInvoice(null);
          }}
        >
          <Card className="w-full max-w-lg">
            <CardHeader className="border-b border-border text-left">
              <CardTitle className="leading-6">Record payment</CardTitle>
              <p className="mt-1 text-sm leading-5 text-stone-500">
                {selectedInvoice.studentName} · Balance{" "}
                <span className="whitespace-nowrap font-semibold tabular-nums text-stone-700">
                  {money(selectedInvoice.balance)}
                </span>
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={recordPayment} className="space-y-4 text-left">
                <label className="block text-sm font-medium leading-5">
                  Amount received
                  <Input
                    className="mt-1.5 text-right tabular-nums"
                    name="amount"
                    type="number"
                    min="1"
                    max={selectedInvoice.balance}
                    defaultValue={selectedInvoice.balance}
                    required
                  />
                </label>
                <label className="block text-sm font-medium leading-5">
                  Payment method
                  <select
                    name="method"
                    className="mt-1.5 h-11 w-full rounded-sm border border-border bg-white px-3 text-left text-sm text-brand-950"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank transfer</option>
                    <option value="EASYPAISA">Easypaisa</option>
                    <option value="JAZZCASH">JazzCash</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <Input
                  name="reference"
                  placeholder="Transaction/reference number (optional)"
                />
                <Input name="notes" placeholder="Notes (optional)" />
                <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedInvoice(null)}
                  >
                    Cancel
                  </Button>
                  <Button disabled={busy}>Record & create receipt</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
      <Dialog open={headToRemove !== null} onOpenChange={open => { if (!open && !busy) setHeadToRemove(null); }}>
        <DialogContent className="max-w-md" onOpenAutoFocus={event => { event.preventDefault(); cancelHeadRemoval.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); removeHeadTrigger.current?.focus(); }}>
          <DialogHeader>
            <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600"><Trash2 className="h-5 w-5" /></span>
            <DialogTitle>Remove fee head?</DialogTitle>
            <DialogDescription className="pt-2 leading-6">
              Remove <strong className="break-words font-semibold text-stone-800">{headToRemove?.name}</strong> from your fee structure? Existing challans and payment records will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button ref={cancelHeadRemoval} type="button" variant="outline" className="cursor-pointer" disabled={busy} onClick={() => setHeadToRemove(null)}>Cancel</Button>
            <Button type="button" variant="danger" className="cursor-pointer" disabled={busy} onClick={async () => {
              if (!headToRemove) return;
              const removed = await post({ action: "removeHead", feeHeadId: headToRemove.id }, "Fee head removed");
              if (removed) setHeadToRemove(null);
            }}>{busy ? "Removing…" : "Remove fee head"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Concessions / Extra Charges</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSearchAdjustments} className="flex gap-2">
            <Input
              placeholder="Roll number"
              value={resetRollNumber}
              onChange={(e) => setResetRollNumber(e.target.value)}
              disabled={resetSearchBusy}
              required
            />
            <Button type="submit" disabled={resetSearchBusy}>
              {resetSearchBusy ? "Searching..." : "Search"}
            </Button>
          </form>
          {resetError && <p className="text-sm text-red-600">{resetError}</p>}
          {resetAdjustments && (
            <div className="mt-4 space-y-3">
              {resetAdjustments.length === 0 ? (
                <p className="text-sm text-stone-500">No active adjustments found.</p>
              ) : (
                resetAdjustments.map((adj) => (
                  <div key={adj.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium text-sm">{adj.label} <span className="text-stone-500 text-xs">({adj.type})</span></p>
                        <p className="text-xs font-bold tabular-nums">Rs {adj.amount.toLocaleString()}</p>
                        <p className="mt-1 text-xs text-stone-500">{adj.frequency === "ONCE" ? adj.consumedInvoiceId ? "Once — already applied" : "Once — pending" : "Every month"} · {adj.startMonth || "No start limit"} to {adj.endMonth || "No end limit"}</p>
                    </div>
                    <Button 
                      variant="danger" 
                      size="sm" 
                      disabled={resetSearchBusy}
                      onClick={() => handleRemoveAdjustment(adj.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
