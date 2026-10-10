import type { PublicEventBlock, PublicEventDuration } from '@/lib/public-events';
import type { PageDesign } from '@/lib/public-site-builder';

export type EventRecord = {
  id: number; title: string; slug: string; summary: string | null; coverImageUrl: string | null; eventDate: string | null; venue: string | null;
  blocks: PublicEventBlock[]; design?: PageDesign; status: 'DRAFT' | 'PUBLISHED'; visibilityDuration: PublicEventDuration;
  publishedAt: string | null; expiresAt: string | null; createdAt: string; updatedAt: string;
};
export type EventDraft = Omit<EventRecord, 'id' | 'publishedAt' | 'expiresAt' | 'createdAt' | 'updatedAt'> & { id: number | null };
export type EventListItem = Pick<EventRecord, 'id' | 'title' | 'slug' | 'status' | 'visibilityDuration' | 'publishedAt' | 'expiresAt' | 'createdAt' | 'updatedAt'> & { blockCount: number };
export function eventListItem(event: EventRecord): EventListItem {
  return { id: event.id, title: event.title, slug: event.slug, status: event.status, visibilityDuration: event.visibilityDuration, publishedAt: event.publishedAt, expiresAt: event.expiresAt, createdAt: event.createdAt, updatedAt: event.updatedAt, blockCount: event.blocks.length };
}
