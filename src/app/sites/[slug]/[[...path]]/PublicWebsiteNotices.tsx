'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { CalendarDays, MapPin, X } from 'lucide-react';
import type { WebsiteEventPopup, WebsiteNotices, WebsiteUpcomingEvent } from '@/lib/public-website-notices';

function hasEventContent(event: WebsiteEventPopup | WebsiteUpcomingEvent) {
  return Boolean(event.title || event.description || event.dateTime || event.venue || ('imageUrl' in event && event.imageUrl));
}

function ActionLink({ text, href, onClick }: { text: string; href: string; onClick?: () => void }) {
  if (!text || !href) return null;
  return <a href={href} onClick={onClick} className="inline-flex min-h-10 items-center justify-center bg-[var(--site-accent)] px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90">{text}</a>;
}

function PopupShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}><div className="relative my-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-[#f8f6f0] shadow-2xl"><button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/70 text-white transition hover:bg-black" aria-label="Close popup"><X className="h-5 w-5" /></button>{children}</div></div>;
}

export function PublicWebsiteNotices({ notices }: { notices: WebsiteNotices }) {
  const eventVisible = notices.eventPopup.enabled && hasEventContent(notices.eventPopup);
  const upcomingEvents = useMemo(() => notices.upcomingEventsPopup.events.filter(hasEventContent), [notices.upcomingEventsPopup.events]);
  const upcomingVisible = notices.upcomingEventsPopup.enabled && upcomingEvents.length > 0;
  const [activePopup, setActivePopup] = useState<'event' | 'upcoming' | null>(eventVisible ? 'event' : upcomingVisible ? 'upcoming' : null);

  useEffect(() => {
    if (!activePopup) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActivePopup(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activePopup]);

  function closeEvent() {
    setActivePopup(upcomingVisible ? 'upcoming' : null);
  }

  return <>
    {notices.urgentAlert.enabled && notices.urgentAlert.message && <div className="flex flex-col items-center justify-center gap-2 border-b border-red-800 bg-red-700 px-5 py-2.5 text-center text-sm font-semibold text-white sm:flex-row sm:gap-4"><span>{notices.urgentAlert.message}</span><ActionLink text={notices.urgentAlert.buttonText} href={notices.urgentAlert.buttonUrl} /></div>}

    {activePopup === 'event' && <PopupShell title={notices.eventPopup.title || 'Event announcement'} onClose={closeEvent}>
      {notices.eventPopup.imageUrl && <div className="relative aspect-[16/7] bg-stone-200"><Image unoptimized fill priority sizes="672px" src={notices.eventPopup.imageUrl} alt="" className="object-cover" /></div>}
      <div className="p-6 sm:p-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--site-accent)]">Featured event</p>
        {notices.eventPopup.title && <h2 className="font-display text-3xl font-bold tracking-[-0.04em] text-[#171c1a]">{notices.eventPopup.title}</h2>}
        {(notices.eventPopup.dateTime || notices.eventPopup.venue) && <div className="mt-4 flex flex-wrap gap-4 text-sm font-medium text-stone-600">{notices.eventPopup.dateTime && <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{notices.eventPopup.dateTime}</span>}{notices.eventPopup.venue && <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{notices.eventPopup.venue}</span>}</div>}
        {notices.eventPopup.description && <p className="mt-5 whitespace-pre-line text-sm leading-7 text-stone-600">{notices.eventPopup.description}</p>}
        <div className="mt-6"><ActionLink text={notices.eventPopup.buttonText} href={notices.eventPopup.buttonUrl} onClick={closeEvent} /></div>
      </div>
    </PopupShell>}

    {activePopup === 'upcoming' && <PopupShell title={notices.upcomingEventsPopup.heading || 'Upcoming events'} onClose={() => setActivePopup(null)}>
      <div className="p-6 sm:p-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--site-accent)]">Save the dates</p>
        <h2 className="font-display text-3xl font-bold tracking-[-0.04em] text-[#171c1a]">{notices.upcomingEventsPopup.heading || 'Upcoming events'}</h2>
        <div className="mt-6 max-h-[60vh] space-y-3 overflow-y-auto pr-1">{upcomingEvents.map((event, index) => <article key={`${event.title}-${event.dateTime}-${index}`} className="rounded-xl border border-black/10 bg-white p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div>{event.title && <h3 className="font-display text-xl font-semibold text-[#171c1a]">{event.title}</h3>}{event.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-600">{event.description}</p>}</div>{event.dateTime && <span className="shrink-0 text-xs font-bold text-[var(--site-accent)]">{event.dateTime}</span>}</div>{event.venue && <p className="mt-3 flex items-center gap-2 text-xs text-stone-500"><MapPin className="h-3.5 w-3.5" />{event.venue}</p>}<div className="mt-3"><ActionLink text={event.buttonText} href={event.buttonUrl} /></div></article>)}</div>
      </div>
    </PopupShell>}
  </>;
}
