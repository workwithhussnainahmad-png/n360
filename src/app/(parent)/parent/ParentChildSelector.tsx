"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { formatClassSection } from "@/lib/class-section-label";

export function ParentChildSelector({
  students,
  selectedStudentId,
  path,
}: {
  students: Array<{ id: number; name: string; className: string; sectionName: string }>;
  selectedStudentId: number;
  path: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <label className="block min-w-0 sm:min-w-[320px]">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Viewing child</span>
      <select
        value={selectedStudentId}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("student", event.target.value);
          params.delete("page");
          router.push(`${path}?${params.toString()}`);
        }}
        className="h-11 w-full rounded-sm border border-stone-300 bg-white px-3 text-sm font-medium text-brand-950 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        {students.map((child) => (
          <option key={child.id} value={child.id}>{child.name} · {formatClassSection(child.className, child.sectionName, " / ")}</option>
        ))}
      </select>
    </label>
  );
}
