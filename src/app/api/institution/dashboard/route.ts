import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { campuses, staff, students, classes } from '@/db/schema';
import { sql } from 'drizzle-orm';
import { requireRole, getTenantContext } from '@/lib/rbac';
import { getCachedOrFetch } from '@/lib/redis';

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const tenantId = getTenantContext(session);
  const campusIdParam = req.nextUrl.searchParams.get('campusId');

  // Validated *before* it reaches the cache key. Previously any string was
  // interpolated into the Valkey key and then passed through `Number()`, so
  // `?campusId=abc` produced NaN in the query (a 500) and every distinct value —
  // valid or not — minted a new cache entry whose miss cost four count queries.
  let campusId: number | null = null;
  if (campusIdParam !== null && campusIdParam !== '') {
    campusId = Number(campusIdParam);
    if (!Number.isInteger(campusId) || campusId <= 0) {
      return NextResponse.json({ error: 'campusId must be a positive integer' }, { status: 400 });
    }
  }

  const stats = await getCachedOrFetch(`cache:dashboard:${tenantId}:${campusId ?? 'all'}`, 30, async () => {
    // One round trip instead of four. The four counts were already issued
    // concurrently, so this is not primarily a latency fix: it takes one
    // PgBouncer connection and one parse/plan cycle instead of four, which is
    // what actually runs out first under load on a 25-slot transaction pool.
    //
    // Tenant scoping is manual here because raw SQL is invisible to
    // scripts/audit-tenant-scope.mjs: every one of the four subqueries below
    // filters on institution_id = tenantId, and any edit must keep doing so.
    // `campuses` and `classes` intentionally ignore the campus filter — classes
    // have no campus column, and the campus count is institution-wide. Same
    // semantics as the previous four queries.
    const staffCount = campusId === null
      ? sql`(SELECT count(*) FROM ${staff} WHERE ${staff.institutionId} = ${tenantId})`
      : sql`(SELECT count(*) FROM ${staff} WHERE ${staff.institutionId} = ${tenantId} AND ${staff.campusId} = ${campusId})`;
    const studentCount = campusId === null
      ? sql`(SELECT count(*) FROM ${students} WHERE ${students.institutionId} = ${tenantId})`
      : sql`(SELECT count(*) FROM ${students} WHERE ${students.institutionId} = ${tenantId} AND ${students.campusId} = ${campusId})`;

    const result = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM ${campuses} WHERE ${campuses.institutionId} = ${tenantId}) AS campus_count,
        ${staffCount} AS staff_count,
        ${studentCount} AS student_count,
        (SELECT count(*) FROM ${classes} WHERE ${classes.institutionId} = ${tenantId}) AS class_count
    `);

    const row = result.rows[0] as {
      campus_count: string | number;
      staff_count: string | number;
      student_count: string | number;
      class_count: string | number;
    };

    return {
      campuses: Number(row.campus_count),
      staff: Number(row.staff_count),
      students: Number(row.student_count),
      classes: Number(row.class_count),
    };
  });

  return NextResponse.json(stats);
});
