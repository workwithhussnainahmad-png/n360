"use client";

import { useRouter } from "next/navigation";

export function SectionSelector({ 
  sections,
  defaultSectionId
}: { 
  sections: { value: string; label: string }[], 
  defaultSectionId: string | number | null 
}) {
  const router = useRouter();

  return (
    <select 
      className="h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 min-w-[200px]"
      defaultValue={defaultSectionId || ""}
      onChange={(e) => {
        const value = e.target.value;
        const [type, id] = value.split(":");
        router.push(`/institution/timetable?${type}Id=${id}`);
      }}
    >
      {sections.map(s => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
