import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';

export const POST = requireRole(["SUPER_ADMIN"], async (req: NextRequest, { params, session }) => {
  void req; void params; void session;
  return NextResponse.json({ error: 'Institution backups are verified during Google Drive upload' }, { status: 410 });
}, { permission: 'platform.restore' });
