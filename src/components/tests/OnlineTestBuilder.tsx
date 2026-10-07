"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createOnlineTestAction } from "@/app/actions/online-test-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { formatClassSection } from "@/lib/class-section-label";

type SectionOption = {
  id: number;
  className: string;
  sectionName: string;
};

type SubjectOption = {
  id: number;
  name: string;
  sectionId: number;
};

export function OnlineTestBuilder({ sections, subjects }: { sections: SectionOption[]; subjects: SubjectOption[] }) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ? String(sections[0].id) : "");
  const [mode, setMode] = useState<"MCQ" | "MIX">("MCQ");
  const [mcqs, setMcqs] = useState([0]);
  const [shorts, setShorts] = useState<number[]>([]);

  const availableSubjects = useMemo(
    () => subjects.filter((subject) => String(subject.sectionId) === sectionId),
    [sectionId, subjects]
  );

  return (
    <form action={createOnlineTestAction} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Class / Section</label>
          <select
            name="sectionId"
            required
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>{formatClassSection(section.className, section.sectionName)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Subject</label>
          <select name="subjectId" required className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm">
            {availableSubjects.map((subject) => (
              <option key={`${subject.sectionId}-${subject.id}`} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_150px_150px]">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Test Title</label>
          <input name="title" required placeholder="e.g. Chapter 4 Online Test" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">Timer</label>
          <input name="durationMinutes" type="number" min="1" required placeholder="Minutes" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">MCQ Marks Each</label>
          <input name="mcqMarks" type="number" min="0.5" step="0.5" required defaultValue="1" className="w-full rounded-md border border-border px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">Test Type</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-border bg-stone-50 p-1">
          {(["MCQ", "MIX"] as const).map((value) => (
            <label key={value} className={`cursor-pointer rounded px-3 py-2 text-center text-sm font-medium ${mode === value ? "bg-white text-brand-900 shadow-sm" : "text-stone-600"}`}>
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
              {value === "MCQ" ? "MCQs only" : "Mix"}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-brand-950">MCQs</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setMcqs((current) => [...current, Date.now()])}>
            <Plus className="mr-2 h-4 w-4" />
            Add MCQ
          </Button>
        </div>
        {mcqs.map((key, index) => (
          <div key={key} className="rounded-md border border-border bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-900">MCQ {index + 1}</p>
              {mcqs.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => setMcqs((current) => current.filter((item) => item !== key))}>
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              )}
            </div>
            <input name="mcqPrompt" required placeholder="Question" className="mb-3 w-full rounded-md border border-border px-3 py-2 text-sm" />
            <div className="grid gap-2 sm:grid-cols-2">
              {[0, 1, 2, 3].map((optionIndex) => (
                <label key={optionIndex} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <input type="radio" name={`mcqCorrect-${index}`} value={optionIndex} required />
                  <input name={`mcqOption-${index}-${optionIndex}`} required placeholder={`Option ${optionIndex + 1}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {mode === "MIX" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-brand-950">Short Questions</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setShorts((current) => [...current, Date.now()])}>
              <Plus className="mr-2 h-4 w-4" />
              Add Short
            </Button>
          </div>
          {shorts.length === 0 && <p className="rounded-md border border-dashed border-border p-4 text-sm text-stone-500">Add at least one short question for Mix tests.</p>}
          {shorts.map((key, index) => (
            <div key={key} className="grid gap-3 rounded-md border border-border bg-white p-4 sm:grid-cols-[1fr_120px_auto]">
              <input name="shortPrompt" required placeholder={`Short question ${index + 1}`} className="rounded-md border border-border px-3 py-2 text-sm" />
              <input name="shortMarks" type="number" min="1" step="0.5" required placeholder="Marks" className="rounded-md border border-border px-3 py-2 text-sm" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setShorts((current) => current.filter((item) => item !== key))}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Students are warned before starting. If they change tab after the test starts, the system submits a failed attempt with 0 marks.
      </div>

      <SubmitButton className="w-full">Host Test</SubmitButton>
    </form>
  );
}
