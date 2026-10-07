import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  courseClasses,
  courseLectureProgress,
  courseLectures,
  courses,
  staff,
  students,
  subjects,
} from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { isInstitutionCourseStreamingConfigured } from "@/lib/course-streaming";

const progressSchema = z.object({ lectureId: z.number().int().positive() }).strict();
const PAGE_SIZE = 10;

export const GET = requireRole(["STUDENT"], async (req, { session }) => {
  const institutionId = getTenantContext(session);
  if (!(await isInstitutionCourseStreamingConfigured(institutionId))) {
    return NextResponse.json(
      { error: "Courses are not enabled by your institution" },
      { status: 403 },
    );
  }
  const [student] = await db
    .select({ id: students.id, classId: students.classId })
    .from(students)
    .where(
      and(
        eq(students.id, session.userId),
        eq(students.institutionId, institutionId),
      ),
    )
    .limit(1);
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const requestedPage = Number(req.nextUrl.searchParams.get("page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const eligibility = and(
    eq(courseClasses.classId, student.classId),
    eq(courses.institutionId, institutionId),
    eq(courses.isActive, true),
  );
  const [[totalRow], coursePage] = await Promise.all([
    db
      .select({ total: count() })
      .from(courseClasses)
      .innerJoin(courses, eq(courses.id, courseClasses.courseId))
      .where(eligibility),
    db
      .select({ id: courses.id })
      .from(courseClasses)
      .innerJoin(courses, eq(courses.id, courseClasses.courseId))
      .where(eligibility)
      .orderBy(asc(courses.createdAt), asc(courses.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);
  const courseIds = coursePage.map((item) => item.id);
  const summaries = courseIds.length
    ? await db
        .select({
          courseId: courses.id,
          title: courses.title,
          subjectName: subjects.name,
          teacherName: staff.name,
          lectureCount: sql<number>`count(${courseLectures.id})::int`,
          completedCount: sql<number>`count(${courseLectureProgress.id})::int`,
          createdAt: courses.createdAt,
        })
        .from(courses)
        .innerJoin(subjects, eq(subjects.id, courses.subjectId))
        .innerJoin(staff, eq(staff.id, courses.staffId))
        .leftJoin(courseLectures, eq(courseLectures.courseId, courses.id))
        .leftJoin(
          courseLectureProgress,
          and(
            eq(courseLectureProgress.lectureId, courseLectures.id),
            eq(courseLectureProgress.studentId, student.id),
          ),
        )
        .where(inArray(courses.id, courseIds))
        .groupBy(
          courses.id,
          courses.title,
          subjects.name,
          staff.name,
          courses.createdAt,
        )
        .orderBy(asc(courses.createdAt), asc(courses.id))
    : [];
  const total = Number(totalRow?.total || 0);
  return NextResponse.json({
    courses: summaries,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
  });
});

export const POST = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  const parsed = progressSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lecture" }, { status: 400 });
  }
  const institutionId = getTenantContext(session);
  if (!(await isInstitutionCourseStreamingConfigured(institutionId))) {
    return NextResponse.json(
      { error: "Courses are not enabled by your institution" },
      { status: 403 },
    );
  }
  const [student] = await db
    .select({ id: students.id, classId: students.classId })
    .from(students)
    .where(
      and(
        eq(students.id, session.userId),
        eq(students.institutionId, institutionId),
      ),
    )
    .limit(1);
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }
  const [allowed] = await db
    .select({ id: courseLectures.id })
    .from(courseLectures)
    .innerJoin(courses, eq(courses.id, courseLectures.courseId))
    .innerJoin(courseClasses, eq(courseClasses.courseId, courses.id))
    .where(
      and(
        eq(courseLectures.id, parsed.data.lectureId),
        eq(courses.institutionId, institutionId),
        eq(courses.isActive, true),
        eq(courseClasses.classId, student.classId),
      ),
    )
    .limit(1);
  if (!allowed) {
    return NextResponse.json(
      { error: "Lecture is not available for your class" },
      { status: 403 },
    );
  }
  await db
    .insert(courseLectureProgress)
    .values({ lectureId: parsed.data.lectureId, studentId: student.id })
    .onConflictDoNothing();
  return NextResponse.json({ success: true });
});
