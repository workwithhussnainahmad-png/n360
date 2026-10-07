import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { employees, institutions, parentAccounts, staff, students } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { hashPassword as hash, verifyPassword as verify } from '@/lib/argon2-pool';
import { requireRole } from '@/lib/rbac';
import { changePasswordSchema } from '@/lib/validators/auth';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';
import { clearAuthCookies, createTokens, revokeAllSessions, setAuthCookies } from '@/lib/auth';
import { invalidateUserValidity, resolveUserCreatedAt } from '@/lib/user';
import { AUTH_MAX_BODY_BYTES, readJsonBody } from '@/lib/http';

async function getPasswordHashForSession(role: string, userId: number, institutionId?: number) {
  if (role === 'INSTITUTION') {
    const [user] = await db.select({ passwordHash: institutions.adminPasswordHash }).from(institutions).where(eq(institutions.id, userId)).limit(1);
    return user;
  }
  if (role === 'EMPLOYEE') {
    const [user] = await db.select({ passwordHash: employees.passwordHash }).from(employees).where(eq(employees.id, userId)).limit(1);
    return user;
  }
  if (role === 'STAFF') {
    if (!institutionId) return undefined;
    const [user] = await db.select({ passwordHash: staff.passwordHash }).from(staff).where(and(
      eq(staff.id, userId),
      eq(staff.institutionId, institutionId),
    )).limit(1);
    return user;
  }
  if (role === 'STUDENT') {
    if (!institutionId) return undefined;
    const [user] = await db.select({ passwordHash: students.passwordHash }).from(students).where(and(
      eq(students.id, userId),
      eq(students.institutionId, institutionId),
    )).limit(1);
    return user;
  }
  if (role === 'PARENT') {
    if (!institutionId) return undefined;
    const [user] = await db.select({ passwordHash: parentAccounts.passwordHash }).from(parentAccounts).where(and(
      eq(parentAccounts.id, userId),
      eq(parentAccounts.institutionId, institutionId),
    )).limit(1);
    return user?.passwordHash ? { passwordHash: user.passwordHash } : undefined;
  }
}

async function updatePasswordForSession(role: string, userId: number, passwordHash: string, institutionId?: number) {
  if (role === 'INSTITUTION') {
    await db.update(institutions).set({ adminPasswordHash: passwordHash, mustChangePassword: false }).where(eq(institutions.id, userId));
    return;
  }
  if (role === 'EMPLOYEE') {
    await db.update(employees)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(employees.id, userId));
    return;
  }
  if (role === 'STAFF') {
    if (!institutionId) return;
    await db.update(staff)
      .set({ passwordHash, mustChangePassword: false })
      .where(and(eq(staff.id, userId), eq(staff.institutionId, institutionId)));
    return;
  }
  if (role === 'STUDENT') {
    if (!institutionId) return;
    await db.update(students)
      .set({ passwordHash, mustChangePassword: false })
      .where(and(eq(students.id, userId), eq(students.institutionId, institutionId)));
    return;
  }
  if (role === 'PARENT') {
    if (!institutionId) return;
    await db.update(parentAccounts)
      .set({
        passwordHash,
        mustChangePassword: false,
        status: 'ACTIVE',
        sessionVersion: sql`${parentAccounts.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(parentAccounts.id, userId), eq(parentAccounts.institutionId, institutionId)));
  }
}

export const POST = requireRole(['INSTITUTION', 'EMPLOYEE', 'STAFF', 'STUDENT', 'PARENT'], async (req: NextRequest, { session }) => {
  // Bounded read: two short passwords. Previously an un-caught `req.json()`,
  // which both buffered an unbounded body and turned malformed JSON into a 500.
  const bodyResult = await readJsonBody(req, AUTH_MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status });
  }
  const parsed = changePasswordSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { currentPassword, newPassword, returnTokens } = parsed.data;

  const user = await getPasswordHashForSession(session.role, session.userId, session.institutionId);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const isValid = await verify(user.passwordHash, currentPassword);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid current password' }, { status: 400 });
  }

  const passwordHash = await hash(newPassword);
  await updatePasswordForSession(session.role, session.userId, passwordHash, session.institutionId);
  await invalidateUserValidity(session.role, session.userId);
  await revokeAllSessions(session.role, session.userId);

  await logAudit({
    institutionId: session.institutionId,
    actorId: session.userId,
    actorRole: session.role,
    action: 'CHANGE_PASSWORD',
    target: 'Self',
    ip: getClientIp(req),
  });

  if (returnTokens) {
    const createdAt = session.createdAt
      ?? (await resolveUserCreatedAt(session)).toISOString();
    const { accessToken, refreshToken } = await createTokens({
      userId: session.userId,
      role: session.role,
      institutionId: session.institutionId,
      campusId: session.campusId,
      mustChangePassword: false,
      createdAt,
    });
    await setAuthCookies(accessToken, refreshToken);

    return NextResponse.json({
      message: 'Password changed successfully.',
      accessToken,
      refreshToken,
    });
  }

  await clearAuthCookies();
  return NextResponse.json({ message: 'Password changed successfully. Please login again to refresh session.', role: session.role });
}, { allowPasswordChangeRequired: true });
