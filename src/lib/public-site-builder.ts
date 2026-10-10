import type { CSSProperties } from 'react';
import type { PublicEventBlock } from './public-events';

export type PageDesign = {
  accent?: string; background?: 'white' | 'warm'; font?: 'default' | 'sans' | 'serif';
  hero?: 'split' | 'banner' | 'minimal'; width?: 'standard' | 'wide'; spacing?: 'compact' | 'relaxed';
};
export const WEBSITE_SECTIONS = [
  { id: 'statistics', label: 'At a glance' }, { id: 'about', label: 'About' },
  { id: 'programs', label: 'Programs' }, { id: 'events', label: 'Events' },
  { id: 'timetable', label: 'Timetable' }, { id: 'leadership', label: 'Leadership' },
  { id: 'highlights', label: 'Highlights' }, { id: 'campus', label: 'Gallery' },
  { id: 'custom', label: 'Custom content' }, { id: 'admissions', label: 'Admissions' },
  { id: 'contact', label: 'Contact' },
] as const;
export type WebsiteSectionId = typeof WEBSITE_SECTIONS[number]['id'];
export type WebsiteSection = { id: WebsiteSectionId; visible: boolean; title: string };
export type WebsiteDesign = PageDesign & { sections?: WebsiteSection[]; customBlocks?: PublicEventBlock[]; heroButtonLabel?: string; heroButtonUrl?: string };
export const BLOCK_LABELS = {
  heading: 'Heading', paragraph: 'Text', image: 'Image', callout: 'Highlight', schedule: 'Schedule', button: 'Button',
  gallery: 'Photo gallery', split: 'Image + text', faq: 'Questions & answers', list: 'List', video: 'Video', divider: 'Divider', spacer: 'Space',
} satisfies Record<PublicEventBlock['type'], string>;

export function websiteSections(design?: WebsiteDesign): WebsiteSection[] {
  const saved = design?.sections || [];
  return [...saved, ...WEBSITE_SECTIONS.filter((item) => !saved.some((section) => section.id === item.id)).map((item) => ({ id: item.id, visible: true, title: '' }))];
}

export function safePublicLink(value: string): boolean {
  if (!value || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  if (value.startsWith('#')) return true;
  if (value.startsWith('/')) return !value.startsWith('//');
  try { return ['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(value).protocol); } catch { return false; }
}

export function videoEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts)\/([\w-]{11})$/.exec(url.pathname)?.[1] || null;
    }
    if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    if (['vimeo.com', 'www.vimeo.com'].includes(url.hostname) && /^\/\d{1,12}$/.test(url.pathname)) return `https://player.vimeo.com/video${url.pathname}`;
    return null;
  } catch { return null; }
}

export function pageDesignStyle(design: PageDesign = {}, fallback = '#233c32'): CSSProperties {
  const color = design.accent || fallback;
  const channels = /^#[0-9a-f]{6}$/i.test(color) ? [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) : [0, 0, 0];
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  return {
    '--site-accent': color,
    '--site-on-accent': luminance > .179 ? '#171c1a' : '#ffffff',
    '--builder-paper': design.background === 'white' ? '#ffffff' : '#f6f3eb',
    '--builder-font': design.font === 'serif' ? 'Georgia, Times New Roman, serif' : design.font === 'sans' ? 'Arial, Helvetica, sans-serif' : undefined,
    '--builder-width': design.width === 'wide' ? '1200px' : '960px',
    '--builder-gap': design.spacing === 'compact' ? '20px' : '36px',
  } as CSSProperties;
}

export function makePublicBlock(type: PublicEventBlock['type']): PublicEventBlock {
  const id = newPublicBlockId();
  switch (type) {
    case 'heading': return { id, type, text: 'A new chapter starts here' };
    case 'paragraph': return { id, type, text: 'Share the details your visitors need to know.' };
    case 'image': return { id, type, url: '', alt: '', caption: '' };
    case 'callout': return { id, type, title: 'Good to know', text: 'Add an important detail for visitors.' };
    case 'schedule': return { id, type, time: '10:00 AM', title: 'Welcome and introductions', description: '' };
    case 'button': return { id, type, label: 'Get in touch', url: '/#contact' };
    case 'gallery': return { id, type, images: [], columns: 3 };
    case 'split': return { id, type, title: 'Discover more', text: 'Tell your story alongside a photograph.', url: '', alt: '', imageSide: 'left' };
    case 'faq': return { id, type, items: [{ question: 'Who can attend?', answer: 'Students, families, and members of our community are welcome.' }] };
    case 'list': return { id, type, items: ['Add your first item', 'Add another detail'], ordered: false };
    case 'video': return { id, type, url: '', caption: '' };
    case 'divider': return { id, type };
    case 'spacer': return { id, type, height: 48 };
  }
}

export function newPublicBlockId(): string {
  return globalThis.crypto?.randomUUID?.() || 'block-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

export function eventTemplate(kind: 'open-day' | 'celebration' | 'workshop'): { title: string; summary: string; blocks: PublicEventBlock[] } {
  const block = makePublicBlock;
  const titles = { 'open-day': 'Campus Open Day', celebration: 'Annual Celebration', workshop: 'Learning Workshop' };
  const headings = { 'open-day': 'Experience our campus', celebration: 'Celebrating our community', workshop: 'Learn something new, together' };
  const descriptions = { 'open-day': 'Meet our teachers, explore our learning spaces, and find out what makes our community special.', celebration: 'Join students, families, and educators for a celebration of creativity, effort, and achievement.', workshop: 'Discover new ideas through practical activities, discussion, and shared learning.' };
  const blocks: PublicEventBlock[] = [
    { ...block('heading'), type: 'heading', text: headings[kind] },
    { ...block('paragraph'), type: 'paragraph', text: descriptions[kind] },
    { ...block('split'), type: 'split', title: kind === 'workshop' ? 'What you will learn' : 'A day to remember', text: 'Add the experiences, activities, and highlights visitors can look forward to.', url: '', alt: '', imageSide: 'left' },
    { ...block('schedule'), type: 'schedule', time: '10:00 AM', title: 'Welcome and introductions', description: 'Meet the team and discover what the day has in store.' },
    { ...block('schedule'), type: 'schedule', time: '10:30 AM', title: kind === 'workshop' ? 'Hands-on session' : kind === 'celebration' ? 'Student showcases' : 'Campus tour', description: 'Update this schedule to match your event.' },
    kind === 'celebration' ? block('gallery') : { ...block('list'), type: 'list', ordered: false, items: ['Meet our community', 'Explore the activities', 'Bring your questions'] },
    block('faq'),
    { ...block('callout'), type: 'callout', title: 'Plan your visit', text: 'Contact our office for arrival instructions, accessibility arrangements, and any registration requirements.' },
    { ...block('button'), type: 'button', label: 'Contact our office', url: '/#contact' },
  ];
  return { title: titles[kind], summary: descriptions[kind], blocks };
}
