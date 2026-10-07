import { z } from 'zod';
import { PUBLIC_EVENT_DURATIONS } from '@/lib/public-events';

const optionalHttpsUrl = z.string().trim().max(500).refine((value) => {
  if (!value) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, 'Enter a valid HTTPS URL');

const optionalLink = z.string().trim().max(500).refine((value) => {
  if (!value || value.startsWith('/') || value.startsWith('#')) return true;
  try { return ['http:', 'https:', 'mailto:', 'tel:'].includes(new URL(value).protocol); } catch { return false; }
}, 'Enter a valid page path or URL');

const blockId = z.string().trim().min(1).max(80);
const eventBlock = z.discriminatedUnion('type', [
  z.object({ id: blockId, type: z.literal('heading'), text: z.string().trim().max(200) }).strict(),
  z.object({ id: blockId, type: z.literal('paragraph'), text: z.string().trim().max(4000) }).strict(),
  z.object({ id: blockId, type: z.literal('image'), url: optionalHttpsUrl, alt: z.string().trim().max(160), caption: z.string().trim().max(240) }).strict(),
  z.object({ id: blockId, type: z.literal('callout'), title: z.string().trim().max(160), text: z.string().trim().max(1200) }).strict(),
  z.object({ id: blockId, type: z.literal('schedule'), time: z.string().trim().max(80), title: z.string().trim().max(160), description: z.string().trim().max(600) }).strict(),
  z.object({ id: blockId, type: z.literal('button'), label: z.string().trim().max(80), url: optionalLink }).strict(),
]);

export const publicEventContentSchema = z.object({
  title: z.string().trim().min(1, 'Event title is required').max(160),
  slug: z.string().trim().toLowerCase().min(1, 'Event URL is required').max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens for the event URL'),
  summary: z.string().trim().max(500),
  coverImageUrl: optionalHttpsUrl,
  eventDate: z.string().trim().max(120),
  venue: z.string().trim().max(200),
  blocks: z.array(eventBlock).max(40),
  visibilityDuration: z.enum(PUBLIC_EVENT_DURATIONS),
}).strict();

export const createPublicEventSchema = publicEventContentSchema.extend({
  action: z.enum(['SAVE_DRAFT', 'PUBLISH']),
}).strict();

export const updatePublicEventSchema = publicEventContentSchema.extend({
  action: z.enum(['SAVE', 'SAVE_DRAFT', 'PUBLISH', 'UNPUBLISH']),
}).strict();
