import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { institutionCustomRoles } from '@/db/schema';
import { getTenantContext, requireRole } from '@/lib/rbac';

const MAX_PERMISSIONS = 100;

function parseRole(body: unknown) {
  const value = body as { name?: unknown; permissions?: unknown };
  const name = typeof value?.name === 'string' ? value.name.trim() : '';
  const permissions = Array.isArray(value?.permissions)
    ? value.permissions.filter((permission): permission is string => typeof permission === 'string' && permission.length <= 100)
    : [];
  if (!name || name.length > 100 || permissions.length > MAX_PERMISSIONS) return null;
  return { name, permissions: [...new Set(permissions)] };
}

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (_req, { session }) => {
  const institutionId = getTenantContext(session);
  const roles = await db.select().from(institutionCustomRoles)
    .where(eq(institutionCustomRoles.institutionId, institutionId))
    .orderBy(institutionCustomRoles.name);
  return NextResponse.json({ roles });
});

export const POST = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const parsed = parseRole(await req.json());
  if (!parsed) return NextResponse.json({ error: 'A role name and valid permissions are required' }, { status: 400 });
  const [role] = await db.insert(institutionCustomRoles).values({ institutionId: getTenantContext(session), ...parsed }).returning();
  return NextResponse.json({ role }, { status: 201 });
});

export const PATCH = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const body = await req.json() as { id?: unknown };
  const id = Number(body.id);
  const parsed = parseRole(body);
  if (!Number.isInteger(id) || !parsed) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  const [role] = await db.update(institutionCustomRoles).set(parsed).where(and(eq(institutionCustomRoles.id, id), eq(institutionCustomRoles.institutionId, getTenantContext(session)))).returning();
  return role ? NextResponse.json({ role }) : NextResponse.json({ error: 'Role not found' }, { status: 404 });
});

export const DELETE = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Invalid role id' }, { status: 400 });
  const [role] = await db.delete(institutionCustomRoles).where(and(eq(institutionCustomRoles.id, id), eq(institutionCustomRoles.institutionId, getTenantContext(session)))).returning();
  return role ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Role not found' }, { status: 404 });
});
