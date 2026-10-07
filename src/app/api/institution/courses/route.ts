import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  classes,
  courseClasses,
  courseLectures,
  courses,
  staff,
  subjects,
} from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";

export const GET = requireRole(
  ["INSTITUTION", "INSTITUTION_ADMIN"],
  async (req: NextRequest, { session }) => {
    const institutionId = getTenantContext(session);
    const courseId = Number(req.nextUrl.searchParams.get("id"));

    if (Number.isInteger(courseId) && courseId > 0) {
      const [course] = await db
        .select({
          id: courses.id,
          title: courses.title,
          plannedLectures: courses.lectureCount,
          isActive: courses.isActive,
          createdAt: courses.createdAt,
          teacherName: staff.name,
          subjectName: subjects.name,
        })
        .from(courses)
        .innerJoin(
          staff,
          and(
            eq(staff.id, courses.staffId),
            eq(staff.institutionId, institutionId),
          ),
        )
        .innerJoin(subjects, eq(subjects.id, courses.subjectId))
        .where(
          and(
            eq(courses.id, courseId),
            eq(courses.institutionId, institutionId),
          ),
        )
        .limit(1);
      if (!course) {
        return NextResponse.json({ error: "Course not found" }, { status: 404 });
      }

      const [classRows, lectures] = await Promise.all([
        db
          .select({ id: classes.id, name: classes.name })
          .from(courseClasses)
          .innerJoin(classes, eq(classes.id, courseClasses.classId))
          .where(eq(courseClasses.courseId, courseId))
          .orderBy(asc(classes.level), asc(classes.name)),
        db
          .select({
            id: courseLectures.id,
            sequence: courseLectures.sequence,
            title: courseLectures.title,
            description: courseLectures.description,
            createdAt: courseLectures.createdAt,
          })
          .from(courseLectures)
          .where(eq(courseLectures.courseId, courseId))
          .orderBy(asc(courseLectures.sequence)),
      ]);
      return NextResponse.json({ course, classes: classRows, lectures });
    }

    const rows = await db
      .select({
        id: courses.id,
        title: courses.title,
        plannedLectures: courses.lectureCount,
        addedLectures: sql<number>`count(${courseLectures.id})::int`,
        isActive: courses.isActive,
        createdAt: courses.createdAt,
        teacherName: staff.name,
        subjectName: subjects.name,
      })
      .from(courses)
      .innerJoin(
        staff,
        and(
          eq(staff.id, courses.staffId),
          eq(staff.institutionId, institutionId),
        ),
      )
      .innerJoin(subjects, eq(subjects.id, courses.subjectId))
      .leftJoin(courseLectures, eq(courseLectures.courseId, courses.id))
      .where(eq(courses.institutionId, institutionId))
      .groupBy(courses.id, staff.name, subjects.name)
      .orderBy(asc(staff.name), asc(courses.createdAt));

    return NextResponse.json({ courses: rows });
  },
);
