"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherPerformanceChart, type TeacherPerformancePoint } from "@/components/institution/TeacherPerformanceChart";
import { formatClassSection } from "@/lib/class-section-label";

export type TeacherPerformanceGroup = {
  key: string;
  className: string;
  sectionName: string;
  subjectName: string;
  average: number | null;
  points: TeacherPerformancePoint[];
};

export function TeacherPerformancePanels({ groups }: { groups: TeacherPerformanceGroup[] }) {
  const [openKey, setOpenKey] = useState(groups[0]?.key || "");
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const open = group.key === openKey;
        return (
          <Card key={group.key} className="overflow-hidden">
            <CardHeader className="border-b border-border bg-stone-50/60 p-0">
              <button type="button" aria-expanded={open} onClick={() => setOpenKey(group.key)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                <div><CardTitle className="text-lg">{group.subjectName}</CardTitle><p className="mt-1 text-sm text-stone-500">{formatClassSection(group.className, group.sectionName, " · ")} · {group.points.length} assessments</p></div>
                <div className="flex items-center gap-4"><div className="text-right"><p className="font-display text-2xl font-bold text-brand-950">{group.average === null ? "—" : `${group.average}%`}</p><p className="text-xs text-stone-500">period average</p></div><ChevronDown className={`h-5 w-5 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`} /></div>
              </button>
            </CardHeader>
            {open && (
              <CardContent className="space-y-5 p-5">
                <div className="h-64"><TeacherPerformanceChart data={group.points} /></div>
                {group.points.length > 0 && (
                  <details className="rounded-md border border-border">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-900">Assessment details ({group.points.length})</summary>
                    <div className="max-h-64 divide-y divide-border overflow-y-auto border-t border-border">
                      {[...group.points].reverse().map((point) => <div key={point.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3"><div><p className="text-sm font-medium text-brand-950">{point.title}</p><p className="mt-0.5 text-xs text-stone-500">{point.type} · {point.label} · {point.students} students</p></div><p className="text-sm font-bold text-brand-900">{point.average.toFixed(1)}%</p></div>)}
                    </div>
                  </details>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
