import { isMainCampusWebsite } from '@/lib/public-website-access';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { institutions, publicEvents } from '@/db/schema';
import { logAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/client-ip';
import { readJsonBody } from '@/lib/http';
import { publicEventExpiry } from '@/lib/public-events';
import { getTenantContext, requireRole } from '@/lib/rbac';
import { updatePublicEventSchema } from '@/lib/validators/public-event';

function eventIdFrom(params: unknown) {
  const value = Number((params as { id?: string })?.id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export const GET = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (_req: NextRequest, { params, session }) => {
  const eventId = eventIdFrom(await params);
  if (!eventId) return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  const institutionId = getTenantContext(session);
  if (!await isMainCampusWebsite(institutionId)) return NextResponse.json({ error: 'Public website settings are available only for the main campus' }, { status: 403 });
  const [event] = await db.select().from(publicEvents).where(and(eq(publicEvents.id, eventId), eq(publicEvents.institutionId, institutionId))).limit(1);
  return event ? NextResponse.json({ event }, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Event not found' }, { status: 404 });
});

export const PATCH = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { params, session }) => {
  const eventId = eventIdFrom(await params);
  if (!eventId) return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  const institutionId = getTenantContext(session);
  if (!await isMainCampusWebsite(institutionId)) return NextResponse.json({ error: 'Public website settings are available only for the main campus' }, { status: 403 });
  const [existing] = await db.select().from(publicEvents).where(and(eq(publicEvents.id, eventId), eq(publicEvents.institutionId, institutionId))).limit(1);
  if (!existing) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const body = await readJsonBody(req, 256 * 1024);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = updatePublicEventSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid event' }, { status: 400 });
  if (parsed.data.action === 'PUBLISH') {
    const [institution] = await db.select({ status: institutions.status, publicSlug: institutions.publicSlug, publicSiteEnabled: institutions.publicSiteEnabled }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);
    if (!institution || institution.status !== 'APPROVED' || !institution.publicSlug || !institution.publicSiteEnabled) return NextResponse.json({ error: 'Enable the approved public website before publishing events' }, { status: 409 });
  }
  const { action, summary, coverImageUrl, eventDate, venue, ...content } = parsed.data;
  const publishing = action === 'PUBLISH';
  const unpublishing = action === 'UNPUBLISH' || action === 'SAVE_DRAFT';
  const publishedAt = publishing ? new Date() : unpublishing ? null : existing.publishedAt;
  const expiresAt = publishing ? publicEventExpiry(publishedAt!, parsed.data.visibilityDuration) : unpublishing ? null : existing.expiresAt;

  try {
    const [updated] = await db.update(publicEvents).set({
      ...content,
      summary: summary || null,
      coverImageUrl: coverImageUrl || null,
      eventDate: eventDate || null,
      venue: venue || null,
      status: publishing ? 'PUBLISHED' : unpublishing ? 'DRAFT' : existing.status,
      publishedAt,
      expiresAt,
      updatedAt: new Date(),
    }).where(and(eq(publicEvents.id, eventId), eq(publicEvents.institutionId, institutionId))).returning();
    await logAudit({ institutionId, actorId: session.userId, actorRole: session.role, action: publishing ? 'PUBLISH_PUBLIC_EVENT' : unpublishing ? 'UNPUBLISH_PUBLIC_EVENT' : 'UPDATE_PUBLIC_EVENT', target: `Public event ${eventId}`, ip: getClientIp(req) });
    return NextResponse.json({ event: updated });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if (databaseError.code === '23505' || databaseError.cause?.code === '23505') return NextResponse.json({ error: 'That event URL is already in use' }, { status: 409 });
    throw error;
  }
});

export const DELETE = requireRole(['INSTITUTION', 'INSTITUTION_ADMIN'], async (req: NextRequest, { params, session }) => {
  const eventId = eventIdFrom(await params);
  if (!eventId) return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  const institutionId = getTenantContext(session);
  if (!await isMainCampusWebsite(institutionId)) return NextResponse.json({ error: 'Public website settings are available only for the main campus' }, { status: 403 });
  const [deleted] = await db.delete(publicEvents).where(and(eq(publicEvents.id, eventId), eq(publicEvents.institutionId, institutionId))).returning({ id: publicEvents.id });
  if (!deleted) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  await logAudit({ institutionId, actorId: session.userId, actorRole: session.role, action: 'DELETE_PUBLIC_EVENT', target: `Public event ${eventId}`, ip: getClientIp(req) });
  return NextResponse.json({ success: true });
});
