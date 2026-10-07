"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, ChevronRight, Circle, Loader2, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CourseSummary = {
  id: number; title: string; teacherName: string; subjectName: string;
  plannedLectures: number; addedLectures: number; isActive: boolean; createdAt: string;
};
type CourseDetail = {
  course: Omit<CourseSummary, "addedLectures">;
  classes: Array<{ id: number; name: string }>;
  lectures: Array<{ id: number; sequence: number; title: string; description: string | null; createdAt: string }>;
};

export default function InstitutionCoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/institution/courses", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load courses");
    setCourses(data.courses);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) => setError(reason.message)).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openCourse(id: number) {
    setSelectedId(id); setDetail(null); setDetailLoading(true); setError("");
    try {
      const response = await fetch(`/api/institution/courses?id=${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load course");
      setDetail(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load course"); setSelectedId(null); }
    finally { setDetailLoading(false); }
  }

  return <div className="space-y-6">
    <div><h1 className="flex items-center gap-2 font-display text-3xl font-bold text-brand-950"><BookOpen className="h-7 w-7" /> Courses</h1><p className="mt-1 text-stone-500">Review every course created by your teachers and inspect its lecture plan.</p></div>
    {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <div className="grid min-h-64 place-items-center rounded-xl border bg-white"><Loader2 className="h-7 w-7 animate-spin text-brand-700" /></div> : courses.length === 0 ? <Card><CardContent className="flex flex-col items-center justify-center p-12 text-center"><BookOpen className="mx-auto h-9 w-9 text-stone-300" /><h2 className="mt-3 text-center font-semibold text-brand-950">No teacher courses yet</h2><p className="mt-1 text-center text-sm text-stone-500" style={{ textAlign: "center" }}>Courses will appear here after teachers create them.</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{courses.map((course) => {
      const percent = Math.min(100, Math.round((course.addedLectures / course.plannedLectures) * 100));
      return <button key={course.id} type="button" onClick={() => void openCourse(course.id)} className="group rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"><div className="flex items-start justify-between gap-4"><span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-800"><BookOpen className="h-5 w-5" /></span><ChevronRight className="h-5 w-5 text-stone-400 transition group-hover:translate-x-1 group-hover:text-brand-700" /></div><h2 className="mt-4 text-lg font-semibold text-brand-950">{course.title}</h2><p className="mt-1 text-sm text-stone-500">{course.subjectName}</p><p className="mt-3 flex items-center gap-2 text-sm text-stone-700"><UserRound className="h-4 w-4 text-stone-400" />{course.teacherName}</p><div className="mt-4"><div className="mb-2 flex justify-between text-xs text-stone-500"><span>{course.addedLectures} of {course.plannedLectures} lectures added</span><span>{percent}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-brand-700" style={{ width: `${percent}%` }} /></div></div></button>;
    })}</div>}

    <Dialog open={selectedId !== null} onOpenChange={(open) => { if (!open) { setSelectedId(null); setDetail(null); } }}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0 sm:p-0"><DialogHeader className="border-b border-stone-200 bg-stone-50 px-6 py-5 pr-12 text-left"><DialogTitle className="text-xl text-brand-950">{detail?.course.title || "Course details"}</DialogTitle><DialogDescription>{detail ? `${detail.course.subjectName} · ${detail.course.teacherName}` : "Loading course details..."}</DialogDescription></DialogHeader>
        {detailLoading || !detail ? <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-brand-700" /></div> : <div className="grid gap-6 p-6 lg:grid-cols-[240px_minmax(0,1fr)]"><aside><p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Assigned classes</p><div className="mt-3 flex flex-wrap gap-2">{detail.classes.map((item) => <span key={item.id} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800">{item.name}</span>)}</div><dl className="mt-6 space-y-3 text-sm"><div><dt className="text-stone-500">Teacher</dt><dd className="mt-0.5 font-medium text-stone-900">{detail.course.teacherName}</dd></div><div><dt className="text-stone-500">Subject</dt><dd className="mt-0.5 font-medium text-stone-900">{detail.course.subjectName}</dd></div><div><dt className="text-stone-500">Planned lectures</dt><dd className="mt-0.5 font-medium text-stone-900">{detail.course.plannedLectures}</dd></div><div><dt className="text-stone-500">Status</dt><dd className="mt-0.5 font-medium text-stone-900">{detail.course.isActive ? "Active" : "Inactive"}</dd></div></dl></aside><section className="min-w-0"><h3 className="font-semibold text-brand-950">Lectures</h3><p className="mt-1 text-sm text-stone-500">Listed in the same ascending order students receive them.</p><ol className="mt-4 max-h-[56svh] space-y-2 overflow-y-auto pr-1">{Array.from({ length: detail.course.plannedLectures }, (_, index) => index + 1).map((sequence) => { const lecture = detail.lectures.find((item) => item.sequence === sequence); return <li key={sequence} className="flex gap-3 rounded-lg border border-stone-200 p-3">{lecture ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-stone-300" />}<div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Lecture {sequence}</p><p className="mt-0.5 text-sm font-medium text-stone-900">{lecture?.title || "Not added yet"}</p>{lecture?.description && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-600">{lecture.description}</p>}</div></li>; })}</ol></section></div>}
      </DialogContent>
    </Dialog>
  </div>;
}
