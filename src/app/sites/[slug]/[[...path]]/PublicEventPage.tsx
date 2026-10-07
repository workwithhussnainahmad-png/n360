import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';
import type { publicEvents } from '@/db/schema';
import type { PublicInstitutionTenant } from '@/lib/institution-tenant';
import { EventContentBlocks } from '@/components/public-site/EventContentBlocks';

export function PublicEventPage({ tenant, event }: { tenant: PublicInstitutionTenant; event: typeof publicEvents.$inferSelect }) {
  const hasLogo = tenant.logoKey.startsWith('http') || tenant.logoKey.startsWith('/');
  return <div className="min-h-screen bg-[#f2efe7] text-[#171c1a]" style={{ '--site-accent': tenant.accentColor } as CSSProperties}>
    <header className="border-b border-black/10 bg-[#f2efe7]">
      <div className="mx-auto flex min-h-[76px] max-w-[1200px] items-center justify-between gap-5 px-5 sm:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">{hasLogo && <Image src={tenant.logoKey} alt="" width={40} height={40} className="h-10 w-10 border border-black/10 bg-white object-contain" />}<strong className="truncate font-display text-lg">{tenant.name}</strong></Link>
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-black/55 hover:text-black"><ArrowLeft className="h-4 w-4" />Back to website</Link>
      </div>
    </header>

    <main>
      <section className="border-b border-black/10 bg-[var(--site-accent)] text-white">
        <div className="mx-auto grid max-w-[1200px] lg:grid-cols-[0.58fr_0.42fr]">
          <div className="flex min-h-[420px] flex-col justify-end px-6 py-14 sm:px-10 lg:min-h-[560px] lg:px-14">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Event / {tenant.name}</p>
            <h1 className="mt-6 max-w-4xl font-display text-[clamp(2.8rem,6vw,5.4rem)] font-semibold leading-[0.97] tracking-[-0.055em]">{event.title}</h1>
            {event.summary && <p className="mt-7 max-w-2xl text-base leading-8 text-white/70">{event.summary}</p>}
            {(event.eventDate || event.venue) && <div className="mt-8 flex flex-wrap gap-5 border-t border-white/20 pt-6 text-xs font-semibold text-white/75">{event.eventDate && <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{event.eventDate}</span>}{event.venue && <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{event.venue}</span>}</div>}
          </div>
          <div className="relative min-h-[360px] bg-black/10 lg:min-h-[560px]">{event.coverImageUrl ? <Image unoptimized fill priority sizes="(max-width: 1024px) 100vw, 500px" src={event.coverImageUrl} alt="" className="object-cover" /> : <div className="absolute inset-0 grid place-items-center"><span className="font-display text-8xl font-semibold text-white/10">EVENT</span></div>}</div>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1200px] border-x border-black/10 lg:grid-cols-[0.25fr_0.75fr]">
        <aside className="border-b border-black/10 p-6 sm:p-10 lg:border-b-0 lg:border-r"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--site-accent)]">Event details</p></aside>
        <article className="min-h-[360px] p-6 sm:p-10 lg:p-14"><EventContentBlocks blocks={event.blocks} />{event.blocks.length === 0 && <p className="text-base leading-8 text-black/60">Contact {tenant.name} for more information about this event.</p>}</article>
      </section>
    </main>
    <footer className="bg-[#171c1a] px-5 py-8 text-white"><div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-3 text-xs text-white/45 sm:flex-row"><span>{tenant.name}</span><Link href="/" className="font-semibold text-white/70 hover:text-white">Visit institution website</Link></div></footer>
  </div>;
}
