import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest, NextResponse } from 'next/server';
import { getJwtSecret } from '@/lib/jwt-secret';

export const ADMISSION_SESSION_COOKIE = 'admission_session';
const ADMISSION_SESSION_SECONDS = 7 * 24 * 60 * 60;

export type AdmissionSession = {
  applicantId: number;
  institutionId: number;
  sessionVersion: number;
  kind: 'ADMISSION_APPLICANT';
};

export async function createAdmissionSessionToken(applicantId: number, institutionId: number, sessionVersion: number) {
  return new SignJWT({ applicantId, institutionId, sessionVersion, kind: 'ADMISSION_APPLICANT' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setAudience('admission-applicant')
    .setExpirationTime(`${ADMISSION_SESSION_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifyAdmissionSessionToken(token: string | undefined): Promise<AdmissionSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      audience: 'admission-applicant',
    });
    if (
      payload.kind !== 'ADMISSION_APPLICANT'
      || typeof payload.applicantId !== 'number'
      || typeof payload.institutionId !== 'number'
      || typeof payload.sessionVersion !== 'number'
    ) return null;
    return {
      applicantId: payload.applicantId,
      institutionId: payload.institutionId,
      sessionVersion: payload.sessionVersion,
      kind: 'ADMISSION_APPLICANT',
    };
  } catch {
    return null;
  }
}

export function getAdmissionSessionFromRequest(req: NextRequest) {
  return verifyAdmissionSessionToken(req.cookies.get(ADMISSION_SESSION_COOKIE)?.value);
}

export function setAdmissionSessionCookie(response: NextResponse, token: string, host: string) {
  const productionHost = host.toLowerCase().split(':')[0].endsWith('.nisaab360.app');
  response.cookies.set(ADMISSION_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: productionHost,
    sameSite: 'lax',
    path: '/',
    maxAge: ADMISSION_SESSION_SECONDS,
  });
}

export function clearAdmissionSessionCookie(response: NextResponse, host: string) {
  const productionHost = host.toLowerCase().split(':')[0].endsWith('.nisaab360.app');
  response.cookies.set(ADMISSION_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: productionHost,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
