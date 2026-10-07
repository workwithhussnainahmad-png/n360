"use client";

import { useTransition } from "react";
import { updateGraduatedStudentAccessAction } from "@/app/actions/institution-actions";
import { useToast } from "@/components/ui/toaster";

export function GraduatedStudentAccessClient({ allowGraduatedStudentAccess }: { allowGraduatedStudentAccess: boolean }) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleToggle = (checked: boolean) => {
    startTransition(async () => {
      try {
        await updateGraduatedStudentAccessAction(checked);
        toast({ title: "Settings Updated", description: "Graduated student access settings saved.", variant: "success" });
      } catch (err: unknown) {
        const description = err instanceof Error ? err.message : "Could not save setting.";
        toast({ title: "Error", description, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h4 className="text-sm font-medium text-stone-900">Graduated Student Access</h4>
        <p className="text-sm text-stone-500">Allow graduated students to log in for profile, transcripts, and attendance only.</p>
      </div>
      <label className="relative inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          className="sr-only peer"
          defaultChecked={allowGraduatedStudentAccess}
          disabled={isPending}
          onChange={(event) => handleToggle(event.target.checked)}
        />
        <div className="h-6 w-11 rounded-full bg-stone-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300" />
      </label>
    </div>
  );
}
