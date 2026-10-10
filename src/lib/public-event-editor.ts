import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { publicEvents } from '@/db/schema';

// The library transfers metadata only. Full content comes from the owned detail route when opened.
export function listPublicEventEditorEntries(institutionId: number) {
  return db.select({
    id: publicEvents.id, title: publicEvents.title, slug: publicEvents.slug,
    status: publicEvents.status, visibilityDuration: publicEvents.visibilityDuration,
    publishedAt: publicEvents.publishedAt, expiresAt: publicEvents.expiresAt,
    createdAt: publicEvents.createdAt, updatedAt: publicEvents.updatedAt,
    blockCount: sql<number>`jsonb_array_length(${publicEvents.blocks})`,
  }).from(publicEvents).where(eq(publicEvents.institutionId, institutionId)).orderBy(desc(publicEvents.updatedAt), desc(publicEvents.id));
}
