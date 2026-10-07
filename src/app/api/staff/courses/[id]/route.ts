import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { courseLectures, courses } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { isInstitutionCourseStreamingConfigured } from "@/lib/course-streaming";

const lectureSchema = z.object({ sequence: z.number().int().positive().max(500), title: z.string().trim().min(2).max(180), description: z.string().trim().max(4000).nullable(), videoUrl: z.string().trim().url().max(1000).refine((value) => value.startsWith("https://"), "Use a secure HTTPS video link") }).strict();

async function ownedCourse(id: number, institutionId: number, staffId: number) {
  const [course] = await db.select({ id: courses.id, lectureCount: courses.lectureCount, title: courses.title }).from(courses).where(and(eq(courses.id, id), eq(courses.institutionId, institutionId), eq(courses.staffId, staffId))).limit(1);
  return course;
}

export const GET = requireRole(["STAFF"], async (_req: NextRequest, { session, params }) => {
  const id = Number((await params).id); const institutionId = getTenantContext(session);
  if (!(await isInstitutionCourseStreamingConfigured(institutionId))) return NextResponse.json({ error: "Courses are disabled until the institution configures course streaming" }, { status: 403 });
  const course = await ownedCourse(id, institutionId, session.userId);
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  const lectures = await db.select().from(courseLectures).where(eq(courseLectures.courseId, id)).orderBy(asc(courseLectures.sequence));
  return NextResponse.json({ course, lectures });
});

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session, params }) => {
  const id = Number((await params).id); const institutionId = getTenantContext(session);
  if (!(await isInstitutionCourseStreamingConfigured(institutionId))) return NextResponse.json({ error: "Courses are disabled until the institution configures course streaming" }, { status: 403 });
  const course = await ownedCourse(id, institutionId, session.userId);
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  const parsed = lectureSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid lecture" }, { status: 400 });
  if (parsed.data.sequence > course.lectureCount) return NextResponse.json({ error: `This course has ${course.lectureCount} lecture slots` }, { status: 400 });
  const [lecture] = await db.insert(courseLectures).values({ courseId: id, ...parsed.data }).onConflictDoUpdate({ target: [courseLectures.courseId, courseLectures.sequence], set: { title: parsed.data.title, description: parsed.data.description, videoUrl: parsed.data.videoUrl, updatedAt: new Date() } }).returning();
  return NextResponse.json({ lecture });
});
