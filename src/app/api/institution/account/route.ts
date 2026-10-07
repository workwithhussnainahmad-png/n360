import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
/** No role may bypass a reviewed data-retention/deletion workflow. */
export const DELETE = requireRole(['INSTITUTION'], async () => NextResponse.json({error:'Direct institution deletion is disabled.'},{status:403}));
