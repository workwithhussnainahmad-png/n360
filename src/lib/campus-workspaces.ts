import { ActionInputError } from './action-input-error';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { hashPassword } from './argon2-pool';
import { campusLoginSlug, campusUsernameCandidate } from './login-identifiers';
import { getPricingPlan } from './pricing';
import { db } from '@/db';
import { campuses, institutions, institutionAdmins, institutionOwners, staff, students } from '@/db/schema';
import type { JWTPayload } from './auth-types';
import { isCampusAccount, readCampusViewToken } from './campus-view';

export const CAMPUS_DEFAULT_PASSWORD = '1234567890';
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const createCampusSchema = z.object({
  name: z.string().trim().min(2).max(255).refine(name => { try { campusLoginSlug(name); return true; } catch { return false; } }, 'Use a campus name that produces 1–63 letters, numbers or hyphens for student logins.'),
  address: z.string().trim().min(2).max(2000),
  loginEmail: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  registrationNumber: z.string().trim().max(100).optional().default(''),
  existingCampusId: z.number().int().positive().optional(),
}).strict();

export async function assertCampusEmailAvailable(tx: Transaction, email: string) {
  // Serialize all campus/registration email claims; expression checks alone race.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`campus-email:${email}`}))`);
  const result = await tx.execute(sql`SELECT 1 FROM institutions WHERE lower(contact_email) = ${email}
    UNION ALL SELECT 1 FROM institution_admins WHERE lower(email) = ${email}
    UNION ALL SELECT 1 FROM staff WHERE lower(email) = ${email}
    UNION ALL SELECT 1 FROM employees WHERE lower(email) = ${email}
    UNION ALL SELECT 1 FROM super_admins WHERE lower(email) = ${email}
    UNION ALL SELECT 1 FROM parent_accounts WHERE lower(email) = ${email} LIMIT 1`);
  if (result.rows.length) throw new ActionInputError('This login email is already in use.');
}

/** Fresh database ownership, never a client-supplied tenant or cached membership. */
export async function resolveCampusSession(session: JWTPayload, viewToken?: string): Promise<JWTPayload | null> {
  if (!isCampusAccount(session)) return session;
  let homeId = session.userId;
  if (session.role === 'INSTITUTION_ADMIN') {
    const [admin] = await db.select({ institutionId: institutionAdmins.institutionId }).from(institutionAdmins).where(eq(institutionAdmins.id, session.userId)).limit(1);
    if (!admin) return null;
    homeId = admin.institutionId;
  }
  const [home] = await db.select({ id: institutions.id, parentId: institutions.parentInstitutionId, campusName: institutions.campusName, status: institutions.status, deletedAt: institutions.deletedAt, mustChangePassword: institutions.mustChangePassword })
    .from(institutions).where(eq(institutions.id, homeId)).limit(1);
  if (!home || home.status !== 'APPROVED' || home.deletedAt) return null;
  const rootId = home.parentId ?? home.id;
  if (home.parentId) {
    const [root] = await db.select({ id: institutions.id }).from(institutions).where(and(eq(institutions.id, rootId), eq(institutions.status, 'APPROVED'), isNull(institutions.deletedAt), isNull(institutions.parentInstitutionId))).limit(1);
    if (!root) return null;
  }
  const base = { ...session, institutionId: homeId, homeInstitutionId: homeId, rootInstitutionId: rootId, campusName: home.campusName, homeCampusName: home.campusName, campusReadOnly: false,
    mustChangePassword: session.role === 'INSTITUTION' ? home.mustChangePassword : session.mustChangePassword };
  const targetId = await readCampusViewToken(viewToken, base);
  let effective = home;
  if (targetId && targetId !== homeId && session.role === 'INSTITUTION' && !base.mustChangePassword) {
    const [target] = await db.select({ id: institutions.id, parentId: institutions.parentInstitutionId, campusName: institutions.campusName, status: institutions.status, deletedAt: institutions.deletedAt, mustChangePassword: institutions.mustChangePassword })
      .from(institutions).where(and(eq(institutions.id, targetId), eq(institutions.status, 'APPROVED'), isNull(institutions.deletedAt), or(eq(institutions.id, rootId), eq(institutions.parentInstitutionId, rootId)))).limit(1);
    if (target) effective = target;
  }
  const [campus] = await db.select({ id: campuses.id }).from(campuses).where(and(eq(campuses.institutionId, effective.id), eq(campuses.name, effective.campusName), isNull(campuses.deletedAt))).limit(1);
  return { ...base, institutionId: effective.id, campusId: campus?.id ?? null, campusName: effective.campusName, campusReadOnly: effective.id !== homeId };
}

export async function listInstitutionCampuses(session: JWTPayload) {
  const rootId = session.rootInstitutionId ?? session.institutionId!;
  return listRootCampuses(rootId);
}

export async function listRootCampuses(rootId: number) {
  return db.select({ id: campuses.id, name: campuses.name, address: campuses.address, workspaceId: institutions.id,
    parentId: institutions.parentInstitutionId, loginEmail: institutions.contactEmail, workspaceName: institutions.campusName })
    .from(campuses).innerJoin(institutions, eq(campuses.institutionId, institutions.id))
    .where(and(or(eq(institutions.id, rootId), eq(institutions.parentInstitutionId, rootId)), isNull(campuses.deletedAt), isNull(institutions.deletedAt)))
    .orderBy(campuses.id);
}

export function canManageCampuses(session: JWTPayload) {
  return session.role === 'INSTITUTION' && !session.campusReadOnly && !session.mustChangePassword && session.homeInstitutionId === session.rootInstitutionId;
}

export class CampusPolicyError extends ActionInputError {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function createCampusWorkspace(session: JWTPayload, input: unknown, platformRootId?: number) {
  const platform = session.role === 'SUPER_ADMIN' || session.role === 'EMPLOYEE';
  if (platformRootId !== undefined && (!platform || !Number.isSafeInteger(platformRootId) || platformRootId <= 0)) {
    throw new CampusPolicyError('Only platform admins and employees can manage Enterprise campuses.', 403);
  }
  if (platformRootId === undefined && !canManageCampuses(session)) throw new CampusPolicyError('Only the main campus account can create campus logins.', 403);
  const rootId = platformRootId ?? session.rootInstitutionId!;
  const data = createCampusSchema.parse(input);
  const passwordHash = await hashPassword(CAMPUS_DEFAULT_PASSWORD);
  return db.transaction(async (tx) => {
    // Same parent lock serializes names and existing-campus setup.
    await tx.execute(sql`SELECT id FROM institutions WHERE id = ${rootId} FOR UPDATE`);
    const [root] = await tx.select().from(institutions).where(and(eq(institutions.id, rootId), isNull(institutions.parentInstitutionId), eq(institutions.status, 'APPROVED'), isNull(institutions.deletedAt))).limit(1);
    if (!root) throw new CampusPolicyError('Approved main institution not found.', 404);
    const plan = getPricingPlan(root.pricingPlan) ?? getPricingPlan('BASIC')!;
    if (plan.id === 'ENTERPRISE' && platformRootId === undefined) throw new CampusPolicyError('Only platform admins and employees can create Enterprise campuses.', 403);
    if (platformRootId !== undefined && plan.id !== 'ENTERPRISE') throw new CampusPolicyError('Platform campus creation is available for Enterprise institutions only.', 409);
    // Count Main and every active campus, including campuses awaiting login setup.
    // The parent row lock keeps checking the limit and inserting a campus atomic.
    const [{ total }] = (await tx.execute(sql`SELECT count(*)::int AS total FROM campuses c JOIN institutions i ON i.id = c.institution_id
      WHERE (i.id = ${root.id} OR i.parent_institution_id = ${root.id}) AND c.deleted_at IS NULL AND i.deleted_at IS NULL`)).rows as Array<{ total: number }>;
    if (plan.campusLimit !== null && total + (data.existingCampusId ? 0 : 1) > plan.campusLimit) {
      throw new CampusPolicyError(`${plan.name} allows ${plan.campusLimit} campus${plan.campusLimit === 1 ? '' : 'es'} in total, including Main. Your campus limit has been reached.`, 409);
    }
    await assertCampusEmailAvailable(tx, data.loginEmail);
    let existing: typeof campuses.$inferSelect | undefined;
    if (data.existingCampusId) {
      [existing] = await tx.select().from(campuses).where(and(eq(campuses.id, data.existingCampusId), eq(campuses.institutionId, root.id), isNull(campuses.deletedAt))).limit(1);
      if (!existing || existing.name === root.campusName) throw new ActionInputError('This campus cannot be set up.');
      // Existing populated campuses need a reviewed data migration, never silently
      // leave students or staff in the main workspace while moving their campus.
      const [studentRows, staffRows] = await Promise.all([
        tx.select({ id: students.id }).from(students).where(eq(students.campusId, existing.id)).limit(1),
        tx.select({ id: staff.id }).from(staff).where(eq(staff.campusId, existing.id)).limit(1),
      ]);
      if (studentRows.length || staffRows.length) throw new ActionInputError('This campus has existing records. Its data must be migrated before creating its login.');
    }
    const name = existing?.name ?? data.name;
    const loginName = campusLoginSlug(name);
    const siblings = await tx.execute(sql`SELECT c.id, c.name FROM campuses c JOIN institutions i ON i.id = c.institution_id
      WHERE (i.id = ${root.id} OR i.parent_institution_id = ${root.id}) AND c.deleted_at IS NULL
      AND c.id <> ${existing?.id ?? 0}`);
    if ((siblings.rows as Array<{ name: string }>).some(campus => {
      if (campus.name.toLowerCase() === name.toLowerCase()) return true;
      try { return campusLoginSlug(campus.name) === loginName; } catch { return false; }
    })) throw new ActionInputError('A campus with this name or student login name already exists.');
    // Serialize username claims across roots as well as siblings.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('campus-workspace-usernames'))`);
    let attempt = 0;
    let username = campusUsernameCandidate(name, root.id);
    while ((await tx.select({ id: institutions.id }).from(institutions).where(eq(institutions.username, username)).limit(1)).length) {
      username = campusUsernameCandidate(name, root.id, ++attempt);
    }
    const [{ id: nextId }] = (await tx.execute(sql`SELECT nextval(pg_get_serial_sequence('institutions','id'))::int AS id`)).rows as Array<{ id: number }>;
    const [workspace] = await tx.insert(institutions).values({
      id: nextId, parentInstitutionId: root.id, campusName: name, name: root.name, type: root.type,
      username, country: root.country, city: root.city, address: data.address,
      contactEmail: data.loginEmail, contactPhone: root.contactPhone, registrationNumber: data.registrationNumber,
      pricingPlan: root.pricingPlan, logoKey: root.logoKey, proofDocumentKey: root.proofDocumentKey,
      adminPasswordHash: passwordHash, mustChangePassword: true, status: 'APPROVED',
    }).returning({ id: institutions.id });
    const [owner] = await tx.select().from(institutionOwners).where(eq(institutionOwners.institutionId, root.id)).limit(1);
    if (owner) await tx.insert(institutionOwners).values({ institutionId: workspace.id, name: owner.name, gender: owner.gender, email: owner.email, contactNumber: owner.contactNumber });
    const [campus] = existing
      ? await tx.update(campuses).set({ institutionId: workspace.id, address: data.address }).where(eq(campuses.id, existing.id)).returning({ id: campuses.id, name: campuses.name })
      : await tx.insert(campuses).values({ institutionId: workspace.id, name, address: data.address }).returning({ id: campuses.id, name: campuses.name });
    return { campus, loginEmail: data.loginEmail, defaultPassword: CAMPUS_DEFAULT_PASSWORD };
  });
}
