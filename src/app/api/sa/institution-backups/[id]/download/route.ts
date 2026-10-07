import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';

export const GET = requireRole(["SUPER_ADMIN"], async (req: NextRequest, { params, session }) => {
  void req; void params; void session;
  return NextResponse.json({ error: 'Institution backups are delivered directly to the institution Google Drive' }, { status: 410 });
}, { permission: 'platform.restore' });
