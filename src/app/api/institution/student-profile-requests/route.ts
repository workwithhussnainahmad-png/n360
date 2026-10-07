import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { classes, sections, studentProfileChangeRequests, students } from "@/db/schema";
import { requireRole, getTenantContext } from "@/lib/rbac";
import { desc, eq } from "drizzle-orm";

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);

  const requests = await db.select({
    id: studentProfileChangeRequests.id,
    requestedFields: studentProfileChangeRequests.requestedFields,
    reason: studentProfileChangeRequests.reason,
    status: studentProfileChangeRequests.status,
    adminNote: studentProfileChangeRequests.adminNote,
    createdAt: studentProfileChangeRequests.createdAt,
    studentId: students.id,
    studentName: students.name,
    rollNumber: students.classRollNumber,
    loginRollNumber: students.loginRollNumber,
    fatherName: students.fatherName,
    className: classes.name,
    sectionName: sections.name,
  })
    .from(studentProfileChangeRequests)
    .innerJoin(students, eq(studentProfileChangeRequests.studentId, students.id))
    .innerJoin(classes, eq(students.classId, classes.id))
    .innerJoin(sections, eq(students.sectionId, sections.id))
    .where(eq(studentProfileChangeRequests.institutionId, institutionId))
    .orderBy(desc(studentProfileChangeRequests.createdAt));

  return NextResponse.json({
    requests: requests.map((request) => ({
      ...request,
      createdAt: request.createdAt.toISOString(),
    })),
  });
});
