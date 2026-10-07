import { NextRequest } from 'next/server';
export { corsPreflight as OPTIONS } from '@/lib/cors';
import { db } from '@/db';
import { classes, staffAssignments, subjects, sections } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole, getTenantContext } from '@/lib/rbac';
import { getCachedOrFetch } from '@/lib/redis';
import { decodeDashboardPayload, timetableResponse } from '@/lib/dashboard-response';

export const GET = requireRole(['STAFF'], async (req: NextRequest, { session }) => {
  const tenantId = getTenantContext(session);

  const timetable = await getCachedOrFetch(
    `cache:timetable:staff:v2:${tenantId}:${session.userId}`,
    600,
    () => db.select({
      dayOfWeek: staffAssignments.dayOfWeek,
      startTime: staffAssignments.startTime,
      endTime: staffAssignments.endTime,
      subjectName: subjects.name,
      className: classes.name,
      sectionName: sections.name,
    })
      .from(staffAssignments)
      .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .leftJoin(sections, eq(staffAssignments.sectionId, sections.id))
      .leftJoin(classes, eq(sections.classId, classes.id))
      .where(and(eq(staffAssignments.staffId, session.userId), eq(staffAssignments.institutionId, tenantId))),
    decodeDashboardPayload,
  );

  return timetableResponse(timetable);
});
