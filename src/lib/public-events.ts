export const PUBLIC_EVENT_DURATIONS = ['ONE_DAY', 'THREE_DAYS', 'ONE_WEEK', 'ONE_MONTH', 'FOREVER'] as const;
export type PublicEventDuration = (typeof PUBLIC_EVENT_DURATIONS)[number];

export type PublicEventBlock =
  | { id: string; type: 'heading'; text: string }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'image'; url: string; alt: string; caption: string }
  | { id: string; type: 'callout'; title: string; text: string }
  | { id: string; type: 'schedule'; time: string; title: string; description: string }
  | { id: string; type: 'button'; label: string; url: string };

export const PUBLIC_EVENT_DURATION_LABELS: Record<PublicEventDuration, string> = {
  ONE_DAY: '1 day',
  THREE_DAYS: '3 days',
  ONE_WEEK: '1 week',
  ONE_MONTH: '1 month',
  FOREVER: 'Forever',
};

export function publicEventExpiry(publishedAt: Date, duration: PublicEventDuration): Date | null {
  if (duration === 'FOREVER') return null;
  if (duration === 'ONE_MONTH') {
    const expiresAt = new Date(publishedAt);
    expiresAt.setUTCMonth(expiresAt.getUTCMonth() + 1);
    return expiresAt;
  }
  const days = duration === 'ONE_DAY' ? 1 : duration === 'THREE_DAYS' ? 3 : 7;
  return new Date(publishedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export function normalizePublicEventSlug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}
