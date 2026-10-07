"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { createTimetableAssignmentAction } from "@/app/actions/institution-actions";
import { useToast } from "@/components/ui/toaster";
import { useRouter } from "next/navigation";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to assign time slot";
}

export function AssignmentForm({
  sectionId,
  classId,
  subjects,
  staff,
}: {
  sectionId: number | null;
  classId?: number | null;
  subjects: { id: number; name: string }[];
  staff: { id: number; name: string }[];
}) {
  const [isBreak, setIsBreak] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const breakInputId = "isBreak";

  return (
    <form action={async (formData) => { 
      try {
        await createTimetableAssignmentAction(formData); 
        toast({ title: "Success", description: "Time slot assigned successfully.", variant: "success" });
        router.refresh();
      } catch (err: unknown) {
        toast({ title: "Error", description: getErrorMessage(err), variant: "destructive" });
      }
    }} className="space-y-4 pt-2">
      <input type="hidden" name="sectionId" value={sectionId || ""} />
      <input type="hidden" name="classId" value={classId || ""} />

      <div className="flex items-center gap-2 mb-4">
        <input 
          type="checkbox" 
          id={breakInputId}
          name="isBreak" 
          checked={isBreak}
          onChange={(e) => setIsBreak(e.target.checked)}
          className="rounded border-stone-300 text-brand-600 focus:ring-brand-500"
        />
        <label htmlFor={breakInputId} className="text-sm font-medium text-stone-700">
          This is a Break / Recess
        </label>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">Day of Week</label>
        <select name="dayOfWeek" required className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface">
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
          <option value="6">Saturday</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Start Time</label>
          <input type="time" name="startTime" required className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">End Time</label>
          <input type="time" name="endTime" required className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>

      {!isBreak && (
        <>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Subject</label>
            <select name="subjectId" required={!isBreak} className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface">
              <option value="">Select a subject...</option>
              {subjects.map(sub => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Teacher</label>
            <select name="staffId" required={!isBreak} className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-surface">
              <option value="">Select a teacher...</option>
              {staff.map(st => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>
        </>
      )}

      <SubmitButton className="w-full mt-4 bg-brand-800 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-900 transition-colors">
        Save {isBreak ? "Break" : "Assignment"}
      </SubmitButton>
    </form>
  );
}
