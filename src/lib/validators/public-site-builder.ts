import { z } from 'zod';
import { safePublicLink, videoEmbedUrl, WEBSITE_SECTIONS } from '@/lib/public-site-builder';

export const optionalHttpsUrl = z.string().trim().max(500).refine((value) => {
  if (!value) return true;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}, 'Enter a valid HTTPS image URL');
export const optionalPublicLink = z.string().trim().max(500).refine((value) => !value || safePublicLink(value), 'Enter a page path, HTTPS URL, email link, or phone link');
const base = { id: z.string().trim().min(1).max(80), style: z.object({ align: z.enum(['left', 'center', 'right']).optional(), tone: z.enum(['plain', 'soft', 'accent']).optional(), spacing: z.enum(['compact', 'normal', 'roomy']).optional() }).strict().optional() };
const image = { url: optionalHttpsUrl, alt: z.string().trim().max(160), caption: z.string().trim().max(240) };
export const publicBlockSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('heading'), text: z.string().trim().max(200) }).strict(),
  z.object({ ...base, type: z.literal('paragraph'), text: z.string().trim().max(4000) }).strict(),
  z.object({ ...base, type: z.literal('image'), ...image }).strict(),
  z.object({ ...base, type: z.literal('callout'), title: z.string().trim().max(160), text: z.string().trim().max(1200) }).strict(),
  z.object({ ...base, type: z.literal('schedule'), time: z.string().trim().max(80), title: z.string().trim().max(160), description: z.string().trim().max(600) }).strict(),
  z.object({ ...base, type: z.literal('button'), label: z.string().trim().max(80), url: optionalPublicLink }).strict(),
  z.object({ ...base, type: z.literal('gallery'), images: z.array(z.object(image).strict()).max(12), columns: z.union([z.literal(2), z.literal(3)]) }).strict(),
  z.object({ ...base, type: z.literal('split'), title: z.string().trim().max(160), text: z.string().trim().max(4000), url: optionalHttpsUrl, alt: z.string().trim().max(160), imageSide: z.enum(['left', 'right']) }).strict(),
  z.object({ ...base, type: z.literal('faq'), items: z.array(z.object({ question: z.string().trim().max(200), answer: z.string().trim().max(2000) }).strict()).max(12) }).strict(),
  z.object({ ...base, type: z.literal('list'), items: z.array(z.string().trim().max(500)).max(30), ordered: z.boolean() }).strict(),
  z.object({ ...base, type: z.literal('video'), url: z.string().trim().max(500).refine((value) => !value || Boolean(videoEmbedUrl(value)), 'Use a YouTube or Vimeo video link'), caption: z.string().trim().max(240) }).strict(),
  z.object({ ...base, type: z.literal('divider') }).strict(),
  z.object({ ...base, type: z.literal('spacer'), height: z.union([z.literal(24), z.literal(48), z.literal(80)]) }).strict(),
]);
export const publicBlocksSchema = z.array(publicBlockSchema).max(40).refine((blocks) => new Set(blocks.map((b) => b.id)).size === blocks.length, 'Each content block must have a unique ID');
export const pageDesignSchema = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid brand color').optional(),
  background: z.enum(['white', 'warm']).optional(), font: z.enum(['default', 'sans', 'serif']).optional(),
  hero: z.enum(['split', 'banner', 'minimal']).optional(), width: z.enum(['standard', 'wide']).optional(), spacing: z.enum(['compact', 'relaxed']).optional(),
}).strict();
const sectionId = z.enum(WEBSITE_SECTIONS.map((s) => s.id));
export const websiteDesignSchema = pageDesignSchema.extend({
  sections: z.array(z.object({ id: sectionId, visible: z.boolean(), title: z.string().trim().max(120) }).strict()).max(11).refine((sections) => new Set(sections.map((s) => s.id)).size === sections.length, 'Each website section must appear only once').optional(),
  customBlocks: publicBlocksSchema.optional(), heroButtonLabel: z.string().trim().max(80).optional(), heroButtonUrl: optionalPublicLink.optional(),
}).strict();
