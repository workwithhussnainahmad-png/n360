import { NextResponse } from 'next/server';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { admissionApplications } from '@/db/schema';
import { getTenantContext, requireRole } from '@/lib/rbac';

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (_req, { session }) => {
  const institutionId = getTenantContext(session);
  const [row] = await db.select({ value: count() }).from(admissionApplications).where(and(
    eq(admissionApplications.institutionId, institutionId),
    eq(admissionApplications.status, 'SUBMITTED'),
  ));
  return NextResponse.json({ count: row?.value ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
}, { light: true });
