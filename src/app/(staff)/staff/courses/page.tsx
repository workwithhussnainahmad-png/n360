"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CheckCircle2, ChevronRight, Circle, Film, Loader2, UploadCloud } from "lucide-react";
import { Upload } from "tus-js-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Option = { id: number; name: string };
type Course = { id: number; title: string; lectureCount: number; subjectName: string };
type Lecture = { id: number; sequence: number; title: string; description: string | null; videoUrl: string };
type CourseDetail = { course: Course; lectures: Lecture[] };
type Pagination = { page: number; pageSize: number; total: number; pages: number };
const field = "w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export default function StaffCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [options, setOptions] = useState<{ classes: Option[]; subjects: Option[]; assignments: Array<{ classId: number; subjectId: number }> }>({ classes: [], subjects: [], assignments: [] });
  const [subjectId, setSubjectId] = useState("");
  const [classIds, setClassIds] = useState<number[]>([]);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [openCourseId, setOpenCourseId] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, pages: 1 });
  const metadataLoaded = useRef(false);

  const load = useCallback(async (pageNumber: number) => {
    const query = new URLSearchParams({ page: String(pageNumber) });
    if (!metadataLoaded.current) query.set("meta", "1");
    const response = await fetch(`/api/staff/courses?${query}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load courses");
    setCourses(data.courses);
    setPagination(data.pagination);
    if (data.options) {
      setOptions(data.options);
      metadataLoaded.current = true;
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(page).catch((error) => setMessage(error.message));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, page]);
  const allowedClasses = useMemo(() => options.classes.filter((item) => options.assignments.some((assignment) => assignment.classId === item.id && assignment.subjectId === Number(subjectId))), [options, subjectId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/staff/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: data.get("title"), subjectId: Number(subjectId), classIds, lectureCount: Number(data.get("lectureCount")) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to create course");
      form.reset(); setSubjectId(""); setClassIds([]);
      if (page === 1) await load(1); else setPage(1);
      setMessage("Course created. Open it to add lectures.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create course"); }
    finally { setSaving(false); }
  }

  const loadCourse = useCallback(async (id: number) => {
    setLoadingDetail(true); setMessage("");
    try {
      const response = await fetch(`/api/staff/courses/${id}`, { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load course"); setDetail(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load course"); setOpenCourseId(null); }
    finally { setLoadingDetail(false); }
  }, []);
  function openCourse(id: number) { setOpenCourseId(id); setDetail(null); void loadCourse(id); }

  async function uploadVideo(file: File, title: string) {
    if (!file.type.startsWith("video/")) throw new Error("Choose a valid video file");
    if (file.size > 5 * 1024 * 1024 * 1024) throw new Error("Video files cannot exceed 5 GB");
    setMessage("Preparing protected upload…");
    const createResponse = await fetch("/api/staff/courses/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, contentType: file.type }),
    });
    const upload = await createResponse.json();
    if (!createResponse.ok) throw new Error(upload.error || "Could not prepare video upload");
    if (upload.uploadMethod === "TUS") {
      await new Promise<void>((resolve, reject) => {
        const task = new Upload(file, {
          endpoint: upload.uploadUrl,
          headers: upload.headers,
          metadata: { filename: file.name, filetype: file.type, title },
          retryDelays: [0, 1500, 4000, 8000],
          onProgress: (sent, total) => setMessage(`Uploading video… ${Math.round((sent / total) * 100)}%`),
          onError: reject,
          onSuccess: () => resolve(),
        });
        task.start();
      });
    } else {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", upload.uploadUrl);
        Object.entries(upload.headers || {}).forEach(([key, value]) => request.setRequestHeader(key, String(value)));
        request.upload.onprogress = (event) => { if (event.lengthComputable) setMessage(`Uploading video… ${Math.round((event.loaded / event.total) * 100)}%`); };
        request.onerror = () => reject(new Error("Video upload failed. Check your connection and try again."));
        request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("The streaming provider rejected the upload."));
        request.send(file);
      });
    }
    setMessage("Upload complete. The provider is preparing adaptive video quality…");
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const statusResponse = await fetch(`/api/staff/courses/uploads?uploadId=${encodeURIComponent(upload.uploadId)}`, { cache: "no-store" });
      const status = await statusResponse.json();
      if (!statusResponse.ok) throw new Error(status.error || "Could not check video processing");
      if (status.status === "READY" && status.videoUrl) return status.videoUrl as string;
      if (status.status === "ERROR") throw new Error(status.error || "The provider could not process this video");
      await new Promise((resolve) => window.setTimeout(resolve, 5000));
    }
    throw new Error("Video processing is taking longer than expected. Try saving the lecture again shortly.");
  }

  async function saveLecture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail) return; const form = event.currentTarget; const data = new FormData(form); setSaving(true); setMessage("");
    try {
      const title = String(data.get("title") || "").trim();
      const file = data.get("videoFile");
      let videoUrl = String(data.get("videoUrl") || "").trim();
      if (file instanceof File && file.size > 0) videoUrl = await uploadVideo(file, title);
      if (!videoUrl) throw new Error("Upload a video or paste an existing provider link");
      const response = await fetch(`/api/staff/courses/${detail.course.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequence: Number(data.get("sequence")), title, description: String(data.get("description") || "") || null, videoUrl }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Unable to save lecture"); form.reset(); await loadCourse(detail.course.id); setMessage("Lecture saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save lecture"); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-6xl space-y-7 p-6">
    <div><h1 className="flex items-center gap-2 font-display text-3xl font-bold text-brand-950"><BookOpen /> Courses</h1><p className="mt-1 text-stone-500">Build structured video courses for your assigned classes.</p></div>
    {message && <p className="rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700">{message}</p>}
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card><CardHeader><CardTitle>New course</CardTitle></CardHeader><CardContent>
        <form onSubmit={create} className="space-y-5 pt-2 text-left">
          <label className="block text-sm font-semibold text-stone-700">Course name<input required name="title" className={`${field} mt-2`} /></label>
          <label className="block text-sm font-semibold text-stone-700">Subject<select required value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setClassIds([]); }} className={`${field} mt-2`}><option value="">Select subject</option>{options.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <fieldset className="space-y-2"><legend className="text-sm font-semibold text-stone-700">Classes</legend>
            {!subjectId && <p className="text-xs text-stone-500">Select a subject first.</p>}
            {subjectId && allowedClasses.length === 0 && <p className="text-xs text-stone-500">No assigned classes are available for this subject.</p>}
            {allowedClasses.map((item) => <label key={item.id} className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm"><input type="checkbox" checked={classIds.includes(item.id)} onChange={() => setClassIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />{item.name}</label>)}
          </fieldset>
          <label className="block text-sm font-semibold text-stone-700">Planned lectures<input required name="lectureCount" type="number" min="1" max="500" className={`${field} mt-2`} /></label>
          <Button className="w-full" disabled={saving || !subjectId || classIds.length === 0}>{saving ? "Creating..." : "Create course"}</Button>
        </form>
      </CardContent></Card>
      <div className="space-y-3">
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-semibold text-brand-950">Your courses</h2><p className="text-sm text-stone-500">Select a course to manage its lectures.</p></div><span className="text-sm text-stone-500">{pagination.total} total</span></div>
        {courses.length === 0 ? <Card><CardContent className="p-10 text-center text-stone-500">No courses created yet.</CardContent></Card> : courses.map((course) => <button key={course.id} type="button" onClick={() => openCourse(course.id)} className="group flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"><span className="flex min-w-0 items-center gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-800"><Film className="h-5 w-5" /></span><span className="min-w-0"><b className="block truncate text-base text-brand-950">{course.title}</b><span className="mt-1 block text-sm text-stone-500">{course.subjectName} · {course.lectureCount} lecture slots</span></span></span><ChevronRight className="h-5 w-5 shrink-0 text-stone-400 transition group-hover:translate-x-1 group-hover:text-brand-700" /></button>)}
        {pagination.pages > 1 && <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3"><Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><span className="text-sm text-stone-500">Page {pagination.page} of {pagination.pages}</span><Button type="button" variant="outline" disabled={page >= pagination.pages} onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}>Next</Button></div>}
      </div>
    </div>

    <Dialog open={openCourseId !== null} onOpenChange={(open) => { if (!open && !saving) { setOpenCourseId(null); setDetail(null); } }}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 sm:p-0">
        <DialogHeader className="border-b border-stone-200 bg-stone-50 px-6 py-5 pr-12 text-left"><DialogTitle className="text-xl text-brand-950">{detail?.course.title || "Course lectures"}</DialogTitle><DialogDescription>{detail ? `${detail.course.subjectName} · ${detail.lectures.length} of ${detail.course.lectureCount} lectures added` : "Loading course details..."}</DialogDescription></DialogHeader>
        {loadingDetail || !detail ? <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-brand-700" /></div> : <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <form onSubmit={saveLecture} className="space-y-5 border-b border-stone-200 p-6 pt-7 text-left lg:border-b-0 lg:border-r">
            <div><h3 className="font-semibold text-brand-950">Add a lecture</h3><p className="mt-1 text-sm leading-6 text-stone-500">Upload directly to the institution&apos;s protected video library. Provider credentials remain hidden from teachers.</p></div>
            <label className="block text-sm font-semibold text-stone-700">Lecture number<input required name="sequence" type="number" min="1" max={detail.course.lectureCount} className={`${field} mt-2`} /></label>
            <label className="block text-sm font-semibold text-stone-700">Lecture title<input required name="title" className={`${field} mt-2`} /></label>
            <label className="block text-sm font-semibold text-stone-700">Description<textarea name="description" rows={4} maxLength={4000} className={`${field} mt-2 resize-y`} /></label>
            <label className="block rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 p-5 text-center text-sm font-semibold text-stone-700"><UploadCloud className="mx-auto mb-2 h-6 w-6 text-brand-700" />Choose video from this device<input name="videoFile" type="file" accept="video/*" className="mt-3 block w-full text-xs font-normal text-stone-500 file:mr-3 file:rounded-md file:border-0 file:bg-brand-900 file:px-3 file:py-2 file:font-semibold file:text-white" /></label>
            <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-stone-400"><span className="h-px flex-1 bg-stone-200" />or use an existing upload<span className="h-px flex-1 bg-stone-200" /></div>
            <label className="block text-sm font-semibold text-stone-700">Existing Bunny or Mux video link<input name="videoUrl" type="url" placeholder="https://..." className={`${field} mt-2`} /></label>
            <Button disabled={saving}>{saving ? "Uploading and saving..." : "Upload and save lecture"}</Button>
          </form>
          <div className="max-h-[68svh] overflow-y-auto bg-stone-50/60 p-6"><h3 className="font-semibold text-brand-950">Lecture order</h3><p className="mt-1 text-sm text-stone-500">Students see these in ascending order.</p><ol className="mt-4 space-y-2">{Array.from({ length: detail.course.lectureCount }, (_, index) => index + 1).map((sequence) => { const lecture = detail.lectures.find((item) => item.sequence === sequence); return <li key={sequence} className="flex gap-3 rounded-lg border border-stone-200 bg-white p-3">{lecture ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-stone-300" />}<div className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-stone-400">Lecture {sequence}</span><span className="mt-0.5 block truncate text-sm font-medium text-stone-800">{lecture?.title || "Not added yet"}</span></div></li>; })}</ol></div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
