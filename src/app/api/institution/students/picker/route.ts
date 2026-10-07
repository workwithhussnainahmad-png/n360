import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { classes, sections, students } from '@/db/schema';
import { and, eq, or, ilike } from 'drizzle-orm';
import { requireRole, getTenantContext } from '@/lib/rbac';

import { getCachedOrFetch } from '@/lib/redis';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// Lightweight, search-driven student picker (used by ID cards, etc.) so we never
// have to SSR/load every active student just to let the admin pick a handful.
export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const url = new URL(req.url);
  const query = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const campusIdParam = url.searchParams.get('campusId');
  const campusId = campusIdParam ? Number(campusIdParam) : null;

  const conditions = [eq(students.isActive, true)];
  if (Number.isInteger(campusId)) {
    conditions.push(eq(students.campusId, campusId as number));
  }
  if (query) {
    conditions.push(or(
      ilike(students.name, `%${query}%`),
      ilike(students.classRollNumber, `%${query}%`),
      ilike(students.loginRollNumber, `%${query}%`),
    )!);
  }

  const fetchRows = () => db.select({
    id: students.id,
    name: students.name,
    classRollNumber: students.classRollNumber,
    loginRollNumber: students.loginRollNumber,
    className: classes.name,
    sectionName: sections.name,
  })
    .from(students)
    .innerJoin(classes, eq(students.classId, classes.id))
    .innerJoin(sections, eq(students.sectionId, sections.id))
    .where(and(eq(students.institutionId, institutionId), ...conditions))
    .orderBy(students.name)
    .limit(limit);

  const rows = query ? await fetchRows() : await getCachedOrFetch(
    `cache:student-picker:${institutionId}:${Number.isInteger(campusId) ? campusId : 'all'}:${limit}`, 30, fetchRows,
  );
  return NextResponse.json({ students: rows }, { headers: { 'Cache-Control': 'no-store' } });
});
