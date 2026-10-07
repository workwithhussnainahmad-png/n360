"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, CheckCircle, FileText, Award, Receipt, Activity } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { AttendanceCalendar } from "./AttendanceCalendar";
import { ResultsTabs } from "./ResultsTabs";
import { SubmissionsList } from "./SubmissionsList";
import { StudentAnalytics } from "./StudentAnalytics";

type HistorySection = "attendance" | "marks" | "submissions" | "batchExams" | "fees" | "analytics";

type AttendanceRow = { id: number; date: string; status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" };
type MarksRow = {
  id: number;
  marksObtained: number;
  totalMarks: number;
  testTitle: string;
  date: string;
  testType: string;
};
type SubmissionRow = {
  id: number;
  fileKey: string;
  createdAt: string;
  assignmentTitle: string;
  dueAt: string;
};
type BatchExamRow = {
  id: number;
  title: string;
  createdAt: string;
  totalMax: number;
  totalObtained: number;
  percentage: number;
};
type FeeAccount = {
  invoice: {
    id: number;
    dueDate: string;
    status: "DUE" | "PARTIAL" | "PAID" | "VOID";
    totalAmount: number;
    paidAmount: number;
    lateFeeAmount: number;
  };
  payments: Array<{
    id: number;
    receiptNumber: string;
    amount: number;
    method: string;
    reference: string | null;
    receivedAt: string;
  }>;
  submissions: Array<{
    id: number;
    amount: number;
    sourceBankName: string;
    transactionId: string;
    status: "SUBMITTED" | "VERIFIED" | "REJECTED";
    reviewerNote: string | null;
    submittedAt: string;
  }>;
};
type AnalyticsData = {
  attendances: { date: string; status: string }[];
  marks: { date: string; marksObtained: number; totalMarks: number }[];
  submissions: { createdAt: string }[];
};

const HISTORY_SECTIONS: HistorySection[] = ["attendance", "marks", "submissions", "batchExams", "fees", "analytics"];

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function SectionShell({
  title,
  icon,
  loaded,
  loading,
  error,
  onLoad,
  children,
}: {
  title: string;
  icon: ReactNode;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  onLoad: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="bg-stone-50/50 py-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        {false && !loaded && (
          <Button type="button" size="sm" variant="outline" onClick={onLoad} disabled={loading}>
            {loading ? "Loading…" : "Load"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-4">
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loaded && !error && !loading && (
          <p className="text-sm text-stone-500">Click Load to fetch this section.</p>
        )}
        {loading && <p className="text-sm text-stone-500">Loading…</p>}
        {loaded && children}
      </CardContent>
    </Card>
  );
}

export function StudentDetailHistory({ studentId }: { studentId: number }) {
  const [attendance, setAttendance] = useState<AttendanceRow[] | null>(null);
  const [marks, setMarks] = useState<MarksRow[] | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[] | null>(null);
  const [batchExams, setBatchExams] = useState<BatchExamRow[] | null>(null);
  const [feeAccount, setFeeAccount] = useState<FeeAccount | null | undefined>(undefined);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [month, setMonth] = useState(currentMonthValue);
  const [loading, setLoading] = useState<Partial<Record<HistorySection, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<HistorySection, string>>>({});
  const requestVersion = useRef(0);

  const loadSection = useCallback(async (section: HistorySection, selectedMonth: string, version: number) => {
    setLoading((prev) => ({ ...prev, [section]: true }));
    setErrors((prev) => ({ ...prev, [section]: undefined }));
    try {
      const data = await api.get<Record<string, unknown>>(
        `/api/institution/students/${studentId}/history?section=${section}&month=${selectedMonth}`
      );
      if (version !== requestVersion.current) return;
      if (section === "attendance") setAttendance(data.attendance as AttendanceRow[]);
      if (section === "marks") setMarks(data.marks as MarksRow[]);
      if (section === "submissions") setSubmissions(data.submissions as SubmissionRow[]);
      if (section === "batchExams") setBatchExams(data.batchExams as BatchExamRow[]);
      if (section === "fees") setFeeAccount((data.feeAccount as FeeAccount | null) ?? null);
      if (section === "analytics") setAnalytics(data.analytics as AnalyticsData);
    } catch {
      if (version === requestVersion.current) {
        setErrors((prev) => ({ ...prev, [section]: "Could not load this section." }));
      }
    } finally {
      if (version === requestVersion.current) {
        setLoading((prev) => ({ ...prev, [section]: false }));
      }
    }
  }, [studentId]);

  useEffect(() => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    queueMicrotask(() => {
      if (version !== requestVersion.current) return;
      for (const section of HISTORY_SECTIONS) {
        void loadSection(section, month, version);
      }
    });

    return () => {
      if (requestVersion.current === version) requestVersion.current += 1;
    };
  }, [loadSection, month]);

  return (
    <div className="space-y-6 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-stone-50/50 px-4 py-3">
        <div>
          <h2 className="font-semibold text-brand-950">Student activity</h2>
          <p className="text-sm text-stone-500">Only the selected month is loaded.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          Month
          <input type="month" value={month} max={currentMonthValue()} onChange={(event) => setMonth(event.target.value)} className="rounded-md border border-border bg-white px-2 py-1.5" />
        </label>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionShell
          title="Recent Attendance"
          icon={<CheckCircle className="h-5 w-5 text-emerald-600" />}
          loaded={attendance !== null}
          loading={Boolean(loading.attendance)}
          error={errors.attendance ?? null}
          onLoad={() => loadSection("attendance", month, requestVersion.current)}
        >
          <AttendanceCalendar records={attendance || []} monthValue={month} onMonthChange={setMonth} />
        </SectionShell>

        <SectionShell
          title="Recent Results"
          icon={<BookOpen className="h-5 w-5 text-blue-600" />}
          loaded={marks !== null}
          loading={Boolean(loading.marks)}
          error={errors.marks ?? null}
          onLoad={() => loadSection("marks", month, requestVersion.current)}
        >
          <ResultsTabs records={marks || []} />
        </SectionShell>
      </div>

      <SectionShell
        title="Term Results"
        icon={<Award className="h-5 w-5 text-amber-500" />}
        loaded={batchExams !== null}
        loading={Boolean(loading.batchExams)}
        error={errors.batchExams ?? null}
        onLoad={() => loadSection("batchExams", month, requestVersion.current)}
      >
        {(batchExams?.length ?? 0) === 0 ? (
          <p className="text-sm text-stone-500">No published term results.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batchExams!.map((exam) => (
              <div key={exam.id} className="p-4 border border-stone-200 rounded-lg flex flex-col gap-2 bg-white">
                <h4 className="font-semibold text-stone-800 line-clamp-1" title={exam.title}>{exam.title}</h4>
                <p className="text-xs text-stone-500">{new Date(exam.createdAt).toLocaleDateString()}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-stone-700">{exam.totalObtained} / {exam.totalMax}</span>
                  <span className={`text-sm font-bold ${exam.percentage >= 50 ? "text-emerald-600" : "text-red-600"}`}>
                    {exam.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Assignment Submissions"
        icon={<FileText className="h-5 w-5 text-purple-600" />}
        loaded={submissions !== null}
        loading={Boolean(loading.submissions)}
        error={errors.submissions ?? null}
        onLoad={() => loadSection("submissions", month, requestVersion.current)}
      >
        <SubmissionsList records={submissions || []} />
      </SectionShell>

      <SectionShell
        title="Fee Account"
        icon={<Receipt className="h-5 w-5 text-emerald-600" />}
        loaded={feeAccount !== undefined}
        loading={Boolean(loading.fees)}
        error={errors.fees ?? null}
        onLoad={() => loadSection("fees", month, requestVersion.current)}
      >
        {!feeAccount ? (
          <p className="text-sm text-stone-500">No challan was issued for this month.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-md border bg-stone-50 p-4 sm:grid-cols-4">
              <div><p className="text-xs text-stone-500">Status</p><p className="font-semibold">{feeAccount.invoice.status}</p></div>
              <div><p className="text-xs text-stone-500">Total</p><p className="font-semibold">PKR {feeAccount.invoice.totalAmount.toLocaleString("en-PK")}</p></div>
              <div><p className="text-xs text-stone-500">Paid</p><p className="font-semibold">PKR {feeAccount.invoice.paidAmount.toLocaleString("en-PK")}</p></div>
              <div><p className="text-xs text-stone-500">Balance</p><p className="font-semibold">PKR {(feeAccount.invoice.totalAmount - feeAccount.invoice.paidAmount).toLocaleString("en-PK")}</p></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold text-brand-950">Verified receipts</h4>
                {feeAccount.payments.length === 0 ? <p className="mt-2 text-sm text-stone-500">No verified payment.</p> : feeAccount.payments.map((payment) => (
                  <div key={payment.id} className="mt-2 rounded-md border p-3 text-sm">
                    <div className="flex justify-between gap-3"><strong>{payment.receiptNumber}</strong><span>PKR {payment.amount.toLocaleString("en-PK")}</span></div>
                    <p className="mt-1 text-xs text-stone-500">{payment.method} · {new Date(payment.receivedAt).toLocaleString("en-PK")}</p>
                  </div>
                ))}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-brand-950">Payment submissions</h4>
                {feeAccount.submissions.length === 0 ? <p className="mt-2 text-sm text-stone-500">No payment proof submitted.</p> : feeAccount.submissions.map((submission) => (
                  <div key={submission.id} className="mt-2 rounded-md border p-3 text-sm">
                    <div className="flex justify-between gap-3"><strong>{submission.status}</strong><span>PKR {submission.amount.toLocaleString("en-PK")}</span></div>
                    <p className="mt-1 text-xs text-stone-500">{submission.sourceBankName} · {submission.transactionId}</p>
                    {submission.reviewerNote && <p className="mt-1 text-xs text-stone-600">{submission.reviewerNote}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Analytics"
        icon={<Activity className="h-5 w-5 text-brand-600" />}
        loaded={analytics !== null}
        loading={Boolean(loading.analytics)}
        error={errors.analytics ?? null}
        onLoad={() => loadSection("analytics", month, requestVersion.current)}
      >
        <StudentAnalytics data={analytics!} month={month} />
      </SectionShell>
    </div>
  );
}
