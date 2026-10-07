import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { actOnInstitutionRestore, requestRecoveryRestore } from '@/lib/institution-restores';
import { restoreErrorResponse, restoreRequestId } from '@/lib/institution-restore-http';
import { readJsonBody } from '@/lib/http';
import { getClientIp } from '@/lib/client-ip';

export const POST = requireRole(["SUPER_ADMIN"], async (req, { session, params }) => {
  const body = await readJsonBody<{ action?: string; previewHash?: string }>(req, 4096);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  if (!body.data || !['execute','reject','recovery'].includes(body.data.action ?? '')) return NextResponse.json({ error: 'Choose execute, reject or recovery.' }, { status: 400 });
  try {
    const id = restoreRequestId((await params).id);
    const actor = { id: session.userId, role: session.role as 'SUPER_ADMIN' | 'EMPLOYEE', ip: getClientIp(req) };
    if (body.data.action === 'recovery') return NextResponse.json({ id: await requestRecoveryRestore(id, actor) }, { status: 202 });
    await actOnInstitutionRestore(id, undefined, body.data.action!, body.data.previewHash, actor);
    return NextResponse.json({ success: true });
  } catch (error) { return restoreErrorResponse(error); }
}, { permission: 'platform.restore' });
