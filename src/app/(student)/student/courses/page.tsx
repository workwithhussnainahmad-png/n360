"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, ChevronRight, CirclePlay, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SecureVideoPlayer } from "@/components/course/SecureVideoPlayer";

type CourseSummary = {
  courseId: number;
  title: string;
  subjectName: string;
  teacherName: string;
  lectureCount: number;
  completedCount: number;
};
type Lecture = {
  lectureId: number;
  sequence: number;
  lectureTitle: string;
  description: string | null;
  readAt: string | null;
};
type CourseDetail = {
  course: { id: number; title: string; subjectName: string; teacherName: string };
  lectures: Lecture[];
};
type Pagination = { page: number; pageSize: number; total: number; pages: number };

export default function StudentCoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<CourseSummary | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedLectureId, setSelectedLectureId] = useState<number | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [loadingVideo, setLoadingVideo] = useState(false);

  const load = useCallback(async (pageNumber: number) => {
    const response = await fetch(`/api/student/courses?page=${pageNumber}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load courses");
    setCourses(data.courses);
    setPagination(data.pagination);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      void load(page)
        .catch((error) => setMessage(error.message))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, page]);

  async function openCourse(course: CourseSummary) {
    setSelectedCourse(course);
    setDetail(null);
    setSelectedLectureId(null);
    setPlaybackUrl("");
    setMessage("");
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/student/courses/${course.courseId}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load course");
      setDetail(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load course");
      setSelectedCourse(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function watch(lectureId: number) {
    setSelectedLectureId(lectureId);
    setPlaybackUrl("");
    setLoadingVideo(true);
    setMessage("");
    try {
      const response = await fetch(`/api/student/courses/lectures/${lectureId}/playback`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to open lecture");
      if (!data.playbackUrl) throw new Error("Secure playback is unavailable");
      setPlaybackUrl(data.playbackUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to open lecture");
    } finally {
      setLoadingVideo(false);
    }
  }

  async function markRead(lectureId: number) {
    const lecture = detail?.lectures.find((item) => item.lectureId === lectureId);
    if (!lecture || lecture.readAt) return;
    const response = await fetch("/api/student/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lectureId }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to update lecture progress");
    setDetail((current) => current ? { ...current, lectures: current.lectures.map((item) => item.lectureId === lectureId ? { ...item, readAt: new Date().toISOString() } : item) } : current);
    setCourses((current) => current.map((course) => course.courseId === selectedCourse?.courseId ? { ...course, completedCount: Math.min(course.lectureCount, course.completedCount + 1) } : course));
    setSelectedCourse((current) => current ? { ...current, completedCount: Math.min(current.lectureCount, current.completedCount + 1) } : current);
  }

  const selectedLecture = detail?.lectures.find((lecture) => lecture.lectureId === selectedLectureId);

  return <div className="mx-auto max-w-6xl space-y-7 p-6">
    <div><h1 className="flex items-center gap-2 font-display text-3xl font-bold text-brand-950"><BookOpen /> Courses</h1><p className="mt-1 text-stone-500">Continue your lessons and keep track of completed lectures.</p></div>
    {message && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
    {loading ? <div className="grid min-h-64 place-items-center rounded-xl border border-stone-200 bg-white"><Loader2 className="h-7 w-7 animate-spin text-brand-700" /></div> : courses.length === 0 ? <div className="rounded-xl border border-stone-200 bg-white p-12 text-center"><BookOpen className="mx-auto h-9 w-9 text-stone-300" /><h2 className="mt-3 font-semibold text-brand-950">No courses yet</h2><p className="mt-1 text-sm text-stone-500">Courses assigned to your class will appear here.</p></div> : <div className="grid gap-4 md:grid-cols-2">{courses.map((course) => {
      const progress = course.lectureCount ? Math.round((course.completedCount / course.lectureCount) * 100) : 0;
      return <button key={course.courseId} type="button" onClick={() => void openCourse(course)} className="group rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"><div className="flex items-start justify-between gap-4"><span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-800"><CirclePlay className="h-5 w-5" /></span><ChevronRight className="h-5 w-5 text-stone-400 transition group-hover:translate-x-1 group-hover:text-brand-700" /></div><h2 className="mt-5 text-lg font-semibold text-brand-950">{course.title}</h2><p className="mt-1 text-sm text-stone-500">{course.subjectName} · {course.teacherName}</p><div className="mt-5"><div className="mb-2 flex justify-between text-xs text-stone-500"><span>{course.completedCount} of {course.lectureCount} completed</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-brand-700 transition-all" style={{ width: `${progress}%` }} /></div></div></button>;
    })}</div>}
    {pagination.pages > 1 && <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3"><Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><span className="text-sm text-stone-500">Page {pagination.page} of {pagination.pages} · {pagination.total} courses</span><Button type="button" variant="outline" disabled={page >= pagination.pages || loading} onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}>Next</Button></div>}

    <Dialog open={selectedCourse !== null} onOpenChange={(open) => { if (!open) { setSelectedCourse(null); setDetail(null); setSelectedLectureId(null); setPlaybackUrl(""); } }}>
      <DialogContent className="max-w-6xl gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="border-b border-stone-200 bg-stone-50 px-6 py-5 pr-12 text-left"><DialogTitle className="text-xl text-brand-950">{selectedCourse?.title || "Course"}</DialogTitle><DialogDescription>{selectedCourse ? `${selectedCourse.subjectName} · ${selectedCourse.teacherName}` : "Course lectures"}</DialogDescription></DialogHeader>
        {loadingDetail || !detail ? <div className="grid min-h-[540px] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-brand-700" /></div> : <div className="grid min-h-[540px] lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="max-h-[72svh] overflow-y-auto border-b border-stone-200 bg-stone-50/70 p-4 lg:border-b-0 lg:border-r"><p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-stone-400">{detail.lectures.length} lectures</p><ol className="space-y-2">{detail.lectures.map((lecture) => <li key={lecture.lectureId}><button type="button" onClick={() => void watch(lecture.lectureId)} className={`w-full rounded-lg border p-3 text-left transition ${selectedLectureId === lecture.lectureId ? "border-brand-300 bg-brand-50" : "border-transparent bg-white hover:border-stone-200"}`}><span className="flex items-start gap-3">{lecture.readAt ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Play className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />}<span className="min-w-0"><span className="block text-xs text-stone-400">Lecture {lecture.sequence}</span><span className="mt-0.5 block text-sm font-medium text-stone-800">{lecture.lectureTitle}</span></span></span></button></li>)}</ol></aside>
          <main className="min-w-0 p-6">{!selectedLecture ? <div className="grid h-full min-h-96 place-items-center rounded-xl border border-dashed border-stone-300 bg-stone-50 text-center"><div><CirclePlay className="mx-auto h-10 w-10 text-stone-300" /><h3 className="mt-3 font-semibold text-brand-950">Select a lecture</h3><p className="mt-1 text-sm text-stone-500">Choose a lecture from the list to start watching.</p></div></div> : <div><div className="overflow-hidden rounded-xl bg-brand-950 shadow-lg">{loadingVideo ? <div className="grid aspect-video place-items-center"><Loader2 className="h-8 w-8 animate-spin text-white" /></div> : playbackUrl ? <SecureVideoPlayer key={playbackUrl} source={playbackUrl} title={selectedLecture.lectureTitle} onEnded={() => void markRead(selectedLecture.lectureId)} /> : <div className="grid aspect-video place-items-center px-6 text-center text-sm text-white/70">The video could not be prepared. Check the message above.</div>}</div><div className="mt-5 flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Lecture {selectedLecture.sequence}</p><h3 className="mt-1 text-xl font-semibold text-brand-950">{selectedLecture.lectureTitle}</h3>{selectedLecture.description && <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-stone-600">{selectedLecture.description}</p>}</div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${selectedLecture.readAt ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}>{selectedLecture.readAt ? "Completed" : "Completes automatically at the end"}</span></div></div>}</main>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
