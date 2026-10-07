import { db } from "@/db";
import { students, staff, institutions, employees, superAdmins, institutionAdmins, parentAccounts } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { redis } from "./redis";
import type { JWTPayload, UserRole } from "./auth-types";

/**
 * Prefer createdAt embedded in the JWT (set at login/refresh). Falls back to a
 * DB lookup for older tokens that predate the claim.
 */
export async function resolveUserCreatedAt(session: JWTPayload): Promise<Date> {
  if (session.createdAt) {
    const parsed = new Date(session.createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return getUserCreatedAt(session);
}

export async function getUserCreatedAt(session: JWTPayload): Promise<Date> {
  const defaultDate = new Date(0);
  switch (session.role) {
    case "STUDENT": {
      if (!session.institutionId) return defaultDate;
      const [u] = await db.select({ createdAt: students.createdAt }).from(students).where(and(
        eq(students.id, session.userId),
        eq(students.institutionId, session.institutionId),
      )).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "STAFF": {
      if (!session.institutionId) return defaultDate;
      const [u] = await db.select({ createdAt: staff.createdAt }).from(staff).where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, session.institutionId),
      )).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "PARENT": {
      if (!session.institutionId) return defaultDate;
      const [u] = await db.select({ createdAt: parentAccounts.createdAt }).from(parentAccounts).where(and(
        eq(parentAccounts.id, session.userId),
        eq(parentAccounts.institutionId, session.institutionId),
      )).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "INSTITUTION": {
      const [u] = await db.select({ createdAt: institutions.createdAt }).from(institutions).where(eq(institutions.id, session.userId)).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "INSTITUTION_ADMIN": {
      const [u] = await db.select({ createdAt: institutionAdmins.createdAt }).from(institutionAdmins).where(eq(institutionAdmins.id, session.userId)).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "EMPLOYEE": {
      const [u] = await db.select({ createdAt: employees.createdAt }).from(employees).where(eq(employees.id, session.userId)).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "SUPER_ADMIN": {
      const [u] = await db.select({ createdAt: superAdmins.createdAt }).from(superAdmins).where(eq(superAdmins.id, session.userId)).limit(1);
      return u?.createdAt || defaultDate;
    }
    default:
      return defaultDate;
  }
}

const USER_VALIDITY_CACHE_TTL_SECONDS = 600;

export type FreshStudent = {
  id: number; institutionId: number; academicStatus: 'ACTIVE' | 'GRADUATED';
  graduatedAccessAllowed: boolean; classId: number; sectionId: number; name: string;
};

/** One current snapshot; never an authorization cache. */
export async function getFreshStudent(userId: number, expectedInstitutionId?: number): Promise<FreshStudent | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const result = await db.execute<FreshStudent>(sql`SELECT u.id, u.institution_id AS "institutionId",
    u.academic_status AS "academicStatus", i.allow_graduated_student_access AS "graduatedAccessAllowed",
    u.class_id AS "classId", u.section_id AS "sectionId", u.name
    FROM students u JOIN institutions i ON i.id=u.institution_id
    LEFT JOIN institutions root ON root.id=i.parent_institution_id
    WHERE u.id=${userId} AND (${expectedInstitutionId ?? null}::integer IS NULL OR u.institution_id=${expectedInstitutionId ?? null})
    AND u.is_active=true AND u.deleted_at IS NULL
    AND (u.academic_status <> 'GRADUATED' OR i.allow_graduated_student_access=true)
    AND i.status='APPROVED' AND i.deleted_at IS NULL
    AND (i.parent_institution_id IS NULL OR (root.status='APPROVED' AND root.deleted_at IS NULL AND root.parent_institution_id IS NULL)) LIMIT 1`);
  return result.rows[0] ?? null;
}

/** Authoritative authorization gate: never reuse cached account liveness. */
export async function verifyUserExistsFresh(role: UserRole, userId: number, expectedInstitutionId?: number): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;
  if (role === 'STUDENT') return Boolean(await getFreshStudent(userId, expectedInstitutionId));
  if (role === 'SUPER_ADMIN') return (await db.execute(sql`SELECT id FROM super_admins WHERE id=${userId} LIMIT 1`)).rows.length > 0;
  if (role === 'EMPLOYEE') return (await db.execute(sql`SELECT id FROM employees WHERE id=${userId} AND deleted_at IS NULL LIMIT 1`)).rows.length > 0;
  const activeInstitution = sql`i.status='APPROVED' AND i.deleted_at IS NULL AND (i.parent_institution_id IS NULL OR (root.status='APPROVED' AND root.deleted_at IS NULL AND root.parent_institution_id IS NULL))`;
  if (role === 'INSTITUTION') return (await db.execute(sql`SELECT i.id FROM institutions i LEFT JOIN institutions root ON root.id=i.parent_institution_id WHERE i.id=${userId} AND ${activeInstitution} LIMIT 1`)).rows.length > 0;
  const tables = { INSTITUTION_ADMIN: 'institution_admins', STAFF: 'staff', PARENT: 'parent_accounts' } as const;
  if (!(role in tables)) return false;
  const table = tables[role as keyof typeof tables];
  const activeUser = role === 'STAFF' ? sql`u.is_active=true AND u.deleted_at IS NULL`
    : role === 'PARENT' ? sql`u.deleted_at IS NULL AND u.status <> 'DISABLED' AND u.password_hash IS NOT NULL` : sql`true`;
  return (await db.execute(sql`SELECT u.id FROM ${sql.identifier(table)} u JOIN institutions i ON i.id=u.institution_id LEFT JOIN institutions root ON root.id=i.parent_institution_id WHERE u.id=${userId} AND (${expectedInstitutionId ?? null}::integer IS NULL OR u.institution_id=${expectedInstitutionId ?? null}) AND ${activeUser} AND ${activeInstitution} LIMIT 1`)).rows.length > 0;
}

function userValidityCacheKey(role: UserRole, userId: number) {
  return `auth:user-validity:${role}:${userId}`;
}

/**
 * Process-local memo in front of the Valkey validity cache, same shape as
 * `verifiedTokenCache` in `auth-edge.ts`.
 *
 * Cache key: `role:userId`
 * Scope: process-local; one entry per authenticated identity, never shared
 * TTL: 30s — 20x tighter than the 600s Valkey TTL it fronts, so this can only
 *      ever *reduce* the existing staleness window, never widen it
 * Max entries: 4096 (evict oldest insertion)
 * Fallback: on miss, Valkey then Postgres exactly as before
 *
 * Valkey stays the cross-replica source of truth; `invalidateUserValidity`
 * clears the local map too, so a revocation issued by this process takes effect
 * immediately here and within 30s on the sibling replica.
 */
const LOCAL_VALIDITY_TTL_MS = 30_000;
const LOCAL_VALIDITY_MAX = 4096;
const localValidityCache = new Map<string, { valid: boolean; expMs: number }>();
const pendingValidity = new Map<string, { promise: Promise<boolean>; invalidated: boolean }>();

function readLocalValidity(key: string): boolean | undefined {
  const hit = localValidityCache.get(key);
  if (!hit) return undefined;
  if (hit.expMs <= Date.now()) {
    localValidityCache.delete(key);
    return undefined;
  }
  return hit.valid;
}

/** Read only the existing memo; never extend its TTL or authorize on a miss. */
export function peekUserValidity(role: UserRole, userId: number): boolean | undefined {
  return readLocalValidity(userValidityCacheKey(role, userId));
}

function rememberLocalValidity(key: string, valid: boolean) {
  if (localValidityCache.size >= LOCAL_VALIDITY_MAX) {
    const oldest = localValidityCache.keys().next().value;
    if (oldest !== undefined) localValidityCache.delete(oldest);
  }
  localValidityCache.set(key, { valid, expMs: Date.now() + LOCAL_VALIDITY_TTL_MS });
}

async function verifyUserExistsInDatabase(role: UserRole, userId: number): Promise<boolean> {
  switch (role) {
    case 'SUPER_ADMIN': {
      const [u] = await db.select({ id: superAdmins.id }).from(superAdmins).where(eq(superAdmins.id, userId)).limit(1);
      return !!u;
    }
    case 'EMPLOYEE': {
      const [u] = await db.select({ deletedAt: employees.deletedAt }).from(employees).where(eq(employees.id, userId)).limit(1);
      return !!u && u.deletedAt === null;
    }
    case 'INSTITUTION': {
      const [u] = await db.select({ status: institutions.status }).from(institutions).where(eq(institutions.id, userId)).limit(1);
      return u?.status === 'APPROVED';
    }
    case 'INSTITUTION_ADMIN': {
      const [u] = await db.select({ id: institutionAdmins.id }).from(institutionAdmins).where(eq(institutionAdmins.id, userId)).limit(1);
      return !!u;
    }
    case 'STAFF': {
      const [u] = await db.select({ isActive: staff.isActive }).from(staff).where(eq(staff.id, userId)).limit(1);
      return !!u?.isActive;
    }
    case 'STUDENT': {
      const [u] = await db.select({
        isActive: students.isActive,
        academicStatus: students.academicStatus,
        graduatedAccessAllowed: institutions.allowGraduatedStudentAccess,
      })
        .from(students)
        .innerJoin(institutions, eq(students.institutionId, institutions.id))
        .where(and(eq(students.id, userId), eq(students.isActive, true)))
        .limit(1);
      return !!u && (u.academicStatus !== 'GRADUATED' || u.graduatedAccessAllowed);
    }
    case 'PARENT': {
      const [u] = await db.select({
        status: parentAccounts.status,
        passwordHash: parentAccounts.passwordHash,
        deletedAt: parentAccounts.deletedAt,
        institutionStatus: institutions.status,
      })
        .from(parentAccounts)
        .innerJoin(institutions, eq(parentAccounts.institutionId, institutions.id))
        .where(eq(parentAccounts.id, userId))
        .limit(1);
      return !!u && u.deletedAt === null && u.status !== 'DISABLED' && !!u.passwordHash && u.institutionStatus === 'APPROVED';
    }
    default:
      return false;
  }
}

/**
 * Shared, short-lived validity cache for authenticated requests. Valkey errors
 * deliberately fall through to Postgres so an outage cannot grant or deny access.
 */
export async function verifyUserExists(role: UserRole, userId: number): Promise<boolean> {
  const key = userValidityCacheKey(role, userId);

  // Hot path: no syscall, no round trip. Most authenticated requests land here.
  const local = readLocalValidity(key);
  if (local !== undefined) return local;
  const pending = pendingValidity.get(key);
  if (pending) return pending.promise;
  const request = { promise: Promise.resolve(false), invalidated: false };
  request.promise = fetchUserValidity(role, userId, key, request).finally(() => {
    if (pendingValidity.get(key) === request) pendingValidity.delete(key);
  });
  pendingValidity.set(key, request);
  return request.promise;
}

async function fetchUserValidity(role: UserRole, userId: number, key: string, request: { invalidated: boolean }) {

  try {
    if (redis.status === "ready") {
      const cached = await redis.get(key);
      if (cached === "1") {
        if (!request.invalidated) rememberLocalValidity(key, true);
        return true;
      }
      if (cached === "0") {
        if (!request.invalidated) rememberLocalValidity(key, false);
        return false;
      }
    }
  } catch (error) {
    console.warn("User validity cache read failed; checking Postgres", error);
  }

  const valid = await verifyUserExistsInDatabase(role, userId);

  try {
    if (redis.status === "ready" && !request.invalidated) {
      // Exact TTL: do not use cache TTL jitter for an authorization decision.
      await redis.setex(key, USER_VALIDITY_CACHE_TTL_SECONDS, valid ? "1" : "0");
      if (request.invalidated) await redis.del(key);
    }
  } catch (error) {
    console.warn("User validity cache write failed; continuing without cache", error);
  }

  if (!request.invalidated) rememberLocalValidity(key, valid);
  return valid;
}

function invalidateLocalValidity(key: string) {
  localValidityCache.delete(key);
  const pending = pendingValidity.get(key);
  if (pending) { pending.invalidated = true; pendingValidity.delete(key); }
}

export async function invalidateUserValidity(role: UserRole, userId: number) {
  const key = userValidityCacheKey(role, userId);
  invalidateLocalValidity(key);
  try {
    if (redis.status === "ready") {
      await redis.del(key);
    }
  } catch (error) {
    console.warn("User validity cache invalidation failed", error);
  }
}

export async function invalidateUserValidityBatch(users: Array<{ role: UserRole; userId: number }>) {
  const keys = [...new Set(users.map(({ role, userId }) => userValidityCacheKey(role, userId)))];
  if (keys.length === 0) return;

  for (const key of keys) invalidateLocalValidity(key);

  try {
    if (redis.status === "ready") {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn("User validity cache batch invalidation failed", error);
  }
}
