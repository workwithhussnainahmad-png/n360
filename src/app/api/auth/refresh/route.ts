import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { employees, institutionAdmins, institutions, parentAccounts, staff, students, superAdmins } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { clearAuthCookies, createAccessToken, revokeAllSessions, revokeRefreshToken, rotateRefreshToken, setAuthCookies } from '@/lib/auth';
import type { JWTPayload, UserRole } from '@/lib/auth';
import { cookies } from 'next/headers';
import { withRateLimit } from '@/lib/rate-limit';
import { AUTH_MAX_BODY_BYTES, bodyTooLargeResponse, readJsonBody } from '@/lib/http';
import { resolveCampusSession } from '@/lib/campus-workspaces';

async function getCurrentPayload(role: UserRole, userId: number): Promise<JWTPayload | null> {
  switch (role) {
    case 'SUPER_ADMIN': {
      const [user] = await db.select({
        isSuperAdmin: superAdmins.isSuperAdmin,
        createdAt: superAdmins.createdAt,
      }).from(superAdmins).where(eq(superAdmins.id, userId)).limit(1);
      return user ? {
        userId,
        role,
        isSuperAdmin: user.isSuperAdmin,
        createdAt: user.createdAt.toISOString(),
      } : null;
    }
    case 'EMPLOYEE': {
      const [user] = await db.select({
        mustChangePassword: employees.mustChangePassword,
        createdAt: employees.createdAt,
      }).from(employees).where(eq(employees.id, userId)).limit(1);
      return user ? {
        userId,
        role,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt.toISOString(),
      } : null;
    }
    case 'INSTITUTION': {
      const [user] = await db.select({
        status: institutions.status,
        mustChangePassword: institutions.mustChangePassword,
        createdAt: institutions.createdAt,
      }).from(institutions).where(eq(institutions.id, userId)).limit(1);
      return user?.status === 'APPROVED' ? {
        userId,
        role,
        institutionId: userId,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt.toISOString(),
      } : null;
    }
    case 'STAFF': {
      const [user] = await db.select({
        institutionId: staff.institutionId,
        campusId: staff.campusId,
        mustChangePassword: staff.mustChangePassword,
        isActive: staff.isActive,
        createdAt: staff.createdAt,
      }).from(staff).where(eq(staff.id, userId)).limit(1);
      return user?.isActive ? {
        userId,
        role,
        institutionId: user.institutionId,
        campusId: user.campusId,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt.toISOString(),
      } : null;
    }
    case 'STUDENT': {
      const [user] = await db.select({
        institutionId: students.institutionId,
        mustChangePassword: students.mustChangePassword,
        isActive: students.isActive,
        academicStatus: students.academicStatus,
        graduatedAccessAllowed: institutions.allowGraduatedStudentAccess,
        createdAt: students.createdAt,
      })
        .from(students)
        .innerJoin(institutions, eq(students.institutionId, institutions.id))
        .where(eq(students.id, userId))
        .limit(1);
      return user?.isActive && (user.academicStatus !== 'GRADUATED' || user.graduatedAccessAllowed) ? {
        userId,
        role,
        institutionId: user.institutionId,
        mustChangePassword: user.mustChangePassword,
        studentAcademicStatus: user.academicStatus,
        graduatedStudentAccessAllowed: user.graduatedAccessAllowed,
        createdAt: user.createdAt.toISOString(),
      } : null;
    }
    case 'INSTITUTION_ADMIN': {
      const [user] = await db.select({
        institutionId: institutionAdmins.institutionId,
        createdAt: institutionAdmins.createdAt,
      }).from(institutionAdmins).where(eq(institutionAdmins.id, userId)).limit(1);
      return user ? {
        userId,
        role,
        institutionId: user.institutionId,
        createdAt: user.createdAt.toISOString(),
      } : null;
    }
    case 'PARENT': {
      const [user] = await db.select({
        institutionId: parentAccounts.institutionId,
        mustChangePassword: parentAccounts.mustChangePassword,
        status: parentAccounts.status,
        passwordHash: parentAccounts.passwordHash,
        deletedAt: parentAccounts.deletedAt,
        institutionStatus: institutions.status,
        createdAt: parentAccounts.createdAt,
      })
        .from(parentAccounts)
        .innerJoin(institutions, eq(parentAccounts.institutionId, institutions.id))
        .where(eq(parentAccounts.id, userId))
        .limit(1);
      return user && user.deletedAt === null && user.status !== 'DISABLED' && user.passwordHash && user.institutionStatus === 'APPROVED' ? {
        userId,
        role,
        institutionId: user.institutionId,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt.toISOString(),
      } : null;
    }
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const rateLimit = await withRateLimit(req, 'refresh');
  if (!rateLimit.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const cookieStore = await cookies();
  // Web clients send no body and read the token from the cookie; native clients
  // post `{ refreshToken }`. Either way nothing legitimate is large, and this is
  // an unauthenticated endpoint, so the body is capped rather than buffered whole.
  const parsedBody = await readJsonBody<{ refreshToken?: unknown }>(req, AUTH_MAX_BODY_BYTES);
  if (!parsedBody.ok && parsedBody.status === 413) return bodyTooLargeResponse();
  const bodyRefreshToken = parsedBody.ok && typeof parsedBody.data?.refreshToken === 'string'
    ? parsedBody.data.refreshToken
    : null;
  const refreshToken = bodyRefreshToken ?? cookieStore.get('refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const rotation = await rotateRefreshToken(refreshToken);
  if (rotation.status !== 'ROTATED') {
    await clearAuthCookies();
    return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
  }

  const current = await getCurrentPayload(rotation.userRole, rotation.userId);
  const payload = current ? await resolveCampusSession(current) : null;
  if (!payload) {
    await revokeRefreshToken(rotation.refreshToken);
    await revokeAllSessions(rotation.userRole, rotation.userId);
    await clearAuthCookies();
    return NextResponse.json({ error: 'Account is unavailable' }, { status: 401 });
  }

  const accessToken = await createAccessToken(payload);
  await setAuthCookies(accessToken, rotation.refreshToken);

  return NextResponse.json(
    {
      message: 'Token refreshed',
      // Native clients that posted the token get the rotated pair back in the
      // body; web clients rely on the cookies set above. Unchanged behaviour.
      ...(bodyRefreshToken ? { accessToken, refreshToken: rotation.refreshToken } : {}),
    },
    // This body can carry bearer tokens: never let an intermediary store it.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
