import { validationError } from '@/lib/validation-errors';
import { isMainCampusWebsite } from '@/lib/public-website-access';
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { institutionPublicProfiles, institutions, systemSettings } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';
import { invalidateInstitutionTenantCache } from '@/lib/institution-tenant';
import { institutionPublicUrl } from '@/lib/institution-domain';
import { getTenantContext, requireRole } from '@/lib/rbac';
import { institutionPublicContentPatchSchema, institutionPublicThemeSchema } from '@/lib/validators/institution-public-profile';
import { getPublicSiteTheme } from '@/lib/public-site-themes';
import { readJsonBody } from '@/lib/http';

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  if (!await isMainCampusWebsite(institutionId)) return NextResponse.json({ error: 'Public website settings are available only for the main campus' }, { status: 403 });
  const [[institution], [profile], [platformSettings]] = await Promise.all([
    db.select({
      name: institutions.name,
      publicSlug: institutions.publicSlug,
      publicSiteEnabled: institutions.publicSiteEnabled,
    }).from(institutions).where(eq(institutions.id, institutionId)).limit(1),
    db.select().from(institutionPublicProfiles).where(eq(institutionPublicProfiles.institutionId, institutionId)).limit(1),
    db.select({ publicSiteBaseDomain: systemSettings.publicSiteBaseDomain }).from(systemSettings).limit(1),
  ]);

  if (!institution) return NextResponse.json({ error: 'Institution not found' }, { status: 404 });
  const requestHost = req.headers.get('host') || '';
  const requestProtocol = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.nextUrl.protocol;
  return NextResponse.json({
    institution,
    profile: profile || null,
    publicUrl: institution.publicSlug ? institutionPublicUrl(institution.publicSlug, requestHost, requestProtocol, platformSettings?.publicSiteBaseDomain) : null,
    qrUrl: institution.publicSlug ? institutionPublicUrl(institution.publicSlug, undefined, 'https:', platformSettings?.publicSiteBaseDomain) : null,
  });
});

export const PATCH = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  if (!await isMainCampusWebsite(institutionId)) return NextResponse.json({ error: 'Public website settings are available only for the main campus' }, { status: 403 });

  const input = await readJsonBody(req, 256 * 1024);
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
  const body: unknown = input.data;

  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
    return NextResponse.json({ error: 'Provide the theme or content fields to update' }, { status: 400 });
  }
  const themeOnly = 'theme' in body;
  if (themeOnly && Object.keys(body).length !== 1) {
    return NextResponse.json({ error: 'Save the theme separately from website content. Refresh your settings page and try again.' }, { status: 400 });
  }
  const parsed = themeOnly
    ? institutionPublicThemeSchema.safeParse(body)
    : institutionPublicContentPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }

  const [institution] = await db.select({
    publicSlug: institutions.publicSlug,
    status: institutions.status,
  }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);

  if (!institution || institution.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Only approved institutions can edit a public website' }, { status: 409 });
  }
  if (!institution.publicSlug) {
    return NextResponse.json({ error: 'A platform administrator must assign your subdomain first' }, { status: 409 });
  }

  // Copy only explicitly supplied keys: optional schema defaults must never erase stored content.
  const profile = themeOnly
    ? (() => {
      const { theme } = institutionPublicThemeSchema.parse(body);
      return { theme, accentColor: getPublicSiteTheme(theme).accent };
    })()
    : Object.fromEntries(Object.keys(body).map((key) => [key, parsed.data[key as keyof typeof parsed.data]]));
  const [savedProfile] = await db.insert(institutionPublicProfiles).values({
    institutionId,
    ...profile,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: institutionPublicProfiles.institutionId,
    set: {
      ...profile,
      updatedAt: new Date(),
    },
  }).returning();

  await invalidateInstitutionTenantCache(institution.publicSlug);
  await logAudit({
    institutionId,
    actorId: session.userId,
    actorRole: session.role,
    action: 'UPDATE_INSTITUTION_PUBLIC_PROFILE',
    target: `Institution ${institutionId} public website`,
    ip: getClientIp(req),
  });

  return NextResponse.json({ success: true, profile: savedProfile });
});
