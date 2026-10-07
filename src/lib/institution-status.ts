import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { institutions } from '@/db/schema';
import type { JWTPayload } from './auth-types';
import { assertPlatformOperator } from './security-permissions';
import { invalidateUserValidity } from './user';
import { logAudit } from './audit';

export async function changeInstitutionStatus(session: JWTPayload, id: number, status: 'PENDING' | 'APPROVED' | 'REJECTED', reason?: string) {
  await assertPlatformOperator(session);
  if (!Number.isSafeInteger(id) || id <= 0 || !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) throw new Error('Invalid institution status request.');
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM institutions WHERE id = ${id} FOR UPDATE`);
    const [account] = await tx.select({ status: institutions.status, parent: institutions.parentInstitutionId }).from(institutions).where(eq(institutions.id, id)).limit(1);
    if (!account || account.parent !== null) throw new Error('Main institution not found.');
    if (session.role === 'EMPLOYEE' && (account.status !== 'PENDING' || status === 'PENDING')) throw new Error('Forbidden: employees may review pending registrations only.');
    await tx.update(institutions).set({ status, rejectionReason: status === 'REJECTED' ? reason ?? null : null }).where(eq(institutions.id, id));
  });
  await invalidateUserValidity('INSTITUTION', id);
  await logAudit({ actorId: session.userId, actorRole: session.role, action: `REVIEW_INSTITUTION_${status}`, target: `Institution ${id}`, ip: 'server-action' });
  const { redis } = await import('./redis');
  if (redis.status === 'ready') await redis.del('cache:sa:dashboard:overview', 'cache:sa:dashboard:recent-regs', 'cache:employee:dashboard:overview', 'cache:employee:dashboard:pending-list').catch(() => {});
}
