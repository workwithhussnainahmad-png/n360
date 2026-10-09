import { ParentChildSelector } from "./ParentChildSelector";
import { ParentPeriodSelector } from "./ParentPeriodSelector";

export function ParentChildHeader({
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
    <div className="flex flex-col gap-5 border-b border-stone-300 pb-6 sm:flex-row sm:items-end sm:justify-end">

      <div className="flex min-w-0 flex-col items-start gap-3 sm:items-end">
        <ParentPeriodSelector />
        <ParentChildSelector students={students} selectedStudentId={selectedStudentId} path={path} />
      </div>
    </div>
  );
}
