import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/db';
import { publicEvents } from '@/db/schema';

function visibleEventWhere(institutionId: number, now: Date) {
  return and(
    eq(publicEvents.institutionId, institutionId),
    eq(publicEvents.status, 'PUBLISHED'),
    lte(publicEvents.publishedAt, now),
    or(isNull(publicEvents.expiresAt), gt(publicEvents.expiresAt, now)),
  );
}

export async function listPublishedPublicEvents(institutionId: number, limit = 6) {
  const now = new Date();
  return db.select({
    id: publicEvents.id,
    title: publicEvents.title,
    slug: publicEvents.slug,
    summary: publicEvents.summary,
    coverImageUrl: publicEvents.coverImageUrl,
    eventDate: publicEvents.eventDate,
    venue: publicEvents.venue,
  }).from(publicEvents).where(visibleEventWhere(institutionId, now)).orderBy(desc(publicEvents.publishedAt)).limit(limit);
}

export async function getPublishedPublicEvent(institutionId: number, slug: string) {
  const [event] = await db.select().from(publicEvents).where(and(visibleEventWhere(institutionId, new Date()), eq(publicEvents.slug, slug))).limit(1);
  return event || null;
}
