import { SignJWT } from 'jose';
import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { cache } from 'react';
import { db } from '@/db';
import { refreshTokens } from '@/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { UserRole, JWTPayload, requiresPasswordChange } from './auth-types';
import { verifyAccessToken, getSessionEdge } from './auth-edge';
import { getJwtSecret } from './jwt-secret';
import { SESSION_HEADER, SESSION_SIG_HEADER, verifySessionPayload } from './session-header';
import { getFreshStudent, verifyUserExistsFresh } from './user';
import { enrichFreshStudentSession } from './auth-student';
import { CAMPUS_VIEW_COOKIE, CAMPUS_READ_ONLY_ERROR } from './campus-view';
import { resolveCampusSession } from './campus-workspaces';

export { verifyAccessToken };
export type { UserRole, JWTPayload };

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const WEB_SESSION_EXPIRY_DAYS = 5;
const ACCESS_TOKEN_EXPIRY = `${WEB_SESSION_EXPIRY_DAYS}d`;
const REFRESH_TOKEN_PATTERN = /^[a-f0-9]{80}$/i;

function createRefreshTokenMaterial() {
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return { refreshToken, tokenHash, expiresAt };
}

async function getCookieScope() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get('host') || '').split(':')[0].toLowerCase();
  const domain = host === 'nisaab360.app' || host.endsWith('.nisaab360.app') ? '.nisaab360.app' : undefined;
  const secure = domain !== undefined && (requestHeaders.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  return { domain, secure };
}

export async function createAccessToken(payload: JWTPayload) {
  return await new SignJWT({ ...payload, mustChangePassword: requiresPasswordChange(payload.role, payload.mustChangePassword) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function createTokens(payload: JWTPayload) {
  const accessToken = await createAccessToken(payload);
  const { refreshToken, tokenHash, expiresAt } = createRefreshTokenMaterial();

  await db.insert(refreshTokens).values({
    userRole: payload.role,
    userId: payload.userId,
    tokenHash,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

type RefreshRotationResult =
  | { status: 'ROTATED'; refreshToken: string; userRole: UserRole; userId: number }
  | { status: 'INVALID' | 'EXPIRED' | 'REUSED' };

/**
 * Atomically consumes one refresh token and creates its replacement.
 *
 * The row lock makes a token single-use even when two requests reach different
 * app replicas. If an already-replaced token appears again, every still-active
 * refresh token for that account is revoked: the old token may have been copied.
 */
export async function rotateRefreshToken(presentedToken: string): Promise<RefreshRotationResult> {
  if (!REFRESH_TOKEN_PATTERN.test(presentedToken)) return { status: 'INVALID' };
  const presentedHash = crypto.createHash('sha256').update(presentedToken).digest('hex');

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT ${refreshTokens.id}
      FROM ${refreshTokens}
      WHERE ${refreshTokens.tokenHash} = ${presentedHash}
      FOR UPDATE
    `);
    const [record] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, presentedHash))
      .limit(1);
    if (!record) return { status: 'INVALID' } as const;

    const now = new Date();
    if (record.revokedAt) {
      if (!record.replacedByHash) return { status: 'INVALID' } as const;
      await tx
        .update(refreshTokens)
        .set({ reuseDetectedAt: record.reuseDetectedAt ?? now })
        .where(eq(refreshTokens.id, record.id));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(
          eq(refreshTokens.userRole, record.userRole),
          eq(refreshTokens.userId, record.userId),
          isNull(refreshTokens.revokedAt),
        ));
      return { status: 'REUSED' } as const;
    }

    if (record.expiresAt <= now) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(eq(refreshTokens.id, record.id));
      return { status: 'EXPIRED' } as const;
    }

    const next = createRefreshTokenMaterial();
    await tx.insert(refreshTokens).values({
      userRole: record.userRole,
      userId: record.userId,
      tokenHash: next.tokenHash,
      expiresAt: next.expiresAt,
    });
    await tx
      .update(refreshTokens)
      .set({ revokedAt: now, replacedByHash: next.tokenHash })
      .where(eq(refreshTokens.id, record.id));

    return {
      status: 'ROTATED',
      refreshToken: next.refreshToken,
      userRole: record.userRole,
      userId: record.userId,
    } as const;
  });
}

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies();
  const { domain, secure } = await getCookieScope();
  
  cookieStore.set('access_token', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: WEB_SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    domain,
  });

  cookieStore.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: WEB_SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    domain,
  });

  // Non-HttpOnly cookie for client-side session expiration tracking
  cookieStore.set('session_exp', (Date.now() + WEB_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toString(), {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: WEB_SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    domain,
  });
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  const { domain } = await getCookieScope();
  const cookieNames = ['access_token', 'refresh_token', 'session_exp', CAMPUS_VIEW_COOKIE];
  
  for (const name of cookieNames) {
    // Delete without domain (covers cookies set before subdomain changes)
    cookieStore.delete(name);
    // Delete with domain (covers cookies set with domain: '.nisaab360.app')
    if (domain) {
      cookieStore.set(name, '', { path: '/', domain, maxAge: 0 });
    }
  }
}

/** Request-scoped session. Signed middleware headers prove identity only;
 * current account, tenant and parent approval are read from PostgreSQL.
 * A forged header falls back to verified cookies. Revoked accounts fail closed.
 */
export const getSession = cache(async (): Promise<JWTPayload | null> => {
  let session: JWTPayload | null = null;
  const headersList = await headers();
  const sessionHeader = headersList.get(SESSION_HEADER);

  if (sessionHeader) {
    const signed = await verifySessionPayload(sessionHeader, headersList.get(SESSION_SIG_HEADER));
    if (signed) {
      try {
        session = JSON.parse(sessionHeader) as JWTPayload;
      } catch {
        // fallback
      }
    }
  }

  if (!session) {
    const cookieStore = await cookies();
    session = await getSessionEdge(cookieStore);
  }

  if (!session) return null;

  const student = session.role === 'STUDENT' ? await getFreshStudent(session.userId, session.institutionId) : null;
  if (session.role === 'STUDENT' ? !student : !await verifyUserExistsFresh(session.role, session.userId, session.institutionId)) return null;

  const cookieStore = await cookies();
  const scoped = await resolveCampusSession(session, cookieStore.get(CAMPUS_VIEW_COOKIE)?.value);
  if (scoped?.campusReadOnly && headersList.has('next-action')) throw new Error(CAMPUS_READ_ONLY_ERROR);
  return scoped ? enrichFreshStudentSession(scoped, student) : null;
});

export async function getSessionFromRequest(req: NextRequest): Promise<JWTPayload | null> {
  let session: JWTPayload | null = null;
  const authorization = req.headers.get('authorization');
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  
  if (bearerToken) {
    session = await verifyAccessToken(bearerToken);
  } else {
    session = await getSessionEdge(req.cookies);
  }

  if (session) {
    const student = session.role === 'STUDENT' ? await getFreshStudent(session.userId, session.institutionId) : null;
    const exists = session.role === 'STUDENT' ? Boolean(student) : await verifyUserExistsFresh(session.role, session.userId, session.institutionId);
    if (!exists) return null;
    session = enrichFreshStudentSession(session, student);
    session = await resolveCampusSession(session, req.cookies.get(CAMPUS_VIEW_COOKIE)?.value);
  }

  return session;
}

/** Native transport falls back to asynchronous fresh authorization. */
export function getWarmSessionFromRequest(_req: NextRequest): JWTPayload | null {
  // Synchronous cache hits cannot check revocation; use the ordinary fresh gate.
  void _req;
  return null;
}

/** Heartbeat/unread endpoints retain the same fresh account authorization gate. */
export async function getLightSessionFromRequest(req: NextRequest): Promise<JWTPayload | null> {
  const authorization = req.headers.get('authorization');
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const session = bearerToken ? await verifyAccessToken(bearerToken) : await getSessionEdge(req.cookies);
  if (!session || !await verifyUserExistsFresh(session.role, session.userId, session.institutionId)) return null;
  return resolveCampusSession(session, req.cookies.get(CAMPUS_VIEW_COOKIE)?.value);
}

export async function setCampusViewCookie(token: string) {
  const store = await cookies();
  const scope = await getCookieScope();
  store.set(CAMPUS_VIEW_COOKIE, token, { ...scope, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 5 * 24 * 60 * 60 });
}

export async function revokeAllSessions(role: UserRole, userId: number) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(refreshTokens.userRole, role),
      eq(refreshTokens.userId, userId),
      isNull(refreshTokens.revokedAt),
    ));
}

export async function revokeRefreshToken(refreshToken: string) {
  if (!REFRESH_TOKEN_PATTERN.test(refreshToken)) return;
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
