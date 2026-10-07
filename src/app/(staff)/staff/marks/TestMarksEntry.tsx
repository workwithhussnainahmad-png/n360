"use client";

import { useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { enterMarksManuallyAction } from "@/app/actions/assessment-actions";
import { formatClassSection } from "@/lib/class-section-label";

type SectionOption = {
  sectionId: number;
  sectionName: string;
  classId: number;
  className: string;
};

type RosterStudent = {
  id: number;
  name: string;
  rollNumber: string;
};

export function TestMarksEntry({
  testId,
  classId,
  maxMarks,
  fixedSectionId,
  sectionOptions,
}: {
  testId: number;
  classId: number;
  maxMarks: number;
  /** Section-specific tests always enter marks for that section; class-wide tests let staff pick among their assigned sections. */
  fixedSectionId: number | null;
  sectionOptions: SectionOption[];
}) {
  const eligibleSections = fixedSectionId
    ? sectionOptions.filter((s) => s.sectionId === fixedSectionId)
    : sectionOptions.filter((s) => s.classId === classId);

  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(eligibleSections[0]?.sectionId ?? null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [existingMarks, setExistingMarks] = useState<Record<number, number>>({});

  const loadRoster = async (sectionId: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/staff/marks?sectionId=${sectionId}&testId=${testId}`);
      if (!res.ok) throw new Error("Failed to load roster");
      const data = await res.json();
      const rosterRows: { id: number; name: string; rollNumber: string }[] = data.rosters?.[sectionId] || [];
      setRoster(rosterRows);
      const marksMap: Record<number, number> = {};
      for (const [key, value] of Object.entries(data.marks || {})) {
        const [markTestId, studentId] = key.split(":").map(Number);
        if (markTestId === testId) marksMap[studentId] = value as number;
      }
      setExistingMarks(marksMap);
      setLoaded(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load roster");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!e.currentTarget.open || loaded || loading || !selectedSectionId) return;
    void loadRoster(selectedSectionId);
  };

  const handleSectionChange = (sectionId: number) => {
    setSelectedSectionId(sectionId);
    setLoaded(false);
    void loadRoster(sectionId);
  };

  return (
    <details className="rounded-md border border-border bg-surface" onToggle={handleToggle}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-900 flex items-center gap-2">
        <PenLine className="h-4 w-4" />
        Write marks student by student
      </summary>
      <div className="border-t border-border p-4 space-y-4">
        {eligibleSections.length > 1 && (
          <div>
            <label className="mb-2 block text-xs font-medium text-stone-600">Section</label>
            <select
              value={selectedSectionId ?? ""}
              onChange={(e) => handleSectionChange(Number(e.target.value))}
              className="w-full rounded-md border border-border px-3 py-2 text-sm bg-surface"
            >
              {eligibleSections.map((s) => (
                <option key={s.sectionId} value={s.sectionId}>{formatClassSection(s.className, s.sectionName)}</option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading roster...
          </div>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : loaded && selectedSectionId ? (
          <form action={enterMarksManuallyAction} className="space-y-4">
            <input type="hidden" name="testId" value={testId} />
            <input type="hidden" name="sectionId" value={selectedSectionId} />
            <input type="hidden" name="totalMarks" value={maxMarks} />
            {roster.length === 0 ? (
              <p className="text-sm text-stone-500">No students found for this class.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                <div className="grid grid-cols-[110px_1fr_130px] gap-3 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-600">
                  <span>Roll No.</span>
                  <span>Student</span>
                  <span>Marks</span>
                </div>
                {roster.map((student) => (
                  <div key={student.id} className="grid grid-cols-[110px_1fr_130px] gap-3 items-center border-t border-border px-3 py-2">
                    <input type="hidden" name="rollNumber" value={student.rollNumber} />
                    <span className="text-sm font-medium text-brand-900">{student.rollNumber}</span>
                    <span className="text-sm text-stone-700 truncate">{student.name}</span>
                    <input
                      name="marksObtained"
                      type="number"
                      min="0"
                      max={maxMarks}
                      step="0.01"
                      defaultValue={existingMarks[student.id] ?? ""}
                      required
                      className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
            <SubmitButton>
              <PenLine className="h-4 w-4 mr-2" />
              Save Manual Marks
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </details>
  );
}
