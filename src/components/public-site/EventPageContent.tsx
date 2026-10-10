import Image from 'next/image';
import { CalendarDays, MapPin } from 'lucide-react';
import type { PublicEventBlock } from '@/lib/public-events';
import { pageDesignStyle, type PageDesign } from '@/lib/public-site-builder';
import { EventContentBlocks } from './EventContentBlocks';
import styles from './builder.module.css';

export type EventPageData = { title: string; summary: string | null; coverImageUrl: string | null; eventDate: string | null; venue: string | null; blocks: PublicEventBlock[]; design?: PageDesign };
export function EventPageContent({ event, institutionName, accent = '#233c32' }: { event: EventPageData; institutionName: string; accent?: string }) {
  return <div className={[styles.page, styles[event.design?.hero || 'split'] || '', !event.coverImageUrl ? styles.noCover : ''].join(' ')} style={pageDesignStyle(event.design, accent)}>
    <section className={styles.hero}><div className={styles.heroInner}><div className={styles.heroCopy}>
      <p className="text-xs font-semibold uppercase tracking-widest">Event / {institutionName}</p><h1>{event.title || 'Your event title'}</h1>{event.summary && <p>{event.summary}</p>}
      <div className="mt-6 flex flex-wrap gap-5 text-sm">{event.eventDate && <span className="flex items-center gap-2"><CalendarDays size={16} />{event.eventDate}</span>}{event.venue && <span className="flex items-center gap-2"><MapPin size={16} />{event.venue}</span>}</div>
    </div>{event.coverImageUrl && <div className={styles.heroVisual}><Image unoptimized fill priority sizes="(max-width: 640px) 100vw, 600px" src={event.coverImageUrl} alt={event.title + ' cover'} className="object-cover" /></div>}</div></section>
    <article className={styles.content}><EventContentBlocks blocks={event.blocks} />{!event.blocks.length && <p>Contact {institutionName} for more information about this event.</p>}</article>
  </div>;
}
