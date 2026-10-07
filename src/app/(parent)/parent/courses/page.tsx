import { and, asc, count, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { BookOpenCheck } from "lucide-react";
import { db } from "@/db";
import { courseClasses, courseLectureProgress, courseLectures, courses, staff, subjects } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getParentPortalContext } from "@/lib/parent-access";
import { Card, CardContent } from "@/components/ui/card";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";

export default async function ParentCoursesPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "PARENT") redirect("/parent-login");
  const context = await getParentPortalContext(session, (await searchParams).student);
  const child = context.selectedChild;
  if (!child) return <ParentNoChildren />;
  const rows = await db.select({ id: courses.id, title: courses.title, expected: courses.lectureCount, subject: subjects.name, teacher: staff.name })
    .from(courses).innerJoin(courseClasses, eq(courseClasses.courseId, courses.id)).innerJoin(subjects, eq(courses.subjectId, subjects.id)).innerJoin(staff, eq(courses.staffId, staff.id))
    .where(and(eq(courses.institutionId, context.institutionId), eq(courseClasses.classId, child.classId), eq(courses.isActive, true)))
    .orderBy(asc(courses.title)).limit(20);
  const courseIds = rows.map((row) => row.id);
  const lectureCounts = courseIds.length ? await db.select({ courseId: courseLectures.courseId, total: count() }).from(courseLectures).where(inArray(courseLectures.courseId, courseIds)).groupBy(courseLectures.courseId) : [];
  const lectureIds = courseIds.length ? await db.select({ id: courseLectures.id, courseId: courseLectures.courseId }).from(courseLectures).where(inArray(courseLectures.courseId, courseIds)) : [];
  const progress = lectureIds.length ? await db.select({ lectureId: courseLectureProgress.lectureId }).from(courseLectureProgress).where(and(eq(courseLectureProgress.studentId, child.id), inArray(courseLectureProgress.lectureId, lectureIds.map((row) => row.id)))) : [];
  const totals = new Map(lectureCounts.map((row) => [row.courseId, Number(row.total)]));
  const lectureCourse = new Map(lectureIds.map((row) => [row.id, row.courseId]));
  const completed = new Map<number, number>();
  for (const item of progress) { const courseId = lectureCourse.get(item.lectureId); if (courseId) completed.set(courseId, (completed.get(courseId) || 0) + 1); }

  return <div className="space-y-6"><ParentChildHeader title="Courses" description="Monitor lecture availability and learning progress." students={context.children} selectedStudentId={child.id} path="/parent/courses" />
    {rows.length === 0 ? <Card><CardContent className="grid min-h-52 place-items-center p-8 text-center"><div><BookOpenCheck className="mx-auto h-9 w-9 text-stone-300" /><p className="mt-3 text-sm text-stone-500">No active courses are assigned to this class.</p></div></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2">{rows.map((course) => { const total = totals.get(course.id) || 0; const done = completed.get(course.id) || 0; const percent = total ? Math.round(done / total * 100) : 0; return <Card key={course.id}><CardContent className="p-5"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">{course.subject}</p><h2 className="mt-2 text-lg font-bold text-brand-950">{course.title}</h2><p className="mt-1 text-sm text-stone-500">Teacher: {course.teacher}</p><div className="mt-5 flex items-center justify-between text-xs text-stone-600"><span>{done} of {total} lectures completed</span><span className="font-semibold">{percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-brand-700" style={{ width: `${percent}%` }} /></div></CardContent></Card>; })}</div>}
    <p className="text-xs text-stone-500">Videos and lesson content remain in the Student Portal; this view is for parent progress monitoring.</p>
  </div>;
}
