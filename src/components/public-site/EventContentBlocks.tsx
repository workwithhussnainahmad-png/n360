import Image from 'next/image';
import { Clock3 } from 'lucide-react';
import type { PublicEventBlock } from '@/lib/public-events';

export function EventContentBlocks({ blocks }: { blocks: PublicEventBlock[] }) {
  return <div className="space-y-7">
    {blocks.map((block) => {
      if (block.type === 'heading') return block.text ? <h2 key={block.id} className="pt-3 font-display text-2xl font-semibold tracking-[-0.035em] text-[#171c1a] sm:text-3xl">{block.text}</h2> : null;
      if (block.type === 'paragraph') return block.text ? <p key={block.id} className="whitespace-pre-line text-base leading-8 text-black/65">{block.text}</p> : null;
      if (block.type === 'image') return block.url ? <figure key={block.id} className="overflow-hidden border border-black/10 bg-[#e9e5dc]"><div className="relative aspect-[16/9]"><Image unoptimized fill sizes="(max-width: 1024px) 100vw, 900px" src={block.url} alt={block.alt || ''} className="object-cover" /></div>{block.caption && <figcaption className="border-t border-black/10 bg-white px-4 py-3 text-xs text-black/50">{block.caption}</figcaption>}</figure> : null;
      if (block.type === 'callout') return (block.title || block.text) ? <aside key={block.id} className="border-l-4 border-[var(--site-accent)] bg-[#e9e5dc] p-5 sm:p-6">{block.title && <h3 className="font-display text-xl font-semibold">{block.title}</h3>}{block.text && <p className="mt-2 whitespace-pre-line text-sm leading-7 text-black/60">{block.text}</p>}</aside> : null;
      if (block.type === 'schedule') return (block.time || block.title || block.description) ? <div key={block.id} className="grid gap-3 border-t border-black/10 pt-5 sm:grid-cols-[150px_1fr]"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--site-accent)]"><Clock3 className="h-4 w-4" />{block.time || 'Schedule'}</span><div>{block.title && <h3 className="font-display text-lg font-semibold">{block.title}</h3>}{block.description && <p className="mt-2 whitespace-pre-line text-sm leading-7 text-black/55">{block.description}</p>}</div></div> : null;
      if (block.type === 'button') return block.label && block.url ? <div key={block.id}><a href={block.url} className="inline-flex min-h-11 items-center justify-center bg-[#171c1a] px-6 py-3 text-xs font-bold text-white transition-colors hover:bg-[var(--site-accent)]">{block.label}</a></div> : null;
      return null;
    })}
  </div>;
}
