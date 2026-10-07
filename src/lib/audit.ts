import { db } from '@/db';
import { auditLogs } from '@/db/schema';
import { UserRole } from './auth';

export async function logAudit(params: {
  institutionId?: number | null;
  actorId: number;
  actorRole: UserRole;
  action: string;
  target: string;
  ip: string;
}) {
  await db.insert(auditLogs).values({
    institutionId: params.institutionId || null,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    target: params.target,
    ip: params.ip,
  });
}
