"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import { submitOnlineTestAction } from "@/app/actions/online-test-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Question = {
  id: number;
  questionType: "MCQ" | "SHORT";
  prompt: string;
  options: string[] | null;
  marks: number;
  correctOptionIndex?: number | null;
};

export function StudentTestTaker({
  onlineTestId,
  title,
  durationMinutes,
  mode,
  questions,
  isReviewing = false,
  answers = {},
  totalScore,
}: {
  onlineTestId: number;
  title: string;
  durationMinutes: number;
  mode: "MCQ" | "MIX";
  questions: Question[];
  isReviewing?: boolean;
  answers?: Record<string, string | number>;
  totalScore?: number;
}) {
  const [started, setStarted] = useState(isReviewing || false);
  const [failed, setFailed] = useState(false);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false);
  const [remaining, setRemaining] = useState(durationMinutes * 60);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const totalMarks = useMemo(() => questions.reduce((sum, question) => sum + question.marks, 0), [questions]);

  const failTest = useCallback((reason: "tab_switch" | "timeout" | "disconnect") => {
    setFailed(true);
    setFailureReason(reason);
    setStarted(false);
    fetch("/api/student/tests/fail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlineTestId, reason }),
      keepalive: true,
    }).catch(() => {});
  }, [onlineTestId]);

  const startAttempt = async () => {
    setIsStarting(true);
    try {
      const response = await fetch("/api/student/tests/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlineTestId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.expiresAt) throw new Error(body.error || "Could not start the test");
      const nextExpiresAt = new Date(body.expiresAt).getTime();
      setExpiresAtMs(nextExpiresAt);
      setRemaining(Math.max(0, Math.ceil((nextExpiresAt - Date.now()) / 1000)));
      setIsStartDialogOpen(false);
      setStarted(true);
    } catch (error) {
      setFailureReason(error instanceof Error ? error.message : "Could not start the test");
      setFailed(true);
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (!started || failed || isReviewing) return;

    const onVisibilityChange = () => {
      if (document.hidden) failTest("tab_switch");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [failed, failTest, started, isReviewing]);

  useEffect(() => {
    if (!started || failed || isReviewing) return;
    if (!expiresAtMs) return;
    const timer = window.setInterval(() => {
      const nextRemaining = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
      setRemaining(nextRemaining);
      if (nextRemaining <= 0) failTest("timeout");
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAtMs, failed, failTest, started, isReviewing]);

  useEffect(() => {
    if (!started || failed || isReviewing) return;
    const heartbeat = window.setInterval(() => {
      fetch("/api/student/tests/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onlineTestId }),
        keepalive: true,
      }).then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.reason === "timeout") failTest("timeout");
      }).catch(() => {});
    // Liveness is ephemeral and stored in Valkey. Thirty seconds keeps failure
    // detection responsive while cutting heartbeat traffic by two thirds.
    }, 30_000);
    return () => window.clearInterval(heartbeat);
  }, [failed, failTest, onlineTestId, started, isReviewing]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  if (!started) {
    return (
      <>
        <div className="overflow-hidden rounded-md border border-border bg-white">
          <div className="border-b border-border bg-amber-50 px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100">
                <ShieldAlert className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <h2 className="font-semibold text-amber-950">Test security warning</h2>
                <p className="mt-1 text-sm text-amber-900">
                  The timer and tab-change guard start only after you confirm. Do not leave this page once the test starts.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase text-stone-500">Duration</p>
              <p className="mt-1 font-bold text-brand-950">{durationMinutes} minutes</p>
            </div>
            <div className="rounded-md border border-border bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase text-stone-500">Questions</p>
              <p className="mt-1 font-bold text-brand-950">{questions.length}</p>
            </div>
            <div className="rounded-md border border-border bg-stone-50 p-3">
              <p className="text-xs font-semibold uppercase text-stone-500">Marks</p>
              <p className="mt-1 font-bold text-brand-950">{totalMarks}</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-border bg-stone-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-stone-600">Changing tab, minimizing, or switching app after start gives 0 marks.</p>
            <Button type="button" onClick={() => setIsStartDialogOpen(true)}>Start Test</Button>
          </div>
        </div>

        <Dialog open={isStartDialogOpen} onOpenChange={setIsStartDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-md bg-amber-100 sm:mx-0">
                <AlertTriangle className="h-6 w-6 text-amber-700" />
              </div>
              <DialogTitle>Ready to start?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm text-stone-600">
              <p>Once you start, the timer begins and tab-change detection is enabled.</p>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                Do not change tabs, minimize, switch apps, or leave this page. Any of these will fail the test with 0 marks.
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setIsStartDialogOpen(false)}>Cancel</Button>
              <Button
                type="button"
                disabled={isStarting}
                onClick={startAttempt}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isStarting ? "Starting..." : "Begin Now"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (failed) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger/10 p-6">
        <h2 className="font-semibold text-danger">Test failed</h2>
        <p className="mt-1 text-sm text-stone-700">
          {failureReason === "tab_switch"
            ? "The test was cancelled because this tab/window changed after the timer started."
            : failureReason === "timeout"
              ? "The test timer expired and your attempt was recorded as 0."
              : failureReason || "The test could not continue."}
        </p>
      </div>
    );
  }

  return (
    <form action={submitOnlineTestAction} onSubmit={() => setStarted(false)} className="space-y-5">
      <input type="hidden" name="onlineTestId" value={onlineTestId} />
      <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-md border border-border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-brand-950">{title}</h2>
          <p className="text-sm text-stone-500">{mode === "MCQ" ? "MCQs only" : "Mix"} - {totalMarks} marks</p>
        </div>
        {isReviewing ? (
          <div className="flex items-center gap-2 rounded-md bg-green-100 px-3 py-2 font-mono text-sm font-bold text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            Score: {totalScore !== undefined ? totalScore : totalMarks}/{totalMarks}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-brand-950 px-3 py-2 font-mono text-sm font-bold text-white">
            <Clock className="h-4 w-4" />
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((question, index) => (
          <div key={question.id} className="rounded-md border border-border bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="font-semibold text-brand-950">Q{index + 1}. {question.prompt}</h3>
              <span className="shrink-0 rounded bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600">{question.marks} marks</span>
            </div>
            {question.questionType === "MCQ" ? (
              <div className="grid gap-2">
                {(question.options || []).map((option, optionIndex) => {
                  const isSelected = isReviewing ? String(answers[question.id]) === String(optionIndex) : false;
                  const isCorrect = isReviewing && question.correctOptionIndex === optionIndex;
                  const isWrong = isReviewing && isSelected && question.correctOptionIndex !== optionIndex;
                  
                  let bgClass = "hover:bg-stone-50";
                  let borderClass = "border-border";
                  if (isCorrect) {
                    bgClass = "bg-green-50"; borderClass = "border-green-500";
                  } else if (isWrong) {
                    bgClass = "bg-red-50"; borderClass = "border-red-500";
                  } else if (isSelected && !isReviewing) {
                    bgClass = "bg-brand-50"; borderClass = "border-brand-500";
                  }

                  return (
                    <label key={optionIndex} className={`flex ${isReviewing ? "" : "cursor-pointer"} items-center gap-3 rounded-md border ${borderClass} ${bgClass} px-3 py-2`}>
                      <input type="radio" name={`answer-${question.id}`} value={optionIndex} defaultChecked={isSelected} disabled={isReviewing} required={!isReviewing} />
                      <span className={`text-sm ${isCorrect ? "text-green-800 font-bold" : isWrong ? "text-red-800 font-bold" : "text-stone-700"}`}>
                        {option}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <textarea name={`answer-${question.id}`} disabled={isReviewing} defaultValue={(answers[question.id] as string) || ""} required={!isReviewing} rows={5} className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm disabled:opacity-75" placeholder={isReviewing ? "No answer provided" : "Write your answer..."} />
            )}
          </div>
        ))}
      </div>

      {!isReviewing && <SubmitButton className="w-full">Submit Test</SubmitButton>}
    </form>
  );
}
