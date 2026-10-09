import { validationError } from '@/lib/validation-errors';
import { isMainCampusWebsite } from '@/lib/public-website-access';
import { desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { institutions, publicEvents } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';
import { readJsonBody } from '@/lib/http';
import { publicEventExpiry } from '@/lib/public-events';
import { getTenantContext, requireRole } from '@/lib/rbac';
import { createPublicEventSchema } from '@/lib/validators/public-event';

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (_req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  if (!await isMainCampusWebsite(institutionId)) return NextResponse.json({ error: 'Public website settings are available only for the main campus' }, { status: 403 });
  const events = await db.select().from(publicEvents).where(eq(publicEvents.institutionId, institutionId)).orderBy(desc(publicEvents.updatedAt));
  return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
});

export const POST = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  if (!await isMainCampusWebsite(institutionId)) return NextResponse.json({ error: 'Public website settings are available only for the main campus' }, { status: 403 });
  const body = await readJsonBody(req, 256 * 1024);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = createPublicEventSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json(validationError(parsed.error), { status: 400 });

  if (parsed.data.action === 'PUBLISH') {
    const [institution] = await db.select({ status: institutions.status, publicSlug: institutions.publicSlug, publicSiteEnabled: institutions.publicSiteEnabled }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);
    if (!institution || institution.status !== 'APPROVED' || !institution.publicSlug || !institution.publicSiteEnabled) return NextResponse.json({ error: 'Enable the approved public website before publishing events' }, { status: 409 });
  }

  const { action, summary, coverImageUrl, eventDate, venue, ...content } = parsed.data;
  const publishedAt = action === 'PUBLISH' ? new Date() : null;
  try {
    const [created] = await db.insert(publicEvents).values({
      institutionId,
      ...content,
      summary: summary || null,
      coverImageUrl: coverImageUrl || null,
      eventDate: eventDate || null,
      venue: venue || null,
      status: action === 'PUBLISH' ? 'PUBLISHED' : 'DRAFT',
      publishedAt,
      expiresAt: publishedAt ? publicEventExpiry(publishedAt, parsed.data.visibilityDuration) : null,
    }).returning();
    await logAudit({ institutionId, actorId: session.userId, actorRole: session.role, action: 'CREATE_PUBLIC_EVENT', target: `Public event ${created.id}`, ip: getClientIp(req) });
    return NextResponse.json({ event: created }, { status: 201 });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if (databaseError.code === '23505' || databaseError.cause?.code === '23505') return NextResponse.json({ error: 'That event URL is already in use' }, { status: 409 });
    throw error;
  }
});
