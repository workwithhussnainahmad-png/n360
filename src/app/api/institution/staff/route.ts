import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { staff, staffTeachableSubjects, institutions, campuses, subjects, institutionCustomRoles } from '@/db/schema';
import { and, eq, inArray, ilike, or } from 'drizzle-orm';
import { hashPassword as hash } from '@/lib/argon2-pool';
import { requireRole, getTenantContext } from '@/lib/rbac';
import { createStaffSchema } from '@/lib/validators/staff';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';
import { generateStaffEmail } from '@/lib/login-identifiers';

// Lightweight staff options list (id + name only) for dropdowns like the class-teacher
// select on the Add Section form. Fetched lazily on the client, never joined with requests.
import { getCachedOrFetch, invalidateStaffReadCaches } from '@/lib/redis';

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const tenantId = getTenantContext(session);
  const url = new URL(req.url);
  const query = (url.searchParams.get('q') || '').trim();
  const campusIdParam = url.searchParams.get('campusId');
  const campusId = campusIdParam ? Number(campusIdParam) : null;

  const conditions = [eq(staff.isActive, true)];
  if (Number.isInteger(campusId)) {
    conditions.push(eq(staff.campusId, campusId as number));
  }
  if (query) {
    conditions.push(or(
      ilike(staff.name, `%${query}%`),
      ilike(staff.email, `%${query}%`)
    )!);
  }

  const fetchRows = () => db.select({
    id: staff.id,
    name: staff.name,
    email: staff.email,
    campus: campuses.name,
    role: institutionCustomRoles.name,
  })
    .from(staff)
    .leftJoin(campuses, eq(staff.campusId, campuses.id))
    .leftJoin(institutionCustomRoles, eq(staff.customRoleId, institutionCustomRoles.id))
    .where(and(eq(staff.institutionId, tenantId), ...conditions))
    .orderBy(staff.name);

  // Cache common dropdown reads only; arbitrary searches do not fill the keyspace.
  const rows = query ? await fetchRows() : await getCachedOrFetch(
    `cache:staff-options:${tenantId}:${Number.isInteger(campusId) ? campusId : 'all'}`, 30, fetchRows,
  );
  return NextResponse.json({ staff: rows }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const tenantId = getTenantContext(session);
  const body = await req.json();
  const parsed = createStaffSchema.safeParse(body);
  
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { name, phone, subjectIds, campusId: requestedCampusId, customRoleId } = parsed.data;
  const campusId = session.campusId ?? requestedCampusId;
  if (requestedCampusId && requestedCampusId !== campusId) return NextResponse.json({ error: 'Select your own campus.' }, { status: 400 });
  const uniqueSubjectIds = Array.from(new Set(subjectIds));

  const [[inst], campusRows, subjectRows, customRoleRows] = await Promise.all([
    db.select().from(institutions).where(eq(institutions.id, tenantId)).limit(1),
    campusId ? db.select({ id: campuses.id })
      .from(campuses)
      .where(and(eq(campuses.id, campusId), eq(campuses.institutionId, tenantId)))
      .limit(1) : Promise.resolve([]),
    uniqueSubjectIds.length > 0 ? db.select({ id: subjects.id })
      .from(subjects)
      .where(and(
        eq(subjects.institutionId, tenantId),
        inArray(subjects.id, uniqueSubjectIds)
      )) : Promise.resolve([]),
    customRoleId ? db.select({ id: institutionCustomRoles.id })
      .from(institutionCustomRoles)
      .where(and(eq(institutionCustomRoles.id, customRoleId), eq(institutionCustomRoles.institutionId, tenantId)))
      .limit(1) : Promise.resolve([]),
  ]);

  if (!inst) {
    return NextResponse.json({ error: "Institution not found" }, { status: 404 });
  }
  if (campusId && !campusRows[0]) {
    return NextResponse.json({ error: "Campus not found" }, { status: 400 });
  }
  if (subjectRows.length !== uniqueSubjectIds.length) {
    return NextResponse.json({ error: "One or more subjects were not found" }, { status: 400 });
  }
  if (customRoleId && !customRoleRows[0]) {
    return NextResponse.json({ error: "Custom role not found" }, { status: 400 });
  }

  const baseEmail = generateStaffEmail({ name, phone, institution: inst });
  const [localPart, domain] = baseEmail.split('@');
  let generatedEmail = baseEmail;
  
  // collision check
  let count = 0;
  while (true) {
    // tenant-audit: allow-cross-tenant staff — email has a global unique constraint
    const [existing] = await db.select().from(staff).where(eq(staff.email, generatedEmail)).limit(1);
    if (!existing) break;
    count++;
    generatedEmail = `${localPart}${count}@${domain}`;
  }

  const initialPassword = '1234567890';
  const passwordHash = await hash(initialPassword);

  try {
    const [newStaff] = await db.insert(staff).values({
      institutionId: tenantId,
      campusId: campusId || null,
      customRoleId: customRoleId || null,
      name,
      email: generatedEmail,
      phone,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
    }).returning();

    if (uniqueSubjectIds.length > 0) {
      await db.insert(staffTeachableSubjects).values(
        uniqueSubjectIds.map(id => ({
          institutionId: tenantId,
          staffId: newStaff.id,
          subjectId: id,
        }))
      );
    }

    await logAudit({
      institutionId: tenantId,
      actorId: session.userId,
      actorRole: session.role,
      action: 'CREATE_STAFF',
      target: `Staff ${newStaff.id}`,
      ip: getClientIp(req),
    });

    await invalidateStaffReadCaches(tenantId);

    // We realistically can't email the staff because it's a generated internal email unless we use 'phone' or SMS. 
    // Usually, the institution admin hands the credentials. But if there's a real email, we send it.
    // We will just return the credentials.
    return NextResponse.json({ 
      message: 'Staff created successfully', 
      credentials: { email: generatedEmail, initialPassword } 
    }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
});
