import { validationError } from '@/lib/validation-errors';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireRole } from '@/lib/rbac';
import { CampusPolicyError, createCampusWorkspace } from '@/lib/campus-workspaces';
import { readJsonBody } from '@/lib/http';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';

export const POST = requireRole(['SUPER_ADMIN', 'EMPLOYEE'], async (req: NextRequest, { params, session }) => {
  const { id } = await params;
  const institutionId = /^\d+$/.test(id) ? Number(id) : NaN;
  if (!Number.isSafeInteger(institutionId) || institutionId <= 0) return NextResponse.json({ error: 'Invalid institution ID.' }, { status: 400 });
  const body = await readJsonBody(req, 4096);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const result = await createCampusWorkspace(session, body.data, institutionId);
    await logAudit({ actorId: session.userId, actorRole: session.role, action: 'CREATE_ENTERPRISE_CAMPUS', target: `Institution ${institutionId}, campus ${result.campus.id}`, ip: getClientIp(req) });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof CampusPolicyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return NextResponse.json(validationError(error), { status: 400 });
    if (error instanceof Error && /already|cannot|existing records/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
});
