"use client";

import { useEffect, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { TestActions } from "@/components/tests/TestActions";
import { gradeMixedTestAction } from "@/app/actions/online-test-actions";
import { formatClassSection } from "@/lib/class-section-label";

type TestSummary = { id: number; onlineTestId: number; title: string; maxMarks: number; className: string; sectionName: string | null; subjectName: string | null; durationMinutes: number; mode: "MCQ" | "MIX"; submissionCount: number; pendingReviewCount: number };
type Question = { id: number; questionType: "MCQ" | "SHORT"; prompt: string; marks: number; orderIndex: number };
type Submission = { id: number; studentName: string; rollNumber: string | null; status: string; violationReason: string | null; totalScore: number; submittedAt: string | null };
type Details = { hostedTest: { maxMarks: number; mode: "MCQ" | "MIX" }; questions: Question[]; submissions: Submission[] };

export function HostedTestsList({
  initialTests,
  initialNextCursor = null,
}: {
  initialTests?: TestSummary[];
  initialNextCursor?: string | null;
}) {
  const seededFromServer = initialTests !== undefined;
  const [tests, setTests] = useState<TestSummary[]>(initialTests ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [details, setDetails] = useState<Record<number, Details>>({});
  const [answers, setAnswers] = useState<Record<number, Record<string, string | number>>>({});
  const [loading, setLoading] = useState(!seededFromServer);

  const loadTests = async (cursor?: string) => {
    const response = await fetch(`/api/staff/host-tests${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!response.ok) return;
    const body = await response.json();
    setTests((current) => (cursor ? [...current, ...body.tests] : body.tests));
    setNextCursor(body.nextCursor);
  };

  useEffect(() => {
    if (seededFromServer) return;
    loadTests().finally(() => setLoading(false));
  }, [seededFromServer]);

  const loadDetails = async (onlineTestId: number) => {
    if (details[onlineTestId]) return;
    const response = await fetch(`/api/staff/host-tests/${onlineTestId}/details`);
    if (!response.ok) return;
    const body = await response.json() as Details;
    setDetails((current) => ({ ...current, [onlineTestId]: body }));
  };

  const loadAnswers = async (onlineTestId: number, submissionId: number) => {
    if (answers[submissionId]) return;
    const response = await fetch(`/api/staff/host-tests/${onlineTestId}/submissions/${submissionId}`);
    if (!response.ok) return;
    const body = await response.json();
    setAnswers((current) => ({ ...current, [submissionId]: body.answers || {} }));
  };

  if (loading) return <p className="p-6 text-sm text-stone-500">Loading hosted tests…</p>;
  if (tests.length === 0) return <p className="p-6 text-sm text-stone-500">No online tests hosted yet.</p>;

  return <div className="divide-y divide-border">
    {tests.map((test) => {
      const detail = details[test.onlineTestId];
      return <details key={test.onlineTestId} className="group" onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) void loadDetails(test.onlineTestId);
      }}>
        <summary className="flex cursor-pointer flex-col gap-3 p-5 hover:bg-stone-50 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="font-semibold text-brand-950">{test.title}</h3><p className="text-sm text-stone-500">{test.mode} - {formatClassSection(test.className, test.sectionName)} - {test.subjectName || "Subject"}</p><p className="text-xs text-stone-500">{test.durationMinutes} min - {test.maxMarks} marks - {test.submissionCount} submissions{test.pendingReviewCount ? ` (${test.pendingReviewCount} pending)` : ""}</p><TestActions testId={test.id} currentTitle={test.title} currentDurationMinutes={test.durationMinutes} /></div>
          <span className="w-fit rounded-md border border-border bg-white px-3 py-2 text-sm font-medium text-brand-700">Review submissions</span>
        </summary>
        <div className="border-t border-border bg-stone-50/50 p-5">
          {!detail ? <p className="text-sm text-stone-500">Loading details…</p> : detail.submissions.length === 0 ? <p className="text-sm text-stone-500">No student has submitted this test yet.</p> : <div className="space-y-4">{detail.submissions.map((submission) => {
            const answerMap = answers[submission.id];
            const shortQuestions = detail.questions.filter((question) => question.questionType === "SHORT");
            return <details key={submission.id} className="rounded-md border border-border bg-white" onToggle={(event) => {
              if ((event.currentTarget as HTMLDetailsElement).open) void loadAnswers(test.onlineTestId, submission.id);
            }}><summary className="flex cursor-pointer justify-between gap-2 p-4"><span><b>{submission.studentName}</b> <span className="text-stone-500">({submission.rollNumber})</span><br /><span className="text-sm text-stone-500">{submission.status}</span></span><b>{submission.totalScore}/{test.maxMarks}</b></summary>
              <div className="border-t border-border p-4">{!answerMap ? <p className="text-sm text-stone-500">Loading answers…</p> : <><div className="space-y-3">{detail.questions.map((question) => <div key={question.id} className="rounded-md border border-border bg-stone-50 p-3"><p className="font-semibold">{question.prompt}</p><p className="text-sm">Answer: {String(answerMap[String(question.id)] ?? "Not answered")}</p></div>)}</div>{test.mode === "MIX" && submission.status === "PENDING_REVIEW" && <form action={gradeMixedTestAction} className="mt-4 space-y-3"><input type="hidden" name="submissionId" value={submission.id} />{shortQuestions.map((question) => <label key={question.id} className="grid gap-2 sm:grid-cols-[1fr_140px]"><span>{question.prompt}</span><input name={`score-${question.id}`} type="number" min="0" max={question.marks} step="0.5" required /></label>)}<SubmitButton>Save Grade</SubmitButton></form>}</>}</div>
            </details>;
          })}</div>}
        </div>
      </details>;
    })}
    {nextCursor && <div className="p-5"><button className="rounded-md border px-3 py-2 text-sm" onClick={() => void loadTests(nextCursor)}>Load more</button></div>}
  </div>;
}
