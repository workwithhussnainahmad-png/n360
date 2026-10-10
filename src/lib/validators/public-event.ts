import { z } from 'zod';
import { PUBLIC_EVENT_DURATIONS } from '@/lib/public-events';
import { optionalHttpsUrl, pageDesignSchema, publicBlocksSchema } from './public-site-builder';

export const publicEventContentSchema = z.object({
  title: z.string().trim().min(1, 'Event title is required').max(160),
  slug: z.string().trim().toLowerCase().min(1, 'Event URL is required').max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens for the event URL'),
  summary: z.string().trim().max(500), coverImageUrl: optionalHttpsUrl,
  eventDate: z.string().trim().max(120), venue: z.string().trim().max(200),
  blocks: publicBlocksSchema, design: pageDesignSchema.optional(), visibilityDuration: z.enum(PUBLIC_EVENT_DURATIONS),
}).strict();
export const createPublicEventSchema = publicEventContentSchema.extend({ action: z.enum(['SAVE_DRAFT', 'PUBLISH']) }).strict();
export const updatePublicEventSchema = publicEventContentSchema.extend({ action: z.enum(['SAVE', 'SAVE_DRAFT', 'PUBLISH', 'UNPUBLISH']) }).strict();
