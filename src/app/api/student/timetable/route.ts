import { NextRequest, NextResponse } from 'next/server';
export { corsPreflight as OPTIONS } from '@/lib/cors';
import { db } from '@/db';
import { staffAssignments, subjects, staff, students } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireRole, getTenantContext } from '@/lib/rbac';
import { getAuthenticatedStudentPlacement } from '@/lib/auth-student';
import { getCachedOrFetch } from '@/lib/redis';
import { decodeDashboardPayload, timetableResponse } from '@/lib/dashboard-response';

// Reuse SQL compilation only; section membership is checked fresh on every call.
function prepareMembership() {
  return db.select({
    id: students.id,
    sectionId: students.sectionId,
    institutionId: students.institutionId,
  }).from(students).where(and(eq(students.id, sql.placeholder('userId')), eq(students.institutionId, sql.placeholder('tenantId')))).limit(1).prepare('');
}
let membershipQuery: ReturnType<typeof prepareMembership> | undefined;

export const GET = requireRole(['STUDENT'], async (req: NextRequest, { session }) => {
  const tenantId = getTenantContext(session);

  const student = getAuthenticatedStudentPlacement(session) ?? (await (membershipQuery ??= prepareMembership()).execute({ userId: session.userId, tenantId }))[0];
  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // Students belong to a section, not (yet) to a section_group.
  // Until student↔group membership exists, return every period for the section
  // (including parallel elective groups) so the slot shows the full split.
  const timetable = await getCachedOrFetch(
    `cache:timetable:student:${tenantId}:${student.sectionId}`,
    600,
    () => db.select({
      dayOfWeek: staffAssignments.dayOfWeek,
      startTime: staffAssignments.startTime,
      endTime: staffAssignments.endTime,
      subjectName: subjects.name,
      teacherName: staff.name,
    })
      .from(staffAssignments)
      .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
      .where(and(eq(staffAssignments.sectionId, student.sectionId), eq(staffAssignments.institutionId, tenantId))),
    decodeDashboardPayload,
  );

  return timetableResponse(timetable);
});
