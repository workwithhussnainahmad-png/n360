"use client";

import { PaymentHistory } from "@/components/PaymentHistory";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { displaySectionName } from "@/lib/class-section-label";

type ApplicationSummary = {
  campusId: number | null;
  campusName: string;
  id: number;
  cycleId: number;
  offeringId: number;
  applicationNumber: string;
  studentName: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  status: string;
  submittedAt: string;
  offeringTitle: string;
  cycleName: string;
};

type AdmissionsOperations = {
  campuses: Array<{ id: number; name: string }>;
  stats: Record<string, number>;
  capacity: Array<{
    offeringId: number;
    title: string;
    cycleId: number;
    capacity: number | null;
    activeApplications: number;
    enrolled: number;
  }>;
  cycles: Array<{
    id: number;
    name: string;
    academicYear: string;
    status: string;
  }>;
  offerings: Array<{
    id: number;
    cycleId: number;
    title: string;
    isActive: boolean;
  }>;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

type ApplicationDetail = {
  application: ApplicationSummary & {
    canResetApplicantCredentials: boolean;
    dateOfBirth: string;
    gender: string;
    previousInstitution: string | null;
    previousClassMarks: string | null;
    medicalInformation: string | null;
    notes: string | null;
    requiresTest: boolean;
    requiresInterview: boolean;
  };
  documents: Array<{
    id: number;
    documentName: string;
    instructions: string | null;
    status: string;
    submittedFileKey: string | null;
    reviewerNote: string | null;
  }>;
  appointments: Array<{
    id: number;
    type: "TEST" | "INTERVIEW";
    scheduledAt: string;
    location: string;
    instructions: string | null;
    outcome: string;
    outcomeNote: string | null;
  }>;
  events: Array<{
    id: number;
    title: string;
    description: string | null;
    createdAt: string;
  }>;
  feePayment: {
    id: number;
    amount: number;
    dueDate: string | null;
    instructions: string;
    bankName: string | null;
    accountNumber: string | null;
    qrUrl: string | null;
    paymentMethods: Array<{
      id: string;
      providerName: string;
      accountTitle: string;
      accountNumber: string;
      qrUrl: string | null;
    }>;
    payerReference: string | null;
    payerSourceBank: string | null;
    proofFileKey: string | null;
    status: string;
    reviewerNote: string | null;
  } | null;
  enrollment: {
    id: number;
    studentId: number;
    loginRollNumber: string;
    createdAt: string;
  } | null;
  options: {
    campuses: Array<{ id: number; name: string }>;
    classes: Array<{ id: number; name: string }>;
    sections: Array<{ id: number; classId: number; name: string }>;
  };
};

const labels: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  DOCUMENTS_REQUIRED: "Documents required",
  TEST_SCHEDULED: "Test scheduled",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  DECISION_PENDING: "Decision pending",
  OFFERED: "Offered",
  REJECTED: "Not accepted",
  FEE_PENDING: "Fee pending",
  FEE_VERIFICATION: "Fee verification",
  FEE_VERIFIED: "Fee verified",
  REFUND_REQUIRED: "Refund required",
  ENROLLED: "Enrolled",
  WITHDRAWN: "Withdrawn",
};

const fieldClass =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500";
const inactiveApplicationStatuses = new Set(["REJECTED", "WITHDRAWN"]);
type ActionDialog = {
  title: string;
  description?: string;
  label?: string;
  required?: boolean;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (value: string) => unknown | Promise<unknown>;
};

export function ApplicationsReviewPanel({
  offlineOnly = false,
}: {
  offlineOnly?: boolean;
}) {
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(!offlineOnly);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [credentials, setCredentials] = useState<{
    loginRollNumber: string;
    temporaryPassword: string;
  } | null>(null);
  const [credentialTitle, setCredentialTitle] = useState(
    "Permanent student account",
  );
  const [enrollmentClassId, setEnrollmentClassId] = useState("");
  const [operations, setOperations] = useState<AdmissionsOperations>({
    campuses: [],
    stats: {},
    capacity: [],
    cycles: [],
    offerings: [],
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("SUBMITTED");
  const [cycleFilter, setCycleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 30,
    total: 0,
    pages: 1,
  });
  const [manualCredentials, setManualCredentials] = useState<{
    loginId: string;
    temporaryPassword: string;
  } | null>(null);
  const metadataLoaded = useRef(false);
  const [actionDialog, setActionDialog] = useState<ActionDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");

  function openDialog(dialog: ActionDialog) {
    setDialogValue("");
    setActionDialog(dialog);
  }
  async function confirmDialog() {
    if (!actionDialog || (actionDialog.required && !dialogValue.trim())) return;
    const current = actionDialog;
    const result = await current.onConfirm(dialogValue.trim());
    if (result !== null) setActionDialog(null);
  }

  const loadList = useCallback(
    async (signal?: AbortSignal, forceMetadata = false) => {
      const query = new URLSearchParams({ page: String(page), pageSize: "30" });
      if (debouncedSearch) query.set("q", debouncedSearch);
      if (statusFilter) query.set("status", statusFilter);
      if (cycleFilter) query.set("cycle", cycleFilter);
      if (forceMetadata || !metadataLoaded.current) query.set("meta", "1");
      const response = await fetch(
        `/api/institution/admissions/applications?${query}`,
        { cache: "no-store", signal },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to load applications");
      setApplications(data.applications);
      setPagination(data.pagination);
      setOperations((current) => ({
        campuses: data.campuses || current.campuses,
        stats: data.stats || current.stats,
        capacity: data.capacity || current.capacity,
        cycles: data.cycles || current.cycles,
        offerings: data.offerings || current.offerings,
      }));
      if (data.capacity) metadataLoaded.current = true;
      return data as { applications: ApplicationSummary[] };
    },
    [cycleFilter, debouncedSearch, page, statusFilter],
  );

  const loadDetail = useCallback(async (id: number, signal?: AbortSignal) => {
    const response = await fetch(
      `/api/institution/admissions/applications/${id}`,
      { cache: "no-store", signal },
    );
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to load application");
    setDetail(data);
  }, []);

  const loadOfflineOptions = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/institution/admissions?intake=1", {
      cache: "no-store",
      signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to load admission options");
    setOperations((current) => ({
      ...current,
      cycles: data.cycles || [],
      offerings: data.offerings || [],
      campuses: data.campuses || [],
    }));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      (offlineOnly
        ? loadOfflineOptions(controller.signal)
        : loadList(controller.signal)
      )
        .catch((error) => {
          if (error.name !== "AbortError")
            setMessage({ kind: "error", text: error.message });
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadList, loadOfflineOptions, offlineOnly]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (offlineOnly || !selectedId) {
        setDetail(null);
        return;
      }
      setDetail(null);
      setCredentials(null);
      setCredentialTitle("Permanent student account");
      setEnrollmentClassId("");
      loadDetail(selectedId, controller.signal).catch((error) => {
        if (error.name !== "AbortError")
          setMessage({ kind: "error", text: error.message });
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selectedId, loadDetail, offlineOnly]);

  async function act(body: Record<string, unknown>) {
    if (!selectedId) return null;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/institution/admissions/applications/${selectedId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        status?: string;
        credentials?: { loginRollNumber: string; temporaryPassword: string };
        applicantCredentials?: { loginId: string; temporaryPassword: string };
      };
      if (!response.ok)
        throw new Error(data.error || "Unable to update application");
      const previous = applications.find(
        (application) => application.id === selectedId,
      );
      if (data.status === "ENROLLED" && previous) {
        setApplications((current) =>
          current.filter((application) => application.id !== selectedId),
        );
        setSelectedId(null);
      } else if (
        data.status &&
        previous &&
        (!statusFilter || data.status === statusFilter)
      ) {
        setApplications((current) =>
          current.map((application) =>
            application.id === selectedId
              ? { ...application, status: data.status! }
              : application,
          ),
        );
        if (previous.status !== data.status) {
          setOperations((current) => ({
            ...current,
            stats: {
              ...current.stats,
              [previous.status]: Math.max(
                0,
                (current.stats[previous.status] || 0) - 1,
              ),
              [data.status!]: (current.stats[data.status!] || 0) + 1,
            },
            capacity: current.capacity.map((item) => {
              if (item.offeringId !== previous.offeringId) return item;
              const wasActive = !inactiveApplicationStatuses.has(
                previous.status,
              );
              const isActive = !inactiveApplicationStatuses.has(data.status!);
              return {
                ...item,
                activeApplications: Math.max(
                  0,
                  item.activeApplications +
                    Number(isActive) -
                    Number(wasActive),
                ),
                enrolled: Math.max(
                  0,
                  item.enrolled +
                    (data.status === "ENROLLED" &&
                    previous.status !== "ENROLLED"
                      ? 1
                      : 0),
                ),
              };
            }),
          }));
        }
        await loadDetail(selectedId);
      } else if (data.status && previous) {
        // A status-filtered queue may need a replacement row from the next page.
        await loadList(undefined, true);
        await loadDetail(selectedId);
      } else {
        // Credential resets do not change list data.
        await loadDetail(selectedId);
      }
      setMessage({
        kind: "success",
        text: "Application updated and the applicant was notified.",
      });
      if (data.applicantCredentials) {
        setCredentialTitle("Applicant portal credentials");
        setCredentials({
          loginRollNumber: data.applicantCredentials.loginId,
          temporaryPassword: data.applicantCredentials.temporaryPassword,
        });
      }
      window.dispatchEvent(new Event("admissions:updated"));
      return data;
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to update application",
      });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function requestDocuments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const documents = String(data.get("documents") || "")
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({
        name,
        instructions: String(data.get("documentInstructions") || ""),
      }));
    if (await act({ action: "requestDocuments", documents })) form.reset();
  }

  async function schedule(
    event: FormEvent<HTMLFormElement>,
    type: "TEST" | "INTERVIEW",
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const localDate = new Date(String(data.get("scheduledAt")));
    if (
      await act({
        action: "scheduleAppointment",
        type,
        scheduledAt: localDate.toISOString(),
        location: data.get("location"),
        instructions: data.get("instructions"),
      })
    )
      form.reset();
  }

  function outcome(
    type: "TEST" | "INTERVIEW",
    result: "PASSED" | "FAILED" | "ABSENT",
  ) {
    openDialog({
      title: `Record ${result.toLowerCase()} result`,
      description: `This updates the applicant's ${type.toLowerCase()} result.`,
      label: "Optional result note",
      confirmLabel: "Save result",
      onConfirm: (note) =>
        act({ action: "recordOutcome", type, outcome: result, note }),
    });
  }

  function decision(decisionValue: "OFFERED" | "REJECTED") {
    openDialog({
      title:
        decisionValue === "OFFERED"
          ? "Offer admission"
          : "Do not accept application",
      description: "The applicant will receive this update.",
      label:
        decisionValue === "OFFERED"
          ? "Offer instructions or next steps"
          : "Decision note",
      required: true,
      confirmLabel:
        decisionValue === "OFFERED" ? "Send offer" : "Save decision",
      danger: decisionValue === "REJECTED",
      onConfirm: (note) =>
        act({ action: "decision", decision: decisionValue, note }),
    });
  }

  function reviewDocument(documentId: number, status: "VERIFIED" | "REJECTED") {
    openDialog({
      title:
        status === "VERIFIED"
          ? "Verify submitted document"
          : "Request document again",
      description:
        status === "VERIFIED"
          ? "Confirm that the uploaded document is readable and correct."
          : "Tell the applicant what must be corrected.",
      label:
        status === "VERIFIED"
          ? "Optional verification note"
          : "Correction required",
      required: status === "REJECTED",
      confirmLabel: status === "VERIFIED" ? "Verify document" : "Request again",
      danger: status === "REJECTED",
      onConfirm: (note) =>
        act({ action: "reviewDocument", documentId, status, note }),
    });
  }

  async function initiateFee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await act({
      action: "initiateFee",
      amount: Number(data.get("amount")),
      dueDate: data.get("dueDate"),
      instructions: data.get("feeInstructions"),
    });
  }

  function reviewFee(status: "VERIFIED" | "REJECTED") {
    openDialog({
      title:
        status === "VERIFIED"
          ? "Verify admission payment"
          : "Reject payment proof",
      description:
        status === "VERIFIED"
          ? "Confirm the amount, receiving account, source bank, and transaction ID before verification."
          : "Tell the applicant why the proof must be submitted again.",
      label:
        status === "VERIFIED"
          ? "Optional verification note"
          : "Reason for rejection",
      required: status === "REJECTED",
      confirmLabel: status === "VERIFIED" ? "Verify payment" : "Reject proof",
      danger: status === "REJECTED",
      onConfirm: (note) => act({ action: "reviewFee", status, note }),
    });
  }

  async function enrollStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await act({
      action: "enrollStudent",
      campusId: data.get("campusId") ? Number(data.get("campusId")) : null,
      classId: Number(data.get("classId")),
      sectionId: data.get("sectionId") ? Number(data.get("sectionId")) : null,
      classRollNumber: data.get("classRollNumber"),
      yearOfJoining: Number(data.get("yearOfJoining")),
    });
    if (result?.credentials) {
      setCredentialTitle("Permanent student account");
      setCredentials(result.credentials);
    }
  }

  async function createManualApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage(null);
    setManualCredentials(null);
    try {
      const response = await fetch("/api/institution/admissions/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offeringId: Number(data.get("offeringId")),
          campusId: operations.campuses[0]?.id ?? null,
          studentName: data.get("studentName"),
          dateOfBirth: data.get("dateOfBirth"),
          gender: data.get("gender"),
          guardianName: data.get("guardianName"),
          guardianEmail: data.get("guardianEmail"),
          guardianPhone: data.get("guardianPhone"),
          previousInstitution: data.get("previousInstitution"),
          previousClassMarks: data.get("previousClassMarks"),
          medicalInformation: data.get("medicalInformation"),
          notes: data.get("notes"),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to record application");
      await loadList(undefined, true);
      setSelectedId(result.application.id);
      setManualCredentials(result.applicantCredentials);
      setMessage({
        kind: "success",
        text: "Application recorded successfully.",
      });
      form.reset();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to record application",
      });
    } finally {
      setBusy(false);
    }
  }

  async function acceptAllNewApplications() {
    if (statusFilter !== "SUBMITTED" || debouncedSearch) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        "/api/institution/admissions/applications/bulk-accept",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirm: true,
            cycleId: cycleFilter ? Number(cycleFilter) : null,
          }),
        },
      );
      const data = (await response.json()) as {
        accepted?: number;
        skipped?: number;
        failed?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Unable to accept new applications");
      await loadList(undefined, true);
      setMessage({
        kind: "success",
        text: `${data.accepted || 0} application${data.accepted === 1 ? "" : "s"} accepted and moved into their next admission step.${data.skipped ? ` ${data.skipped} already changed and were skipped.` : ""}${data.failed ? ` ${data.failed} could not be accepted; review them individually.` : ""}`,
      });
      window.dispatchEvent(new Event("admissions:updated"));
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to accept new applications",
      });
    } finally {
      setBusy(false);
    }
  }

  function confirmAcceptAllNewApplications() {
    const count = pagination.total;
    if (count < 1) return;
    openDialog({
      title: `Accept ${count} new application${count === 1 ? "" : "s"}?`,
      description:
        "Each application will enter its configured next step. Required documents, scheduled tests, or interviews will be created automatically. This cannot be undone in bulk.",
      confirmLabel: `Accept ${count} application${count === 1 ? "" : "s"}`,
      onConfirm: acceptAllNewApplications,
    });
  }

  function exportCsv() {
    const escape = (value: unknown) => {
      const raw = String(value ?? "");
      const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [
      [
        "Application number",
        "Student",
        "Guardian",
        "Email",
        "Phone",
        "Cycle",
        "Offering",
        "Status",
        "Submitted",
      ],
      ...applications.map((application) => [
        application.applicationNumber,
        application.studentName,
        application.guardianName,
        application.guardianEmail,
        application.guardianPhone,
        application.cycleName,
        application.offeringTitle,
        labels[application.status] || application.status,
        new Date(application.submittedAt).toISOString(),
      ]),
    ];
    const blob = new Blob(
      [rows.map((row) => row.map(escape).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `admission-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function withdrawApplication() {
    openDialog({
      title: "Withdraw application",
      description:
        "This removes the application from the active admission process.",
      label: "Reason for withdrawal",
      required: true,
      confirmLabel: "Withdraw application",
      danger: true,
      onConfirm: (reason) => act({ action: "withdrawApplication", reason }),
    });
  }

  function resetCredential(
    action: "resetApplicantPassword" | "resetStudentPassword",
  ) {
    openDialog({
      title: "Issue new temporary password",
      description:
        "The previous password and active sessions will be invalidated.",
      confirmLabel: "Issue password",
      onConfirm: async () => {
        const result = await act({ action });
        if (result?.credentials) {
          setCredentialTitle(
            action === "resetApplicantPassword"
              ? "Applicant portal password reset"
              : "Student password reset",
          );
          setCredentials(result.credentials);
        }
        return result;
      },
    });
  }

  const totalApplicationCount = Object.values(operations.stats).reduce(
    (total, count) => total + count,
    0,
  );
  const queueFilters = [
    {
      value: "SUBMITTED",
      label: "New",
      count: operations.stats.SUBMITTED || 0,
    },
    {
      value: "DOCUMENTS_REQUIRED",
      label: "Documents",
      count: operations.stats.DOCUMENTS_REQUIRED || 0,
    },
    {
      value: "DECISION_PENDING",
      label: "Decision",
      count: operations.stats.DECISION_PENDING || 0,
    },
    {
      value: "FEE_VERIFICATION",
      label: "Verify fee",
      count: operations.stats.FEE_VERIFICATION || 0,
    },
    {
      value: "",
      label: "All applications",
      count: totalApplicationCount,
    },
  ];

  if (offlineOnly)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Offline applications</CardTitle>
          <p className="text-sm text-stone-500">
            Record an application for a parent or guardian who applied at the
            institution.
          </p>
        </CardHeader>
        <CardContent>
          {credentials && (
            <section className="mb-6 rounded-xl bg-brand-950 p-5 text-white">
              <h4 className="font-semibold">{credentialTitle}</h4>
              <p className="mt-3 text-xs text-white/70">Login ID</p>
              <p className="break-all font-mono font-bold">
                {credentials.loginRollNumber}
              </p>
              <p className="mt-3 text-xs text-white/70">
                Temporary one-time password — copy it now
              </p>
              <p className="font-mono text-lg font-bold">
                {credentials.temporaryPassword}
              </p>
              <p className="mt-2 text-xs text-white/70">
                The student must change this password after the first login. It
                was also emailed to the guardian when email is configured.
              </p>
            </section>
          )}
          {message && (
            <div
              className={`mb-5 rounded-lg px-4 py-3 text-sm ${message.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
            >
              {message.text}
            </div>
          )}
          <form
            onSubmit={createManualApplication}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <p className="text-sm"><strong>Campus name:</strong> {operations.campuses[0]?.name}</p>
            <select required name="offeringId" className={fieldClass}>
              <option value="">Select offering</option>
              {operations.offerings
                .filter((offering) => offering.isActive)
                .map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {operations.cycles.find(
                      (cycle) => cycle.id === offering.cycleId,
                    )?.name || "Cycle"}{" "}
                    / {offering.title}
                  </option>
                ))}
            </select>
            <input
              required
              name="studentName"
              maxLength={255}
              className={fieldClass}
              placeholder="Student full name"
            />
            <input
              required
              name="dateOfBirth"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              className={fieldClass}
            />
            <select required name="gender" className={fieldClass}>
              <option value="">Gender</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
            <input
              required
              name="guardianName"
              maxLength={255}
              className={fieldClass}
              placeholder="Guardian name"
            />
            <input
              required
              name="guardianEmail"
              type="email"
              maxLength={255}
              className={fieldClass}
              placeholder="Guardian email"
            />
            <input
              required
              name="guardianPhone"
              maxLength={50}
              className={fieldClass}
              placeholder="Guardian phone"
            />
            <input
              name="previousInstitution"
              maxLength={255}
              className={fieldClass}
              placeholder="Previous institution (optional)"
            />
            <input
              name="previousClassMarks"
              maxLength={100}
              className={fieldClass}
              placeholder="Recent marks: obtained / total"
            />
            <textarea
              name="medicalInformation"
              maxLength={2000}
              className={fieldClass}
              placeholder="Health and support information"
            />
            <textarea
              name="notes"
              maxLength={2000}
              className={fieldClass}
              placeholder="Other notes (optional)"
            />
            <div className="lg:col-span-3">
              <Button type="submit" disabled={busy}>
                Record application
              </Button>
            </div>
          </form>
          {manualCredentials && (
            <div className="mt-5 rounded-lg bg-brand-950 p-4 text-sm text-white">
              <p className="font-semibold">
                New applicant portal credentials — copy now
              </p>
              <p className="mt-2 font-mono">
                Login ID: {manualCredentials.loginId}
              </p>
              <p className="font-mono">
                Temporary password: {manualCredentials.temporaryPassword}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Review applications</CardTitle>
          <p className="text-sm text-stone-500">
            Request documents, arrange physical tests or interviews, and record
            the admission decision.
          </p>
        </CardHeader>
        <CardContent>
          {message && (
            <div
              className={`mb-5 rounded-lg px-4 py-3 text-sm ${message.kind === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
            >
              {message.text}
            </div>
          )}
          {!loading && (
            <div className="mb-7 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-xl bg-stone-50 p-4">
                  <p className="text-xs font-bold text-stone-500">
                    Open applications
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {totalApplicationCount}
                  </p>
                </div>
                <div className="rounded-xl bg-amber-50 p-4">
                  <p className="text-xs font-bold text-amber-800">
                    Awaiting action
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {(operations.stats.SUBMITTED || 0) +
                      (operations.stats.DOCUMENTS_REQUIRED || 0) +
                      (operations.stats.DECISION_PENDING || 0) +
                      (operations.stats.FEE_VERIFICATION || 0)}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4">
                  <p className="text-xs font-bold text-emerald-800">Offered</p>
                  <p className="mt-1 text-2xl font-bold">
                    {operations.stats.OFFERED || 0}
                  </p>
                </div>
              </div>
              {operations.capacity.length > 0 && (
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {operations.capacity.map((item) => (
                    <div
                      key={item.offeringId}
                      className="rounded-lg border border-stone-200 p-3 text-sm"
                    >
                      <div className="flex justify-between gap-3">
                        <strong>{item.title}</strong>
                        <span>{item.activeApplications} active</span>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {item.capacity
                          ? `${item.enrolled} of ${item.capacity} seats enrolled${item.enrolled >= item.capacity ? " / full" : ""}`
                          : `${item.enrolled} enrolled / no seat limit set`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <section className="rounded-xl border border-stone-200 bg-stone-50/70 p-4">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-stone-900">
                      Work queues
                    </p>
                    <p className="text-xs text-stone-500">
                      Jump directly to the applications that need a specific
                      action.
                    </p>
                  </div>
                  {statusFilter === "SUBMITTED" && !debouncedSearch && pagination.total > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={confirmAcceptAllNewApplications}
                    >
                      Accept all ({pagination.total})
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {queueFilters.map((queue) => (
                    <button
                      key={queue.value || "all"}
                      type="button"
                      onClick={() => {
                        setStatusFilter(queue.value);
                        setPage(1);
                      }}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${statusFilter === queue.value ? "border-brand-600 bg-brand-600 text-white shadow-sm" : "border-stone-200 bg-white text-stone-600 hover:border-brand-300 hover:text-brand-700"}`}
                    >
                      {queue.label}
                      <span
                        className={`ml-2 rounded-full px-1.5 py-0.5 ${statusFilter === queue.value ? "bg-white/20" : "bg-stone-100"}`}
                      >
                        {queue.count}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className={`${fieldClass} pl-9`}
                    placeholder="Search name, phone, email, or application no."
                  />
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                  className={fieldClass}
                >
                  <option value="">All statuses</option>
                  {Object.keys(labels).map((status) => (
                    <option key={status} value={status}>
                      {labels[status]}
                    </option>
                  ))}
                </select>
                <select
                  value={cycleFilter}
                  onChange={(event) => {
                    setCycleFilter(event.target.value);
                    setPage(1);
                  }}
                  className={fieldClass}
                >
                  <option value="">All cycles</option>
                  {operations.cycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>
                      {cycle.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={exportCsv}
                  disabled={applications.length === 0}
                >
                  Export this page
                </Button>
              </div>
            </div>
          )}
          {loading ? (
            <p className="rounded-lg bg-stone-50 p-6 text-center text-sm text-stone-500">
              Loading a small application batch...
            </p>
          ) : applications.length === 0 ? (
            <p className="rounded-lg bg-stone-50 p-6 text-center text-sm text-stone-500">
              {totalApplicationCount === 0
                ? "No applications have been submitted yet."
                : "No applications match this queue or search."}
            </p>
          ) : (
            <div>
              <div>
                <div className="mb-3 flex items-center justify-between text-xs text-stone-500">
                  <span>
                    Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                    {Math.min(
                      pagination.page * pagination.pageSize,
                      pagination.total,
                    )}{" "}
                    of {pagination.total}
                  </span>
                  <span>30 per page</span>
                </div>
                <div className="max-h-[700px] space-y-2 overflow-y-auto pr-1">
                  {applications.map((application) => (
                    <button
                      key={application.id}
                      type="button"
                      onClick={() => setSelectedId(application.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${selectedId === application.id ? "border-brand-500 bg-brand-50" : "border-stone-200 hover:bg-stone-50"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-stone-900">
                          {application.studentName}
                        </p>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-stone-600">
                          {labels[application.status] || application.status}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-stone-500">
                        {application.applicationNumber} / {application.campusName}
                      </p>
                      <p className="mt-2 text-xs text-stone-500">
                        {application.offeringTitle} / {application.cycleName}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-200 pt-4">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || loading}
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-xs font-semibold text-stone-600">
                    Page {pagination.page} of {pagination.pages}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page >= pagination.pages || loading}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Dialog
                open={Boolean(selectedId)}
                onOpenChange={(open) => {
                  if (!open && !busy) {
                    setSelectedId(null);
                    setDetail(null);
                    setCredentials(null);
                  }
                }}
              >
                <DialogContent className="max-w-6xl gap-0 overflow-y-auto p-0 sm:max-h-[calc(100svh-2rem)]">
                  {!detail ? (
                    <p className="p-8 text-center text-sm text-stone-500">
                      Loading application...
                    </p>
                  ) : (
                    <div className="space-y-6 p-5 sm:p-7">
                  <section className="rounded-xl border border-stone-200 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-stone-500">
                          {detail.application.applicationNumber} / {detail.application.campusName}
                        </p>
                        <h3 className="mt-1 text-xl font-semibold">
                          {detail.application.studentName}
                        </h3>
                        <p className="text-sm text-stone-500">
                          {detail.application.offeringTitle} /{" "}
                          {detail.application.cycleName}
                        </p>
                      </div>
                      <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold">
                        {labels[detail.application.status] ||
                          detail.application.status}
                      </span>
                    </div>
                    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-stone-500">Guardian</dt>
                        <dd className="font-medium">
                          {detail.application.guardianName}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stone-500">Contact</dt>
                        <dd className="break-all font-medium">
                          {detail.application.guardianEmail}
                          <br />
                          {detail.application.guardianPhone}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stone-500">Date of birth</dt>
                        <dd>{detail.application.dateOfBirth}</dd>
                      </div>
                      <div>
                        <dt className="text-stone-500">Previous institution</dt>
                        <dd>
                          {detail.application.previousInstitution ||
                            "Not provided"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stone-500">Recent marks</dt>
                        <dd>
                          {detail.application.previousClassMarks ||
                            "Not provided"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-stone-500">Health and support</dt>
                        <dd className="whitespace-pre-line">
                          {detail.application.medicalInformation ||
                            "Nothing reported"}
                        </dd>
                      </div>
                    </dl>
                    {detail.application.notes && (
                      <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
                        {detail.application.notes}
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap gap-2">
                      {detail.application.status === "SUBMITTED" && (
                        <>
                          <Button
                            disabled={busy}
                            onClick={() => act({ action: "startReview" })}
                          >
                            Accept and begin process
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => decision("REJECTED")}
                          >
                            Do not accept
                          </Button>
                        </>
                      )}
                      {detail.application.canResetApplicantCredentials && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          resetCredential("resetApplicantPassword")
                        }
                      >
                        Reset applicant password
                      </Button>
                      )}
                      {![
                        "FEE_VERIFICATION",
                        "FEE_VERIFIED",
                        "WITHDRAWN",
                        "ENROLLED",
                      ].includes(detail.application.status) && (
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busy}
                          onClick={withdrawApplication}
                        >
                          Withdraw application
                        </Button>
                      )}
                    </div>
                  </section>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <form
                      onSubmit={requestDocuments}
                      className="rounded-xl border border-stone-200 p-5"
                    >
                      <h4 className="font-semibold">Documents</h4>
                      <p className="mt-1 text-xs text-stone-500">
                        Cycle documents are requested automatically. Use this
                        form only for an extra document.
                      </p>
                      {![
                        "OFFERED",
                        "FEE_PENDING",
                        "FEE_VERIFICATION",
                        "FEE_VERIFIED",
                      ].includes(detail.application.status) && (
                        <>
                          <textarea
                            required
                            name="documents"
                            rows={2}
                            className={`${fieldClass} mt-3`}
                            placeholder="Extra document name (one per line)"
                          />
                          <textarea
                            name="documentInstructions"
                            rows={2}
                            className={`${fieldClass} mt-2`}
                            placeholder="Instructions (optional)"
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            disabled={busy}
                            className="mt-3"
                          >
                            Request extra document
                          </Button>
                        </>
                      )}
                      {detail.documents.length > 0 && (
                        <ul className="mt-4 space-y-3 text-xs text-stone-600">
                          {detail.documents.map((document) => (
                            <li
                              key={document.id}
                              className="rounded-lg bg-stone-50 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold">
                                  {document.documentName}
                                </span>
                                <span>{document.status}</span>
                              </div>
                              {document.submittedFileKey && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <a
                                    className="font-semibold text-brand-700 underline"
                                    href={`/api/institution/admissions/files/document/${document.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open submitted file
                                  </a>
                                  {document.status === "SUBMITTED" && (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={busy}
                                        onClick={() =>
                                          reviewDocument(
                                            document.id,
                                            "VERIFIED",
                                          )
                                        }
                                      >
                                        Verify
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() =>
                                          reviewDocument(
                                            document.id,
                                            "REJECTED",
                                          )
                                        }
                                      >
                                        Request again
                                      </Button>
                                    </>
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </form>
                    <section className="rounded-xl border border-stone-200 p-5">
                      <h4 className="font-semibold">Decision</h4>
                      <p className="mt-1 text-xs text-stone-500">
                        Final decisions unlock after required test and interview
                        results are passed.
                      </p>
                      {["UNDER_REVIEW", "DECISION_PENDING"].includes(
                        detail.application.status,
                      ) ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            disabled={busy}
                            onClick={() => decision("OFFERED")}
                          >
                            Offer admission
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => decision("REJECTED")}
                          >
                            Do not accept
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-4 text-sm font-semibold">
                          Current result:{" "}
                          {labels[detail.application.status] ||
                            detail.application.status}
                        </p>
                      )}
                    </section>
                  </div>

                  <PaymentHistory applicationId={detail.application.id} />
                  {(detail.application.status === "OFFERED" ||
                    detail.application.status === "FEE_PENDING" ||
                    detail.application.status === "FEE_VERIFICATION" ||
                    detail.application.status === "FEE_VERIFIED") && (
                    <section className="rounded-xl border border-stone-200 p-5">
                      <h4 className="font-semibold">Admission fee</h4>
                      {detail.feePayment && (
                        <div className="mt-3 rounded-lg bg-stone-50 p-4 text-sm">
                          <div className="flex flex-wrap justify-between gap-2">
                            <strong>
                              PKR{" "}
                              {detail.feePayment.amount.toLocaleString("en-PK")}
                            </strong>
                            <span className="text-xs font-bold">
                              {detail.feePayment.status}
                            </span>
                          </div>
                          {detail.feePayment.dueDate && (
                            <p className="mt-1">
                              Due {detail.feePayment.dueDate}
                            </p>
                          )}
                          <p className="mt-2 whitespace-pre-line text-stone-600">
                            {detail.feePayment.instructions}
                          </p>
                          {detail.feePayment.payerReference && (
                            <p className="mt-2">
                              Reference:{" "}
                              <strong>
                                {detail.feePayment.payerReference}
                              </strong>
                            </p>
                          )}
                          {detail.feePayment.payerSourceBank && (
                            <p className="mt-2">
                              Source bank / wallet:{" "}
                              <strong>
                                {detail.feePayment.payerSourceBank}
                              </strong>
                            </p>
                          )}
                          {detail.feePayment.proofFileKey && (
                            <a
                              href={`/api/institution/admissions/files/fee/${detail.feePayment.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block font-semibold text-brand-700 underline"
                            >
                              Open payment proof
                            </a>
                          )}
                          {detail.feePayment.reviewerNote && (
                            <p className="mt-2 text-xs text-red-700">
                              Note: {detail.feePayment.reviewerNote}
                            </p>
                          )}
                          {detail.feePayment.status === "SUBMITTED" && (
                            <div className="mt-3 flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={busy}
                                onClick={() => reviewFee("VERIFIED")}
                              >
                                Verify payment
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => reviewFee("REJECTED")}
                              >
                                Reject proof
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      {(detail.application.status === "OFFERED" ||
                        detail.application.status === "FEE_PENDING") &&
                        detail.feePayment?.status !== "SUBMITTED" && (
                          <form
                            onSubmit={initiateFee}
                            className="mt-4 grid gap-3 sm:grid-cols-2"
                          >
                            <input
                              required
                              name="amount"
                              type="number"
                              min="1"
                              max="100000000"
                              defaultValue={detail.feePayment?.amount}
                              className={fieldClass}
                              placeholder="Amount in PKR"
                            />
                            <input
                              name="dueDate"
                              type="date"
                              defaultValue={detail.feePayment?.dueDate || ""}
                              className={fieldClass}
                            />
                            <textarea
                              required
                              name="feeInstructions"
                              rows={3}
                              defaultValue={detail.feePayment?.instructions}
                              className={`${fieldClass} sm:col-span-2`}
                              placeholder="Bank, Easypaisa/JazzCash, or on-campus payment instructions"
                            />
                            <div className="sm:col-span-2">
                              <Button type="submit" disabled={busy}>
                                {detail.feePayment
                                  ? "Update fee request"
                                  : "Request fee payment"}
                              </Button>
                            </div>
                          </form>
                        )}
                    </section>
                  )}

                  {detail.application.status === "FEE_VERIFIED" &&
                    !detail.enrollment && (
                      <form
                        onSubmit={enrollStudent}
                        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
                      >
                        <h4 className="font-semibold text-emerald-950">
                          Complete student enrollment
                        </h4>
                        <p className="mt-1 text-xs text-emerald-800">
                          This creates the permanent student record and login.
                          Verify placement carefully.
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="text-sm"><strong>Campus:</strong> {detail.application.campusName}<input type="hidden" name="campusId" value={detail.application.campusId ?? ""} /></div>
                          <select
                            required
                            name="classId"
                            value={enrollmentClassId}
                            onChange={(event) =>
                              setEnrollmentClassId(event.target.value)
                            }
                            className={fieldClass}
                          >
                            <option value="">Select class</option>
                            {detail.options.classes.map((classItem) => (
                              <option key={classItem.id} value={classItem.id}>
                                {classItem.name}
                              </option>
                            ))}
                          </select>
                          <select
                            name="sectionId"
                            className={fieldClass}
                            disabled={!enrollmentClassId}
                          >
                            <option value=""></option>
                            {detail.options.sections
                              .filter(
                                (section) =>
                                  String(section.classId) === enrollmentClassId &&
                                  Boolean(displaySectionName(section.name)),
                              )
                              .map((section) => (
                                <option key={section.id} value={section.id}>
                                  {displaySectionName(section.name)}
                                </option>
                              ))}
                          </select>
                          <input
                            required
                            name="classRollNumber"
                            maxLength={100}
                            className={fieldClass}
                            placeholder="Class roll number"
                          />
                          <input
                            required
                            name="yearOfJoining"
                            type="number"
                            min="2000"
                            max="2100"
                            defaultValue={new Date().getFullYear()}
                            className={fieldClass}
                          />
                          <div className="sm:col-span-2">
                            <Button
                              type="submit"
                              disabled={
                                busy || detail.options.classes.length === 0
                              }
                            >
                              Create permanent student account
                            </Button>
                            {detail.options.classes.length === 0 && (
                              <p className="mt-2 text-xs text-red-700">
                                Create at least one class before enrollment.
                              </p>
                            )}
                          </div>
                        </div>
                      </form>
                    )}

                  {(credentials || detail.enrollment) && (
                    <section className="rounded-xl bg-brand-950 p-5 text-white">
                      <h4 className="font-semibold">
                        {credentials
                          ? credentialTitle
                          : "Permanent student account"}
                      </h4>
                      <p className="mt-3 text-xs text-white/70">Login ID</p>
                      <p className="break-all font-mono font-bold">
                        {credentials?.loginRollNumber ||
                          detail.enrollment?.loginRollNumber}
                      </p>
                      {credentials && (
                        <>
                          <p className="mt-3 text-xs text-white/70">
                            Temporary password — copy it now
                          </p>
                          <p className="font-mono text-lg font-bold">
                            {credentials.temporaryPassword}
                          </p>
                          <p className="mt-2 text-xs text-white/70">
                            These credentials were also emailed to the guardian
                            when email is configured.
                          </p>
                        </>
                      )}
                    </section>
                  )}

                  {(["TEST", "INTERVIEW"] as const)
                    .filter((type) =>
                      type === "TEST"
                        ? detail.application.requiresTest
                        : detail.application.requiresInterview,
                    )
                    .map((type) => {
                      const appointment = detail.appointments.find(
                        (item) => item.type === type,
                      );
                      return (
                        <form
                          key={type}
                          onSubmit={(event) => schedule(event, type)}
                          className="rounded-xl border border-stone-200 p-5"
                        >
                          <h4 className="font-semibold">
                            {type === "TEST"
                              ? "Physical admission test"
                              : "Interview"}
                          </h4>
                          {appointment && (
                            <p className="mt-2 rounded-lg bg-stone-50 p-3 text-sm">
                              {new Date(
                                appointment.scheduledAt,
                              ).toLocaleString()}{" "}
                              / {appointment.location}
                              <br />
                              <span className="text-xs font-bold">
                                Result: {appointment.outcome}
                              </span>
                            </p>
                          )}
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <input
                              required
                              name="scheduledAt"
                              type="datetime-local"
                              className={fieldClass}
                            />
                            <input
                              required
                              name="location"
                              className={fieldClass}
                              placeholder="Campus / room / address"
                            />
                          </div>
                          <textarea
                            name="instructions"
                            rows={2}
                            className={`${fieldClass} mt-2`}
                            placeholder="Instructions (optional)"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button type="submit" disabled={busy}>
                              {appointment ? "Reschedule" : "Schedule"}
                            </Button>
                            {appointment &&
                              appointment.outcome === "PENDING" && (
                                <>
                                  {(
                                    ["PASSED", "FAILED", "ABSENT"] as const
                                  ).map((result) => (
                                    <Button
                                      key={result}
                                      type="button"
                                      variant="outline"
                                      disabled={busy}
                                      onClick={() => outcome(type, result)}
                                    >
                                      {result.charAt(0) +
                                        result.slice(1).toLowerCase()}
                                    </Button>
                                  ))}
                                </>
                              )}
                          </div>
                        </form>
                      );
                    })}

                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(actionDialog)}
        onOpenChange={(open) => {
          if (!open && !busy) setActionDialog(null);
        }}
      >
        {actionDialog && (
          <DialogContent className="z-[90] max-w-lg gap-0 overflow-hidden border-0 p-0 sm:p-0">
            <DialogHeader className="border-b border-stone-200 bg-stone-50 px-6 py-5 pr-12 text-left">
              <DialogTitle className="text-xl text-brand-950">
                {actionDialog.title}
              </DialogTitle>
              {actionDialog.description && (
                <DialogDescription className="mt-1 leading-6">
                  {actionDialog.description}
                </DialogDescription>
              )}
            </DialogHeader>
            <div className="space-y-5 p-6 text-left">
              {actionDialog.label && (
                <label className="block text-sm font-semibold text-stone-700">
                  {actionDialog.label}
                  <textarea
                    autoFocus
                    rows={4}
                    maxLength={1000}
                    required={actionDialog.required}
                    value={dialogValue}
                    onChange={(event) => setDialogValue(event.target.value)}
                    className={`${fieldClass} mt-2 resize-y`}
                    placeholder={
                      actionDialog.required ? "Required" : "Optional"
                    }
                  />
                </label>
              )}
              <DialogFooter className="gap-2 sm:space-x-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setActionDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant={actionDialog.danger ? "danger" : "default"}
                  disabled={
                    busy ||
                    Boolean(actionDialog.required && !dialogValue.trim())
                  }
                  onClick={() => void confirmDialog()}
                >
                  {busy ? "Saving…" : actionDialog.confirmLabel}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
