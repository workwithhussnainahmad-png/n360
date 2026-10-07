"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

type SubmittedStudent = {
  submissionId: number;
  studentId: number;
  studentName: string;
  rollNumber: string;
  fileKey: string;
  submittedAt: string;
  isLate: boolean;
};

type PendingStudent = {
  studentId: number;
  studentName: string;
  rollNumber: string;
};

export function AssignmentDetails({ assignmentId }: { assignmentId: number }) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submittedStudents, setSubmittedStudents] = useState<SubmittedStudent[]>([]);
  const [pendingStudents, setPendingStudents] = useState<PendingStudent[]>([]);

  const handleToggle = async (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open || loaded || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/staff/assignments?assignmentId=${assignmentId}`);
      if (!res.ok) throw new Error("Failed to load submissions");
      const data = await res.json();
      setSubmittedStudents(data.submittedStudents || []);
      setPendingStudents(data.pendingStudents || []);
      setLoaded(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details className="rounded-md border border-border bg-surface" onToggle={handleToggle}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-900">
        View submissions and pending students
      </summary>
      <div className="border-t border-border p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : loaded ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-brand-950 mb-2">Submitted</h4>
              {submittedStudents.length === 0 ? (
                <p className="text-sm text-stone-500">No student has submitted yet.</p>
              ) : (
                <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
                  {submittedStudents.map((row) => (
                    <div key={row.submissionId} className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-950 truncate">
                          {row.rollNumber} - {row.studentName}
                        </p>
                        <p className={`text-xs ${row.isLate ? 'text-amber-600 font-medium' : 'text-stone-500'}`}>
                          {row.isLate ? 'Late Submitted' : 'Submitted'} {new Date(row.submittedAt).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "UTC",
                          })}
                        </p>
                      </div>
                      <a
                        href={row.fileKey}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-brand-800 hover:underline shrink-0"
                      >
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-brand-950 mb-2">Pending</h4>
              {pendingStudents.length === 0 ? (
                <p className="text-sm text-stone-500">Everyone has submitted.</p>
              ) : (
                <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
                  {pendingStudents.map((student) => (
                    <div key={student.studentId} className="p-3 text-sm text-stone-700">
                      {student.rollNumber} - {student.studentName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
