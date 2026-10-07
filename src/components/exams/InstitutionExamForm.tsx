"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { createInstitutionExamAction } from "@/app/actions/assessment-actions";

type Option = {
  id: number;
  name: string;
};

interface InstitutionExamFormProps {
  classes: Option[];
  subjects: Option[];
  submitLabel?: string;
  action?: (formData: FormData) => void | Promise<void>;
  hiddenFields?: Record<string, string>;
  initialValues?: {
    classId: number;
    type: "MONTHLY" | "MID" | "FINAL" | "PROMOTION";
    title: string;
    maxMarks: number;
    date: string;
    subjectIds: number[];
  };
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(value: Date) {
  return value.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatInputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildPreviewDates(startDate: string, subjectCount: number) {
  let current = parseDateInput(startDate);
  if (!current || subjectCount === 0) return { dates: [] as string[], skippedSundays: 0 };

  let skippedSundays = 0;
  if (current.getUTCDay() === 0) {
    current.setUTCDate(current.getUTCDate() + 1);
    skippedSundays += 1;
  }

  const dates: string[] = [];
  for (let index = 0; index < subjectCount; index++) {
    dates.push(formatInputDate(current));
    if (index < subjectCount - 1) {
      current = new Date(current);
      current.setUTCDate(current.getUTCDate() + 1);
      while (current.getUTCDay() === 0) {
        current.setUTCDate(current.getUTCDate() + 1);
        skippedSundays += 1;
      }
    }
  }

  return { dates, skippedSundays };
}

export function InstitutionExamForm({
  classes,
  subjects,
  submitLabel = "Create Exam Dates",
  action = createInstitutionExamAction,
  hiddenFields,
  initialValues,
}: InstitutionExamFormProps) {
  const [date, setDate] = useState(initialValues?.date || "");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>(() => initialValues?.subjectIds || subjects.map((subject) => subject.id));

  const selectedSubjects = useMemo(
    () => subjects.filter((subject) => selectedSubjectIds.includes(subject.id)),
    [selectedSubjectIds, subjects]
  );
  const preview = useMemo(() => buildPreviewDates(date, selectedSubjects.length), [date, selectedSubjects.length]);
  const startDate = preview.dates[0] ? parseDateInput(preview.dates[0]) : null;
  const endDate = preview.dates.at(-1) ? parseDateInput(preview.dates.at(-1) as string) : null;

  const toggleSubject = (subjectId: number, checked: boolean) => {
    setSelectedSubjectIds((current) => (
      checked ? Array.from(new Set([...current, subjectId])) : current.filter((id) => id !== subjectId)
    ));
  };

  return (
    <form action={action} className="space-y-4">
      {hiddenFields && Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Class</label>
        <select name="classId" required defaultValue={initialValues?.classId || ""} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
          <option value="">Select class...</option>
          {classes.map((classRow) => (
            <option key={classRow.id} value={classRow.id}>{classRow.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Exam Type</label>
        <select name="type" required defaultValue={initialValues?.type || "MONTHLY"} className="w-full rounded-md border border-border px-3 py-2 text-sm bg-white">
          <option value="MONTHLY">Monthly</option>
          <option value="MID">Mid</option>
          <option value="FINAL">Final</option>
          <option value="PROMOTION">Promotion</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Title</label>
        <input name="title" required defaultValue={initialValues?.title} placeholder="e.g. Final Term 2026" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Start Date</label>
          <input
            name="date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Total Marks</label>
          <input name="maxMarks" type="number" min="1" step="0.01" required defaultValue={initialValues?.maxMarks} className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="block text-sm font-medium text-stone-700">Books / Subjects</label>
          <button
            type="button"
            className="text-xs font-medium text-brand-700 hover:text-brand-900"
            onClick={() => setSelectedSubjectIds(subjects.map((subject) => subject.id))}
          >
            Select all
          </button>
        </div>
        <div className="max-h-52 overflow-y-auto rounded-md border border-border p-3 space-y-2">
          {subjects.length === 0 ? (
            <p className="text-sm text-stone-500">Create subjects first from Academics.</p>
          ) : (
            subjects.map((subject) => (
              <label key={subject.id} className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  name="subjectIds"
                  value={subject.id}
                  checked={selectedSubjectIds.includes(subject.id)}
                  onChange={(event) => toggleSubject(subject.id, event.target.checked)}
                  className="rounded border-stone-300"
                />
                {subject.name}
              </label>
            ))
          )}
        </div>
      </div>

      <div className="rounded-md border border-brand-100 bg-brand-50/60 p-3">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 h-4 w-4 text-brand-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand-950">
              {startDate && endDate ? `${formatDate(startDate)} to ${formatDate(endDate)}` : "Select start date and subjects to calculate end date"}
            </p>
            <p className="mt-1 text-xs text-stone-600">
              {selectedSubjects.length} subject{selectedSubjects.length === 1 ? "" : "s"} scheduled. Sundays are not used for exams
              {preview.skippedSundays > 0 ? `, so ${preview.skippedSundays} Sunday${preview.skippedSundays === 1 ? "" : "s"} moved the end date forward.` : "."}
            </p>
            {preview.dates.length > 0 && (
              <div className="mt-3 grid gap-2">
                {selectedSubjects.map((subject, index) => {
                  const subjectDate = parseDateInput(preview.dates[index]);
                  return (
                    <div key={subject.id} className="flex items-center justify-between gap-3 rounded-sm bg-white/80 px-2 py-1.5 text-xs">
                      <span className="truncate font-medium text-stone-700">{subject.name}</span>
                      <span className="shrink-0 text-stone-500">{subjectDate ? formatDate(subjectDate) : "-"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <SubmitButton className="w-full" disabled={subjects.length === 0}>{submitLabel}</SubmitButton>
    </form>
  );
}
