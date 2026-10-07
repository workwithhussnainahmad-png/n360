import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { employees, institutions, superAdmins } from '@/db/schema';
import type { JWTPayload } from './auth-types';

export type SecurityPermission = 'platform.security' | 'platform.accounts' | 'platform.restore' | 'platform.export' | 'institution.security';

export function hasSecurityPermission(session: JWTPayload, permission: SecurityPermission): boolean {
  if (session.mustChangePassword || session.campusReadOnly) return false;
  if (permission === 'platform.security') return session.role === 'SUPER_ADMIN' && session.isSuperAdmin === true;
  if (permission.startsWith('platform.')) return session.role === 'SUPER_ADMIN';
  return session.role === 'INSTITUTION' && session.institutionId === session.userId && session.homeInstitutionId === session.userId;
}

/** Sensitive operations bypass cached account validity and token root flags. */
export async function authorizeSecurityPermission(session: JWTPayload, permission: SecurityPermission): Promise<boolean> {
  if (!hasSecurityPermission(session, permission)) return false;
  if (session.role === 'SUPER_ADMIN') {
    const [account] = await db.select({ root: superAdmins.isSuperAdmin }).from(superAdmins).where(eq(superAdmins.id, session.userId)).limit(1);
    return Boolean(account && (permission !== 'platform.security' || account.root));
  }
  const [account] = await db.select({ id: institutions.id }).from(institutions).where(and(eq(institutions.id, session.userId), eq(institutions.status, 'APPROVED'), eq(institutions.mustChangePassword, false), isNull(institutions.deletedAt))).limit(1);
  return Boolean(account);
}

export async function assertSecurityPermission(session: JWTPayload | null, permission: SecurityPermission) {
  if (!session || !await authorizeSecurityPermission(session, permission)) throw new Error('Forbidden: this action is outside your role permissions.');
}

export async function assertPlatformOperator(session: JWTPayload | null) {
  if (!session || session.mustChangePassword || session.campusReadOnly) throw new Error('Forbidden');
  if (session.role === 'SUPER_ADMIN') {
    if (!await authorizeSecurityPermission(session, 'platform.accounts')) throw new Error('Forbidden');
  } else if (session.role === 'EMPLOYEE') {
    const [account] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, session.userId), isNull(employees.deletedAt), eq(employees.mustChangePassword, false))).limit(1);
    if (!account) throw new Error('Forbidden');
  } else throw new Error('Forbidden');
}
