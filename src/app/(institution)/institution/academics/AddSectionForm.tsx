"use client";

import { useState } from "react";
import type { SyntheticEvent } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Plus } from "lucide-react";
import { createSectionAction } from "@/app/actions/institution-actions";

type StaffOption = { id: number; name: string };

export function AddSectionForm({ classes }: { classes: { id: number; name: string }[] }) {
  const [staffOptions, setStaffOptions] = useState<StaffOption[] | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const loadStaffOptionsOnce = () => {
    if (staffOptions !== null || loadingStaff) return;
    setLoadingStaff(true);
    fetch("/api/institution/staff")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { staff: StaffOption[] } | null) => {
        setStaffOptions(data?.staff ?? []);
      })
      .catch(() => setStaffOptions([]))
      .finally(() => setLoadingStaff(false));
  };

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open) loadStaffOptionsOnce();
  };

  const handleCreateSection = async (formData: FormData) => {
    await createSectionAction(formData);
  };

  return (
    <details className="group" onToggle={handleToggle}>
      <summary className="cursor-pointer list-none text-sm font-medium text-brand-600 hover:text-brand-700 flex items-center gap-2 mb-2">
        <span className="group-open:hidden">+ Advanced: Add Multiple Sections</span>
        <span className="hidden group-open:inline">- Hide Section Form</span>
      </summary>
      <Card>
        <CardHeader className="border-b border-border bg-stone-50/50">
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-brand-600" />
            Add New Section
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form action={handleCreateSection} className="space-y-4 pt-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">Select Class</label>
              <select name="classId" required className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface">
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Section Name</label>
              <input
                type="text"
                name="name"
                required
                maxLength={1}
                pattern="[A-Za-z0-9]"
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="e.g. A"
              />
              <p className="mt-1 text-xs text-stone-500">Optional sections use one character only: A, B, C, or 1. Classes without sections use 0 in login IDs.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Class Teacher (Optional)</label>
              <select
                name="classTeacherId"
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface disabled:bg-stone-100"
                disabled={loadingStaff}
              >
                <option value="">{loadingStaff ? "Loading staff..." : "None"}</option>
                {(staffOptions ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <SubmitButton className="w-full bg-brand-800 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-900 transition-colors">
              Create Section
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </details>
  );
}
