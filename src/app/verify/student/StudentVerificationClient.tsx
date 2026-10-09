"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldX, Loader2, AlertCircle, UserRound, RefreshCw } from "lucide-react";
import styles from "./verification.module.css";

type Result = { verified: false } | { verified: true; checkedAt: string; student: {
  name: string; institution: string; photo: string | null; studentNumber: string;
  className: string | null; sectionName: string | null; rollNumber: string;
  academicStatus: string; yearOfJoining: number;
} };

export function StudentVerificationClient() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const tokenValid = /^(?:[A-Za-z0-9_-]{1,16}\.)?[A-Za-z0-9_-]{43}$/.test(token);
  const [retry, setRetry] = useState(0);
  const key = token + ":" + retry;
  const [state, setState] = useState<{ key: string; result?: Result; error?: string } | null>(null);
  const loading = tokenValid && state?.key !== key;

  useEffect(() => {
    if (!tokenValid) return;
    const controller = new AbortController();
    let cancelled = false;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    async function verify() {
      try {
        const response = await fetch("/api/public/student-verification?token=" + encodeURIComponent(token), { signal: controller.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Verification is temporarily unavailable.");
        if (!cancelled) setState({ key, result: data });
      } catch (error) {
        if (!cancelled) setState({ key, error: controller.signal.aborted ? "The check took too long. Please try again." : error instanceof Error ? error.message : "Please try again." });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void verify();
    return () => { cancelled = true; window.clearTimeout(timeout); controller.abort(); };
  }, [token, tokenValid, key]);

  const current = !loading && tokenValid && state?.key === key ? state : null;
  const student = current?.result?.verified ? current.result.student : null;
  const checkedAt = current?.result?.verified ? current.result.checkedAt : null;
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite" aria-busy={loading}>
        <div className={styles.brand}>Nisaab360 <span>Student ID verification</span></div>
        <div className={styles.body}>
          {loading ? <div className={styles.message}><Loader2 size={28} className="animate-spin" /><h1>Checking student card...</h1><p>Please wait while we check the current record.</p></div> : current?.error ? (
            <div className={styles.message}><AlertCircle size={36} /><h1>Unable to verify right now</h1><p>{current.error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>
          ) : student ? (
            <>
              <div className={styles.resultHeading}>
                <span className={styles.success}><CheckCircle2 size={24} aria-hidden="true" /></span>
                <div><h1>Verified student</h1><p>Matched to a current institution record.</p></div>
              </div>
              <div className={styles.identity}>
                {student.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={student.photo} alt="Student photo" width={80} height={96} decoding="async" referrerPolicy="no-referrer" />
                ) : <span className={styles.photoPlaceholder}><UserRound size={30} aria-hidden="true" /></span>}
                <div className={styles.identityText}><h2>{student.name}</h2><p>{student.institution}</p><span className={styles.badge}>Student ID: {student.studentNumber}</span></div>
              </div>
              <dl className={styles.details}>
                <div><dt>Class</dt><dd>{student.className || "Not assigned"}</dd></div>
                <div><dt>Section</dt><dd>{student.sectionName || "Not assigned"}</dd></div>
                <div><dt>Roll number</dt><dd>{student.rollNumber}</dd></div>
                <div><dt>Academic status</dt><dd className={styles.academicStatus}>{student.academicStatus?.replaceAll("_", " ").toLowerCase()}</dd></div>
                <div><dt>Year joined</dt><dd>{student.yearOfJoining}</dd></div>
                <div><dt>Verified at</dt><dd>{checkedAt && new Date(checkedAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</dd></div>
              </dl>
            </>
          ) : <div className={styles.message}><ShieldX size={40} className={styles.failed} /><h1>Not verified</h1><p>This card does not match a current student record. Contact the institution to confirm its details.</p></div>}
        </div>
        <footer><span>Record checked when this page was opened.</span>{student && <button type="button" onClick={() => setRetry((value) => value + 1)}><RefreshCw size={13} aria-hidden="true" />Check again</button>}</footer>
      </section>
    </main>
  );
}
