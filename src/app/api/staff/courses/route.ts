import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { classes, courseClasses, courses, sections, staffAssignments, subjects } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { isInstitutionCourseStreamingConfigured } from "@/lib/course-streaming";

const createSchema = z.object({ title: z.string().trim().min(2).max(180), subjectId: z.number().int().positive(), classIds: z.array(z.number().int().positive()).min(1).max(30), lectureCount: z.number().int().min(1).max(500) }).strict();

export const GET = requireRole(["STAFF"], async (req, { session }) => {
  const requestedPage = Number(req.nextUrl.searchParams.get("page"));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 10;
  const includeMeta = req.nextUrl.searchParams.get("meta") === "1";
  const institutionId = getTenantContext(session);
  if (!(await isInstitutionCourseStreamingConfigured(institutionId))) {
    return NextResponse.json(
      { error: "Courses are disabled until the institution configures course streaming" },
      { status: 403 },
    );
  }
  const [rows, [totalRow], assigned] = await Promise.all([
    db.select({ id: courses.id, title: courses.title, lectureCount: courses.lectureCount, subjectName: subjects.name, createdAt: courses.createdAt })
      .from(courses).innerJoin(subjects, eq(subjects.id, courses.subjectId))
      .where(and(eq(courses.institutionId, institutionId), eq(courses.staffId, session.userId))).orderBy(asc(courses.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(courses).where(and(eq(courses.institutionId, institutionId), eq(courses.staffId, session.userId))),
    includeMeta ? db.select({ classId: classes.id, className: classes.name, subjectId: subjects.id, subjectName: subjects.name })
      .from(staffAssignments).innerJoin(sections, eq(sections.id, staffAssignments.sectionId)).innerJoin(classes, eq(classes.id, sections.classId)).innerJoin(subjects, eq(subjects.id, staffAssignments.subjectId))
      .where(and(eq(staffAssignments.institutionId, institutionId), eq(staffAssignments.staffId, session.userId))) : Promise.resolve([]),
  ]);
  const total = Number(totalRow?.total || 0);
  return NextResponse.json({
    courses: rows,
    pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    ...(includeMeta ? { options: { classes: Array.from(new Map(assigned.map((item) => [item.classId, { id: item.classId, name: item.className }])).values()), subjects: Array.from(new Map(assigned.map((item) => [item.subjectId, { id: item.subjectId, name: item.subjectName }])).values()), assignments: assigned } } : {}),
  });
});

export const POST = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid course" }, { status: 400 });
  const institutionId = getTenantContext(session);
  if (!(await isInstitutionCourseStreamingConfigured(institutionId))) {
    return NextResponse.json(
      { error: "Courses are disabled until the institution configures course streaming" },
      { status: 403 },
    );
  }
  const classIds = [...new Set(parsed.data.classIds)];
  const assignments = await db.select({ classId: classes.id, subjectId: staffAssignments.subjectId })
    .from(staffAssignments).innerJoin(sections, eq(sections.id, staffAssignments.sectionId)).innerJoin(classes, eq(classes.id, sections.classId))
    .where(and(eq(staffAssignments.institutionId, institutionId), eq(staffAssignments.staffId, session.userId), eq(staffAssignments.subjectId, parsed.data.subjectId)));
  if (!classIds.every((id) => assignments.some((item) => item.classId === id))) return NextResponse.json({ error: "You can only create courses for your assigned class and subject" }, { status: 403 });
  const [course] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(courses).values({ institutionId, staffId: session.userId, subjectId: parsed.data.subjectId, title: parsed.data.title, lectureCount: parsed.data.lectureCount }).returning({ id: courses.id });
    await tx.insert(courseClasses).values(classIds.map((classId) => ({ courseId: created.id, classId })));
    return [created];
  });
  return NextResponse.json({ course }, { status: 201 });
});
