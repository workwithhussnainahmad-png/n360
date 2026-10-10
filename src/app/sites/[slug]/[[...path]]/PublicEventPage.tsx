import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { publicEvents } from '@/db/schema';
import type { PublicInstitutionTenant } from '@/lib/institution-tenant';
import { EventPageContent } from '@/components/public-site/EventPageContent';

export function PublicEventPage({ tenant, event }: { tenant: PublicInstitutionTenant; event: typeof publicEvents.$inferSelect }) {
  const hasLogo = tenant.logoKey.startsWith('http') || tenant.logoKey.startsWith('/');
  return <div className="min-h-screen bg-[#f2efe7] text-[#171c1a]" style={{ '--site-accent': tenant.accentColor } as CSSProperties}>
    <header className="border-b border-black/10 bg-[#f2efe7]">
      <div className="mx-auto flex min-h-[76px] max-w-[1200px] items-center justify-between gap-5 px-5 sm:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">{hasLogo && <Image src={tenant.logoKey} alt="" width={40} height={40} className="h-10 w-10 border border-black/10 bg-white object-contain" />}<strong className="truncate font-display text-lg">{tenant.name}</strong></Link>
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-black/55 hover:text-black"><ArrowLeft className="h-4 w-4" />Back to website</Link>
      </div>
    </header>

    <main><EventPageContent event={event} institutionName={tenant.name} accent={tenant.design?.accent || tenant.accentColor} /></main>
    <footer className="bg-[#171c1a] px-5 py-8 text-white"><div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-3 text-xs text-white/45 sm:flex-row"><span>{tenant.name}</span><Link href="/" className="font-semibold text-white/70 hover:text-white">Visit institution website</Link></div></footer>
  </div>;
}
