import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { institutions } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';
import { institutionPublicUrl } from '@/lib/institution-domain';
import { invalidateInstitutionTenantCache } from '@/lib/institution-tenant';
import { requireRole } from '@/lib/rbac';
import { institutionPublicSlugSchema } from '@/lib/validators/institution';

const updatePublicSiteSchema = z.object({
  publicSlug: institutionPublicSlugSchema,
  publicSiteEnabled: z.boolean(),
}).strict();

export const PATCH = requireRole(['SUPER_ADMIN', 'EMPLOYEE'], async (req: NextRequest, { params, session }) => {
  const { id } = await params;
  const institutionId = Number.parseInt(id, 10);
  if (!Number.isInteger(institutionId) || institutionId <= 0) {
    return NextResponse.json({ error: 'Invalid institution ID' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = updatePublicSiteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid public-site settings' }, { status: 400 });
  }

  const [institution] = await db.select({
    id: institutions.id,
    status: institutions.status,
    previousSlug: institutions.publicSlug,
  }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);

  if (!institution) {
    return NextResponse.json({ error: 'Institution not found' }, { status: 404 });
  }
  if (institution.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Only approved institutions can receive a public website' }, { status: 409 });
  }

  const { publicSlug, publicSiteEnabled } = parsed.data;

  try {
    await db.update(institutions).set(publicSiteEnabled
      ? { publicSlug, publicSiteEnabled: true }
      : { publicSlug, publicSiteEnabled: false, admissionsEnabled: false }
    ).where(eq(institutions.id, institutionId));
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if (databaseError.code === '23505' || databaseError.cause?.code === '23505') {
      return NextResponse.json({ error: 'That subdomain is already assigned to another institution' }, { status: 409 });
    }
    throw error;
  }

  await Promise.all([
    institution.previousSlug ? invalidateInstitutionTenantCache(institution.previousSlug) : Promise.resolve(),
    invalidateInstitutionTenantCache(publicSlug),
  ]);

  await logAudit({
    actorId: session.userId,
    actorRole: session.role,
    action: publicSiteEnabled ? 'ENABLE_INSTITUTION_PUBLIC_SITE' : 'DISABLE_INSTITUTION_PUBLIC_SITE',
    target: `Institution ${institutionId} (${publicSlug})`,
    ip: getClientIp(req),
  });

  return NextResponse.json({
    publicSlug,
    publicSiteEnabled,
    publicUrl: institutionPublicUrl(publicSlug),
  });
});
