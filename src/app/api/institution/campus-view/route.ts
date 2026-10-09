import { validationError } from '@/lib/validation-errors';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/rbac';
import { readJsonBody } from '@/lib/http';
import { listInstitutionCampuses } from '@/lib/campus-workspaces';
import { createCampusViewToken } from '@/lib/campus-view';
import { setCampusViewCookie } from '@/lib/auth';

export const POST = requireRole(['INSTITUTION'], async (req: NextRequest, { session }) => {
  const body = await readJsonBody(req, 1024);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = z.union([
    z.object({ campusId: z.number().int().positive() }).strict(),
    z.object({ returnHome: z.literal(true) }).strict(),
  ]).safeParse(body.data);
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 });
  const available = await listInstitutionCampuses(session);
  const selected = available.find((campus) => (
    'returnHome' in parsed.data ? campus.workspaceId === session.homeInstitutionId : campus.id === parsed.data.campusId
  ) && campus.name === campus.workspaceName);
  if (!selected) return NextResponse.json({ error: 'Campus not found.' }, { status: 404 });
  await setCampusViewCookie(await createCampusViewToken(session, selected.workspaceId));
  return NextResponse.json({ success: true, readOnly: selected.workspaceId !== session.homeInstitutionId });
}, { allowCampusSwitch: true });
