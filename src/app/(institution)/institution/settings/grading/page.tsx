"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type Grade = { letter: string; min: number; max: number };

export default function GradingSettingsPage() {
  const [passingPercentage, setPassingPercentage] = useState(40);
  const [grades, setGrades] = useState<Grade[]>([
    { letter: "A+", min: 90, max: 100 },
    { letter: "A", min: 80, max: 89 },
    { letter: "B", min: 70, max: 79 },
  ]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/institution/settings/grading", { signal: controller.signal })
      .then((response) => response.json())
      .then(({ scale }) => {
        if (scale) {
          setPassingPercentage(scale.passingPercentage);
          setGrades(scale.gradesJson);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const save = async () => {
    const response = await fetch("/api/institution/settings/grading", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passingPercentage, gradesJson: grades }),
    });
    setMessage(response.ok ? "Grading scale saved." : (await response.json()).error || "Unable to save grading scale.");
  };

  return (
    <div className="animate-fade-in max-w-3xl space-y-6">
      <div>
        <Link href="/institution/settings" className="mb-4 inline-flex items-center text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Link>
        <h1 className="font-display text-3xl font-bold text-brand-950">Grading Scale</h1>
        <p className="mt-1 text-stone-500">Set the promotion threshold and grade ranges for your institution.</p>
      </div>
      <div className="space-y-6 rounded-xl border border-border bg-white p-6 pt-7">
        <label className="block text-sm font-medium text-stone-700">Passing percentage<input className="mt-2 block w-full rounded-md border border-border px-3 py-2 sm:w-40" type="number" min="0" max="100" value={passingPercentage} onChange={(event) => setPassingPercentage(Number(event.target.value))} /></label>
        <div className="space-y-3">
          <div><p className="text-sm font-medium text-stone-700">Grade ranges</p><p className="mt-1 text-xs leading-5 text-stone-500">Enter the grade label and its minimum and maximum percentages.</p></div>
          {grades.map((grade, index) => (
            <div key={index} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_110px_110px_auto] sm:items-end">
              <label className="text-xs font-medium text-stone-600">Grade<input className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm" value={grade.letter} onChange={(event) => setGrades(grades.map((item, itemIndex) => itemIndex === index ? { ...item, letter: event.target.value } : item))} /></label>
              <label className="text-xs font-medium text-stone-600">Minimum<input className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm" type="number" value={grade.min} onChange={(event) => setGrades(grades.map((item, itemIndex) => itemIndex === index ? { ...item, min: Number(event.target.value) } : item))} /></label>
              <label className="text-xs font-medium text-stone-600">Maximum<input className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-sm" type="number" value={grade.max} onChange={(event) => setGrades(grades.map((item, itemIndex) => itemIndex === index ? { ...item, max: Number(event.target.value) } : item))} /></label>
              <Button type="button" variant="ghost" className="text-danger" onClick={() => setGrades(grades.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setGrades([...grades, { letter: "", min: 0, max: 100 }])}>Add grade</Button>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5"><Button type="button" onClick={save}>Save grading scale</Button>{message && <p className="text-sm text-stone-600">{message}</p>}</div>
      </div>
    </div>
  );
}
