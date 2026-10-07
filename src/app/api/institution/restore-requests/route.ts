import { NextResponse } from 'next/server';
import { getTenantContext, requireRole } from '@/lib/rbac';
import { listInstitutionRestores } from '@/lib/institution-restores';
import { acceptRestoreUpload, MAX_RESTORE_UPLOAD_BYTES, restoreErrorResponse } from '@/lib/institution-restore-http';
import { getClientIp } from '@/lib/client-ip';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const GET = requireRole(["INSTITUTION"], async (_req, { session }) => {
  try { return NextResponse.json({ items: await listInstitutionRestores(getTenantContext(session)) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return restoreErrorResponse(error); }
}, { permission: 'institution.security' });
export const POST = requireRole(["INSTITUTION"], async (req, { session }) => {
  const institutionId = getTenantContext(session);
  const limit = await withRateLimit(req, 'export', `restore-upload:${institutionId}`);
  if (!limit.success) return NextResponse.json({ error: 'Too many restore uploads. Please wait.' }, { status: 429 });
  try { return await acceptRestoreUpload(req, institutionId, { id: session.userId, role: session.role as 'INSTITUTION' | 'INSTITUTION_ADMIN', ip: getClientIp(req) }); }
  catch (error) { return restoreErrorResponse(error); }
}, { maxBodyBytes: MAX_RESTORE_UPLOAD_BYTES , permission: 'institution.security'});
