import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
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
import { isInstitutionCourseStreamingConfigured } from "@/lib/course-streaming";
import { getTenantContext, requireRole } from "@/lib/rbac";

export const GET = requireRole(
  ["STUDENT"],
  async (_req: NextRequest, { session, params }) => {
    const courseId = Number((await params).id);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      return NextResponse.json({ error: "Invalid course" }, { status: 400 });
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
    const [course] = await db
      .select({
        id: courses.id,
        title: courses.title,
        subjectName: subjects.name,
        teacherName: staff.name,
      })
      .from(courseClasses)
      .innerJoin(courses, eq(courses.id, courseClasses.courseId))
      .innerJoin(subjects, eq(subjects.id, courses.subjectId))
      .innerJoin(staff, eq(staff.id, courses.staffId))
      .where(
        and(
          eq(courses.id, courseId),
          eq(courseClasses.classId, student.classId),
          eq(courses.institutionId, institutionId),
          eq(courses.isActive, true),
        ),
      )
      .limit(1);
    if (!course) {
      return NextResponse.json(
        { error: "Course is not available for your class" },
        { status: 403 },
      );
    }
    const lectures = await db
      .select({
        lectureId: courseLectures.id,
        sequence: courseLectures.sequence,
        lectureTitle: courseLectures.title,
        description: courseLectures.description,
        readAt: courseLectureProgress.readAt,
      })
      .from(courseLectures)
      .leftJoin(
        courseLectureProgress,
        and(
          eq(courseLectureProgress.lectureId, courseLectures.id),
          eq(courseLectureProgress.studentId, student.id),
        ),
      )
      .where(eq(courseLectures.courseId, courseId))
      .orderBy(asc(courseLectures.sequence));
    return NextResponse.json({ course, lectures });
  },
);
