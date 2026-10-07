import { ParentChildSelector } from "./ParentChildSelector";
import { ParentPeriodSelector } from "./ParentPeriodSelector";

export function ParentChildHeader({
  title,
  description,
  students,
  selectedStudentId,
  path,
}: {
  title: string;
  description: string;
  students: Array<{ id: number; name: string; className: string; sectionName: string }>;
  selectedStudentId: number;
  path: string;
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-stone-300 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Family academic view</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-brand-950">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-3 sm:items-end">
        <ParentPeriodSelector />
        <ParentChildSelector students={students} selectedStudentId={selectedStudentId} path={path} />
      </div>
    </div>
  );
}
