import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { classes, sections, staffAssignments, subjects, tests } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";

const todayDateString = () => new Date().toISOString().slice(0, 10);

export const GET = requireRole(["STAFF"], async (_req, { session }) => {
  const institutionId = getTenantContext(session);
  const assigned = await db
    .select({ classId: sections.classId })
    .from(staffAssignments)
    .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
    .where(and(eq(staffAssignments.staffId, session.userId), eq(staffAssignments.institutionId, institutionId)));
  const classIds = [...new Set(assigned.map((row) => row.classId))];
  if (!classIds.length) return NextResponse.json({ exams: [] });

  const rows = await db
    .select({ id: tests.id, title: tests.title, type: tests.type, date: tests.date, endDate: tests.endDate, maxMarks: tests.maxMarks, className: classes.name, subjectName: subjects.name })
    .from(tests)
    .innerJoin(classes, eq(tests.classId, classes.id))
    .leftJoin(subjects, eq(tests.subjectId, subjects.id))
    .where(and(eq(tests.institutionId, institutionId), inArray(tests.classId, classIds), eq(tests.createdByRole, "INSTITUTION"), inArray(tests.type, ["MONTHLY", "MID", "FINAL"])))
    .orderBy(tests.date);

  const today = todayDateString();
  return NextResponse.json({ exams: rows.filter((exam) => (exam.endDate || exam.date) >= today) });
});
