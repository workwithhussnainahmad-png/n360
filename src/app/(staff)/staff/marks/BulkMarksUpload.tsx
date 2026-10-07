"use client";

import { useState } from "react";
import { Download, Send, Upload } from "lucide-react";
import { publishStaffAssessmentResultsAction, uploadMarksCsvAction } from "@/app/actions/assessment-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatClassSection } from "@/lib/class-section-label";

type SectionOption = { sectionId: number; sectionName: string; classId: number; className: string };

export function BulkMarksUpload({
  testId,
  classId,
  fixedSectionId,
  sectionOptions,
  canPublish,
  published,
}: {
  testId: number;
  classId: number;
  fixedSectionId: number | null;
  sectionOptions: SectionOption[];
  canPublish: boolean;
  published: boolean;
}) {
  const eligibleSections = fixedSectionId
    ? sectionOptions.filter((section) => section.sectionId === fixedSectionId)
    : sectionOptions.filter((section) => section.classId === classId);
  const [sectionId, setSectionId] = useState(fixedSectionId ?? eligibleSections[0]?.sectionId ?? 0);

  if (!sectionId) return <p className="text-sm text-amber-700">No assigned section is available for this assessment.</p>;

  return (
    <div className="space-y-3 rounded-md border border-border bg-stone-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-950">Class roster template</p>
          <p className="text-xs text-stone-500">Names and roll numbers are prefilled. Enter marks only, then upload the same CSV.</p>
        </div>
        {eligibleSections.length > 1 && (
          <select value={sectionId} onChange={(event) => setSectionId(Number(event.target.value))} className="rounded-md border border-border bg-white px-3 py-2 text-sm">
            {eligibleSections.map((section) => <option key={section.sectionId} value={section.sectionId}>{formatClassSection(section.className, section.sectionName)}</option>)}
          </select>
        )}
      </div>

      <a href={`/api/staff/marks/template?testId=${testId}&sectionId=${sectionId}`} className="inline-flex items-center rounded-md border border-brand-300 bg-white px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50">
        <Download className="mr-2 h-4 w-4" /> Download prefilled template
      </a>

      <form action={uploadMarksCsvAction} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="testId" value={testId} />
        <input type="hidden" name="sectionId" value={sectionId} />
        <input type="file" name="csv" accept=".csv,text/csv" required className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800" />
        <label className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm text-stone-700">
          <input name="overwrite" type="checkbox" className="h-4 w-4" /> Replace saved marks
        </label>
        <SubmitButton className="shrink-0"><Upload className="mr-2 h-4 w-4" /> Upload results</SubmitButton>
      </form>

      {canPublish && (
        <form action={publishStaffAssessmentResultsAction} className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <input type="hidden" name="testId" value={testId} />
          <input type="hidden" name="sectionId" value={sectionId} />
          <p className="text-xs text-stone-600">{published ? "Results are visible to students and parents." : "Results remain private until every student is marked and you publish."}</p>
          <SubmitButton disabled={published} className="shrink-0"><Send className="mr-2 h-4 w-4" /> {published ? "Published" : "Publish results"}</SubmitButton>
        </form>
      )}
    </div>
  );
}
