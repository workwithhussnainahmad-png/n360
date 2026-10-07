"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Check, X, Clock, HelpCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { submitAttendanceAction } from "@/app/actions/staff-actions";

const STATUS_STATES = [
  { value: "PRESENT", label: "P", color: "bg-success text-white border-success", icon: Check },
  { value: "ABSENT", label: "A", color: "bg-danger text-white border-danger", icon: X },
  { value: "LATE", label: "L", color: "bg-warning text-white border-warning", icon: Clock },
  { value: "LEAVE", label: "LV", color: "bg-stone-500 text-white border-stone-500", icon: HelpCircle },
];

type AttendanceStudent = {
  id: number;
  name: string;
  loginRollNumber?: string;
  status?: string;
};

type AssignedSection = {
  id: number;
  name: string;
  className?: string;
};

export function AttendanceClient({
  assignedSections,
  initialSectionId,
  initialStudents,
  initialAlreadyMarked,
}: {
  assignedSections: AssignedSection[],
  initialSectionId: number | null,
  initialStudents: AttendanceStudent[],
  initialAlreadyMarked: boolean,
}) {
  const [selectedSectionId, setSelectedSectionId] = useState<number>(initialSectionId || 0);

  // Roster cache keyed by sectionId — sections are fetched from the API only
  // the first time they're selected, never all at once on page load.
  const [studentsBySection, setStudentsBySection] = useState<Record<number, AttendanceStudent[]>>(
    initialSectionId ? { [initialSectionId]: initialStudents } : {}
  );
  const [markedSections, setMarkedSections] = useState<Record<number, boolean>>(
    initialSectionId ? { [initialSectionId]: initialAlreadyMarked } : {}
  );
  const [isLoadingSection, setIsLoadingSection] = useState(false);

  const initialRoster = (initialSectionId ? initialStudents : []).map(s => ({ ...s, status: "PRESENT" }));

  const [students, setStudents] = useState<(AttendanceStudent & { status: string })[]>(initialRoster);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSectionChange = async (id: number) => {
    setSelectedSectionId(id);

    const cached = studentsBySection[id];
    if (cached) {
      setStudents(cached.map(s => ({ ...s, status: "PRESENT" })));
      return;
    }

    setIsLoadingSection(true);
    try {
      const res = await fetch(`/api/staff/attendance?view=mark&sectionId=${id}`);
      if (!res.ok) throw new Error("Failed to load section roster");
      const data = await res.json();
      const sectionStudents: AttendanceStudent[] = data.students || [];
      setStudentsBySection((prev) => ({ ...prev, [id]: sectionStudents }));
      setMarkedSections((prev) => ({ ...prev, [id]: Boolean(data.alreadyMarkedToday) }));
      setStudents(sectionStudents.map(s => ({ ...s, status: "PRESENT" })));
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to load section", variant: "destructive" });
    } finally {
      setIsLoadingSection(false);
    }
  };

  const toggleStatus = (id: number, newStatus?: string) => {
    setStudents(current => current.map(student => {
      if (student.id !== id) return student;
      if (newStatus) return { ...student, status: newStatus };
      const currentIndex = STATUS_STATES.findIndex(s => s.value === student.status);
      const nextIndex = (currentIndex + 1) % STATUS_STATES.length;
      return { ...student, status: STATUS_STATES[nextIndex].value };
    }));
  };

  const handleSubmit = async () => {
    if (!selectedSectionId) return;
    setIsSubmitting(true);
    try {
      const records = students.map(s => ({ studentId: s.id, status: s.status as "PRESENT" | "ABSENT" | "LATE" | "LEAVE" }));
      await submitAttendanceAction(selectedSectionId, new Date(), records);
      toast({ title: "Success", description: "Attendance submitted successfully", variant: "success" });
      setMarkedSections((current) => ({ ...current, [selectedSectionId]: true }));
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to submit", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const presentCount = students.filter(s => s.status === "PRESENT").length;
  const isAlreadyMarked = Boolean(markedSections[selectedSectionId]);

  return (
    <div className="space-y-6 animate-fade-in pb-24 lg:pb-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-brand-950">Mark Attendance</h1>
          <p className="text-stone-500 mt-1 text-sm lg:text-base">Select attendance status for each student</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {assignedSections.length <= 1 ? (
            <div className="h-10 w-full sm:w-auto rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium flex items-center min-w-[150px] shadow-sm text-brand-900">
              {assignedSections.length === 1 
                ? `${assignedSections[0].className} - ${assignedSections[0].name}` 
                : "No Assigned Classes"}
            </div>
          ) : (
            <select 
              value={selectedSectionId}
              onChange={(e) => handleSectionChange(parseInt(e.target.value))}
              className="h-10 w-full sm:w-auto rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring min-w-[150px] shadow-sm"
            >
              {assignedSections.map(s => (
                <option key={s.id} value={s.id}>{s.className} - {s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-2">
          {isAlreadyMarked && (
            <div className="p-4 mb-4 text-sm text-brand-900 bg-brand-50 border border-brand-200 rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4" />
              Attendance has already been marked for this class today.
            </div>
          )}
          {isLoadingSection ? (
            <div className="p-6 sm:p-12 text-center text-stone-500 border border-border rounded-lg bg-surface flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading roster...
            </div>
          ) : students.length === 0 ? (
            <div className="p-6 sm:p-12 text-center text-stone-500 border border-border rounded-lg bg-surface">
              No students enrolled in this section.
            </div>
          ) : null}
          {!isLoadingSection && students.map((student) => {
            return (
              <div 
                key={student.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border bg-surface shadow-sm gap-4"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-brand-900">{student.name}</span>
                  <span className="text-xs text-stone-500">{student.loginRollNumber}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {STATUS_STATES.map((statusObj) => {
                    const isSelected = student.status === statusObj.value;
                    return (
                      <button
                        key={statusObj.value}
                        onClick={() => toggleStatus(student.id, statusObj.value)}
                        disabled={isAlreadyMarked}
                        className={cn(
                          "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors border",
                          isSelected 
                            ? statusObj.color
                            : "bg-stone-50 text-stone-600 border-border hover:bg-stone-100",
                          isAlreadyMarked && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {statusObj.value.charAt(0) + statusObj.value.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden lg:block space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Total Students</span>
                <span className="font-semibold">{students.length}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Present</span>
                <span className="font-semibold text-success">{presentCount}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-stone-500">Absent</span>
                <span className="font-semibold text-danger">{students.length - presentCount}</span>
              </div>
              
              <div className="pt-4 border-t border-border space-y-2">
                <p className="text-xs font-medium text-stone-500 mb-2 uppercase tracking-wider">Legend</p>
                {STATUS_STATES.map(s => (
                  <div key={s.value} className="flex items-center gap-2 text-sm">
                    <div className={cn("w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold", s.color)}>
                      {s.label}
                    </div>
                    <span className="text-stone-600 capitalize">{s.value.toLowerCase()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Floating Action Bar for Mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-surface border-t border-border shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-stone-500 block text-xs">Total</span>
              <span className="font-semibold">{students.length}</span>
            </div>
            <div>
              <span className="text-stone-500 block text-xs">Present</span>
              <span className="font-semibold text-success">{presentCount}</span>
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={isSubmitting || isAlreadyMarked} className="bg-brand-800 hover:bg-brand-900 text-white min-w-[120px] disabled:opacity-50">
            {isAlreadyMarked ? "Marked" : isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </div>

      {/* Desktop Submit Button */}
      <div className="hidden lg:flex justify-end pt-6">
        <Button onClick={handleSubmit} disabled={isSubmitting || isAlreadyMarked} size="lg" className="bg-brand-800 hover:bg-brand-900 text-white min-w-[200px] disabled:opacity-50">
          {isAlreadyMarked ? "Attendance Already Marked" : isSubmitting ? "Submitting Attendance..." : "Submit Attendance"}
        </Button>
      </div>
    </div>
  );
}
