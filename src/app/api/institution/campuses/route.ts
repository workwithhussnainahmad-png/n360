import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { campuses } from '@/db/schema';
import { requireRole, getTenantContext } from '@/lib/rbac';
import { and, eq, isNull } from 'drizzle-orm';
import { CampusPolicyError, createCampusWorkspace } from '@/lib/campus-workspaces';
import { readJsonBody } from '@/lib/http';
import { ZodError } from 'zod';

/** Forms offer only the current campus, never another workspace. */
export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (_req: NextRequest, { session }) => {
  const rows = await db.select({ id: campuses.id, name: campuses.name }).from(campuses)
    .where(and(eq(campuses.institutionId, getTenantContext(session)), eq(campuses.name, session.campusName!), isNull(campuses.deletedAt)));
  return NextResponse.json({ campuses: rows });
});

export const POST = requireRole(['INSTITUTION'], async (req: NextRequest, { session }) => {
  const body = await readJsonBody(req, 4096);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json({ success: true, ...await createCampusWorkspace(session, body.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof CampusPolicyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Check campus details.' }, { status: 400 });
    if (error instanceof Error && /already|cannot|existing records|Only the main|not found/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message.startsWith('Only') ? 403 : 409 });
    }
    throw error;
  }
});
