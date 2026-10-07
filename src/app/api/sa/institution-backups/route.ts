import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { institutionBackups, institutions } from '@/db/schema';
import { enqueueInstitutionBackup } from '@/lib/institution-backups';
import { requireRole } from '@/lib/rbac';
import { withRateLimit } from '@/lib/rate-limit';
import { count, desc, eq } from 'drizzle-orm';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';

export const GET = requireRole(['SUPER_ADMIN', 'EMPLOYEE'], async (req: NextRequest) => {
  const institutionId = Number.parseInt(req.nextUrl.searchParams.get('institutionId') || '', 10);
  if (!Number.isInteger(institutionId) || institutionId <= 0) return NextResponse.json({ error: 'Valid institutionId is required' }, { status: 400 });
  const page = Math.max(Number.parseInt(req.nextUrl.searchParams.get('page') || '1', 10) || 1, 1);
  // Covers the normal 30 daily + 12 monthly versions plus manual/export jobs
  // without forcing the operator through pagination during a recovery incident.
  const limit = 100;
  const where = eq(institutionBackups.institutionId, institutionId);
  const [items, totalRows] = await Promise.all([
    db.select().from(institutionBackups).where(where).orderBy(desc(institutionBackups.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ value: count() }).from(institutionBackups).where(where),
  ]);
  return NextResponse.json({ items, total: totalRows[0]?.value ?? 0, page, limit }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = requireRole(['SUPER_ADMIN', 'EMPLOYEE'], async (req: NextRequest, { session }) => {
  const limited = await withRateLimit(req, 'export', `institution-backup:${session.role}:${session.userId}`);
  if (!limited.success) return NextResponse.json({ error: 'Too many backup requests. Please wait.' }, { status: 429 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const value = body as Record<string, unknown>;
  const institutionId = typeof value.institutionId === 'number' ? value.institutionId : Number(value.institutionId);
  const backupType = value.backupType === 'EXPORT' ? 'EXPORT' : value.backupType === 'MANUAL' ? 'MANUAL' : null;
  if (backupType === 'EXPORT') return NextResponse.json({ error: 'Institution exports are now delivered through the institution Google Drive backup' }, { status: 410 });
  if (!Number.isInteger(institutionId) || institutionId <= 0 || !backupType) return NextResponse.json({ error: 'Valid institution and backup type are required' }, { status: 400 });
  const [institution] = await db.select({ id: institutions.id, name: institutions.name }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  if (!institution) return NextResponse.json({ error: 'Institution not found' }, { status: 404 });
  const job = await enqueueInstitutionBackup(institutionId, "MANUAL", session.userId, session.role as "SUPER_ADMIN" | "EMPLOYEE");
  await logAudit({ institutionId, actorId: session.userId, actorRole: session.role, action: `QUEUE_INSTITUTION_${backupType}`, target: `Backup ${job.id} for ${institution.name}`, ip: getClientIp(req) });
  return NextResponse.json({ job }, { status: 202 });
});
