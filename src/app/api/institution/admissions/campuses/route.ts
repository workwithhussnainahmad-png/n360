import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { admissionCycleCampuses, admissionCycles } from '@/db/schema';
import { admissionOfferingOwners, listAdmissionCampuses } from '@/lib/admission-campus';
import { admissionCalendarDateSql } from '@/lib/admission-calendar';
import { getTenantContext, requireRole } from '@/lib/rbac';
import { campusAdmissionAvailabilitySchema } from '@/lib/validators/admissions';
import { getClientIp } from '@/lib/client-ip';
import { logAudit } from '@/lib/audit';

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (_req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const owners = await admissionOfferingOwners(institutionId);
  const campus = (await listAdmissionCampuses(institutionId)).find(item => item.institutionId === institutionId);
  if (!campus) return NextResponse.json({ campus: null, cycles: [] });
  const today = admissionCalendarDateSql();
  const cycles = await db.select({ id: admissionCycles.id, name: admissionCycles.name, academicYear: admissionCycles.academicYear,
    status: admissionCycles.status, opensOn: admissionCycles.opensOn, closesOn: admissionCycles.closesOn,
    isOpen: sql<boolean>`coalesce(${admissionCycleCampuses.isOpen}, false)`,
    cycleAccepting: sql<boolean>`${admissionCycles.status} = 'OPEN' AND (${admissionCycles.opensOn} IS NULL OR ${admissionCycles.opensOn} <= ${today}) AND (${admissionCycles.closesOn} IS NULL OR ${admissionCycles.closesOn} >= ${today})`,
  }).from(admissionCycles).leftJoin(admissionCycleCampuses, and(eq(admissionCycleCampuses.cycleId, admissionCycles.id), eq(admissionCycleCampuses.campusId, campus.id), eq(admissionCycleCampuses.institutionId, institutionId)))
    .where(inArray(admissionCycles.institutionId, owners)).orderBy(desc(admissionCycles.createdAt));
  return NextResponse.json({ campus: { id: campus.id, name: campus.name }, cycles }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = campusAdmissionAvailabilitySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Select a valid cycle and campus availability' }, { status: 400 });
  const owners = await admissionOfferingOwners(institutionId);
  const changed = await db.transaction(async tx => {
    // Public submissions hold SHARE on the same cycle until their insert commits.
    const [cycle] = await tx.select({ id: admissionCycles.id }).from(admissionCycles)
      .where(and(eq(admissionCycles.id, parsed.data.cycleId), inArray(admissionCycles.institutionId, owners))).for('update').limit(1);
    if (!cycle) return false;
    const campus = (await listAdmissionCampuses(institutionId, tx)).find(item => item.institutionId === institutionId);
    if (!campus) return false;
    await tx.insert(admissionCycleCampuses).values({ cycleId: cycle.id, campusId: campus.id, institutionId, isOpen: parsed.data.isOpen })
      .onConflictDoUpdate({ target: [admissionCycleCampuses.cycleId, admissionCycleCampuses.campusId], set: { isOpen: parsed.data.isOpen, updatedAt: new Date() } });
    return true;
  });
  if (!changed) return NextResponse.json({ error: 'Admission cycle not available to this campus' }, { status: 404 });
  await logAudit({ institutionId, actorId: session.userId, actorRole: session.role, action: parsed.data.isOpen ? 'OPEN_CAMPUS_ADMISSIONS' : 'CLOSE_CAMPUS_ADMISSIONS', target: `Admission cycle ${parsed.data.cycleId}`, ip: getClientIp(req) });
  return NextResponse.json({ success: true, isOpen: parsed.data.isOpen });
});
