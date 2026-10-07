import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { listInstitutionRestores } from '@/lib/institution-restores';
import { restoreErrorResponse, restoreRequestId } from '@/lib/institution-restore-http';

export const GET = requireRole(["SUPER_ADMIN"], async req => {
  try {
    const value = req.nextUrl.searchParams.get('institutionId');
    return NextResponse.json({ items: await listInstitutionRestores(value ? restoreRequestId(value) : undefined) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return restoreErrorResponse(error); }
}, { permission: 'platform.restore' });
