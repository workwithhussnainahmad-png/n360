import { NextResponse } from 'next/server';
import { getTenantContext, requireRole } from '@/lib/rbac';
import { actOnInstitutionRestore } from '@/lib/institution-restores';
import { restoreErrorResponse, restoreRequestId } from '@/lib/institution-restore-http';
import { readJsonBody } from '@/lib/http';
import { getClientIp } from '@/lib/client-ip';

export const POST = requireRole(["INSTITUTION"], async (req, { session, params }) => {
  const body = await readJsonBody<{ action?: string; previewHash?: string }>(req, 4096);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  if (!body.data || !['approve','reject'].includes(body.data.action ?? '')) return NextResponse.json({ error: 'Choose approve or reject.' }, { status: 400 });
  try {
    const { id } = await params;
    await actOnInstitutionRestore(restoreRequestId(id), getTenantContext(session), body.data.action!, body.data.previewHash, { id: session.userId, role: session.role as 'INSTITUTION' | 'INSTITUTION_ADMIN', ip: getClientIp(req) });
    return NextResponse.json({ success: true });
  } catch (error) { return restoreErrorResponse(error); }
}, { permission: 'institution.security' });
