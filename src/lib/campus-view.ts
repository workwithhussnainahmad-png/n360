import { SignJWT, jwtVerify } from 'jose';
import { getJwtSecret } from './jwt-secret';
import type { JWTPayload } from './auth-types';

export const CAMPUS_VIEW_COOKIE = 'campus_view';
export const CAMPUS_READ_ONLY_ERROR = 'This campus is read-only. Switch back to your own campus to make changes.';

export function isCampusAccount(session: JWTPayload) {
  return session.role === 'INSTITUTION' || session.role === 'INSTITUTION_ADMIN';
}

export async function createCampusViewToken(session: JWTPayload, institutionId: number) {
  return new SignJWT({ userId: session.userId, role: session.role, homeInstitutionId: session.homeInstitutionId, institutionId })
    .setProtectedHeader({ alg: 'HS256' }).setAudience('campus-view').setIssuedAt().setExpirationTime('5d').sign(getJwtSecret());
}

export async function readCampusViewToken(token: string | undefined, session: JWTPayload): Promise<number | null> {
  if (!token || !isCampusAccount(session)) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ['HS256'], audience: 'campus-view' });
    if (payload.userId !== session.userId || payload.role !== session.role || payload.homeInstitutionId !== session.homeInstitutionId) return null;
    return typeof payload.institutionId === 'number' && Number.isSafeInteger(payload.institutionId) && payload.institutionId > 0 ? payload.institutionId : null;
  } catch { return null; }
}

export function campusMutationBlocked(session: JWTPayload, method: string, allowCampusSwitch = false) {
  return isCampusAccount(session) && session.campusReadOnly === true && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !allowCampusSwitch;
}

export function assertCampusWritable(session: JWTPayload | null) {
  if (!session || !isCampusAccount(session)) return;
  if (session.campusReadOnly) throw new Error(CAMPUS_READ_ONLY_ERROR);
  if (session.mustChangePassword) throw new Error('PASSWORD_CHANGE_REQUIRED');
}
