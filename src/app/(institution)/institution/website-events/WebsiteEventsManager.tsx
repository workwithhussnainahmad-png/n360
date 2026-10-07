'use client';

import type { CSSProperties } from 'react';
import { useState, useCallback } from 'react';
import Image from 'next/image';
import { ArrowLeft, CalendarDays, ExternalLink, Eye, Heading2, ImageIcon, Info, Link2, ListPlus, MapPin, Plus, Save, Trash2, Type, LayoutTemplate, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { normalizePublicEventSlug, PUBLIC_EVENT_DURATION_LABELS, PUBLIC_EVENT_DURATIONS, type PublicEventBlock, type PublicEventDuration } from '@/lib/public-events';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { EventContentBlocks } from '@/components/public-site/EventContentBlocks';

import { ImageUploader } from './components/ImageUploader';
import { SortableBlockItem } from './components/SortableBlockItem';
import { BlockSettings } from './components/BlockSettings';

type EventRecord = {
  id: number; title: string; slug: string; summary: string | null; coverImageUrl: string | null; eventDate: string | null; venue: string | null;
  blocks: PublicEventBlock[]; status: 'DRAFT' | 'PUBLISHED'; visibilityDuration: PublicEventDuration; publishedAt: string | null; expiresAt: string | null; createdAt: string; updatedAt: string;
};
type EventDraft = Omit<EventRecord, 'id' | 'publishedAt' | 'expiresAt' | 'createdAt' | 'updatedAt'> & { id: number | null };

const inputClass = 'w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const emptyDraft = (): EventDraft => ({ id: null, title: '', slug: '', summary: '', coverImageUrl: '', eventDate: '', venue: '', blocks: [], status: 'DRAFT', visibilityDuration: 'ONE_WEEK' });
const blockId = () => globalThis.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function makeBlock(type: PublicEventBlock['type']): PublicEventBlock {
  const id = blockId();
  if (type === 'heading') return { id, type, text: '' };
  if (type === 'paragraph') return { id, type, text: '' };
  if (type === 'image') return { id, type, url: '', alt: '', caption: '' };
  if (type === 'callout') return { id, type, title: '', text: '' };
  if (type === 'schedule') return { id, type, time: '', title: '', description: '' };
  return { id, type, label: '', url: '' };
}

export function WebsiteEventsManager({ institutionName, publicBaseUrl, publicSiteEnabled, initialEvents }: { institutionName: string; publicBaseUrl: string | null; publicSiteEnabled: boolean; initialEvents: EventRecord[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Editor state
  const [activeTab, setActiveTab] = useState<'basics' | 'blocks'>('blocks');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const edit = useCallback((event: EventRecord) => { setDraft({ id: event.id, title: event.title, slug: event.slug, summary: event.summary || '', coverImageUrl: event.coverImageUrl || '', eventDate: event.eventDate || '', venue: event.venue || '', blocks: event.blocks || [], status: event.status, visibilityDuration: event.visibilityDuration }); setSlugTouched(true); setMessage(''); setActiveTab('basics'); setSelectedBlockId(null); }, []);
  
  const updateBlock = useCallback((updated: PublicEventBlock) => { 
    setDraft((current) => current ? ({ ...current, blocks: current.blocks.map((item) => item.id === updated.id ? updated : item) }) : current); 
  }, []);
  
  const removeBlock = useCallback((id: string) => {
    setDraft((current) => current ? ({ ...current, blocks: current.blocks.filter(b => b.id !== id) }) : current);
  }, []);
  
  const handleEditBlock = useCallback((id: string) => {
    setSelectedBlockId(id); setActiveTab('blocks');
  }, []);

  async function refresh() { const response = await fetch('/api/institution/public-events', { cache: 'no-store' }); const data = await response.json(); if (response.ok) setEvents(data.events); }

  const handleDragStart = useCallback((event: any) => { setActiveDragId(event.active.id); }, []);
  const handleDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setDraft((current) => {
        if (!current) return current;
        const oldIndex = current.blocks.findIndex(b => b.id === active.id);
        const newIndex = current.blocks.findIndex(b => b.id === over.id);
        const newBlocks = [...current.blocks];
        const [moved] = newBlocks.splice(oldIndex, 1);
        newBlocks.splice(newIndex, 0, moved);
        return { ...current, blocks: newBlocks };
      });
    }
    setActiveDragId(null);
  }, []);

  async function save(action: 'SAVE' | 'SAVE_DRAFT' | 'PUBLISH' | 'UNPUBLISH') {
    if (!draft) return;
    setSaving(true); setMessage('');
    try {
      const { id } = draft;
      const content = { title: draft.title, slug: draft.slug, summary: draft.summary, coverImageUrl: draft.coverImageUrl, eventDate: draft.eventDate, venue: draft.venue, blocks: draft.blocks, visibilityDuration: draft.visibilityDuration };
      const response = await fetch(id ? `/api/institution/public-events/${id}` : '/api/institution/public-events', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...content, action: id ? action : action === 'PUBLISH' ? 'PUBLISH' : 'SAVE_DRAFT' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save event');
      await refresh(); edit(data.event); setMessage(action === 'PUBLISH' ? 'Event published successfully.' : action === 'UNPUBLISH' ? 'Event unpublished.' : 'Event saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save event'); } finally { setSaving(false); }
  }

  async function removeEvent(event: EventRecord) { if (!window.confirm(`Delete “${event.title}”? This cannot be undone.`)) return; const response = await fetch(`/api/institution/public-events/${event.id}`, { method: 'DELETE' }); const data = await response.json(); if (!response.ok) return window.alert(data.error || 'Unable to delete event'); setEvents((current) => current.filter((item) => item.id !== event.id)); }

  if (!draft) return <div className="space-y-7 animate-fade-in"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Public website</p><h1 className="mt-2 font-display text-3xl font-bold text-brand-950">Events</h1><p className="mt-1 text-stone-500">Create visual event pages for {institutionName}. Published events appear automatically on the website.</p></div><Button onClick={() => { setDraft(emptyDraft()); setSlugTouched(false); setActiveTab('basics'); }}><Plus className="mr-2 h-4 w-4" />Create event</Button></div>
    {!publicBaseUrl && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">A public subdomain must be assigned before events can be published.</div>}
    <div className="grid gap-4">{events.length === 0 && <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-stone-400" /><h2 className="mt-4 font-display text-xl font-semibold">No events yet</h2><p className="mt-2 text-sm text-stone-500">Create a draft, design its page, and publish it when ready.</p></div>}{events.map((event) => { const expired = Boolean(event.expiresAt && new Date(event.expiresAt) <= new Date()); const live = event.status === 'PUBLISHED' && !expired; return <article key={event.id} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-semibold text-brand-950">{event.title}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${live ? 'bg-emerald-50 text-emerald-700' : expired ? 'bg-amber-50 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>{live ? 'Live' : expired ? 'Expired' : 'Draft'}</span></div><p className="mt-2 text-sm text-stone-500">/{event.slug} · Visible for {PUBLIC_EVENT_DURATION_LABELS[event.visibilityDuration]}{event.expiresAt ? ` · Expires ${new Date(event.expiresAt).toLocaleString()}` : ''}</p></div><div className="flex flex-wrap gap-2">{live && publicBaseUrl && <a href={`${publicBaseUrl}/event/${event.slug}`} target="_blank" rel="noopener noreferrer"><Button type="button" variant="outline"><ExternalLink className="mr-2 h-4 w-4" />View</Button></a>}<Button type="button" variant="outline" onClick={() => edit(event)}>Edit</Button><Button type="button" variant="outline" onClick={() => void removeEvent(event)}><Trash2 className="h-4 w-4" /></Button></div></article>; })}</div>
  </div>;

  const activeBlock = draft.blocks.find(b => b.id === selectedBlockId);
  const blurDataURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  return <div className="absolute inset-0 bg-stone-100 z-50 flex flex-col animate-in fade-in duration-300">
    <header className="h-16 flex-shrink-0 bg-white border-b border-stone-200 px-6 flex items-center justify-between shadow-sm z-10">
      <div className="flex items-center gap-6">
        <button type="button" onClick={() => setDraft(null)} className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-stone-900 transition-colors"><ArrowLeft className="h-4 w-4" />Back</button>
        <div className="h-6 w-px bg-stone-200" />
        <h1 className="font-display text-xl font-bold text-brand-950 truncate max-w-sm">{draft.title || 'Untitled Event'}</h1>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-stone-100 text-stone-500">{draft.status}</span>
      </div>
      <div className="flex items-center gap-3">
        {message && <span className="text-sm font-medium text-brand-600 animate-pulse mr-4">{message}</span>}
        {draft.id && draft.status === 'PUBLISHED' && <Button variant="outline" size="sm" disabled={saving} onClick={() => void save('UNPUBLISH')}>Unpublish</Button>}
        <Button variant="outline" size="sm" disabled={saving} onClick={() => void save(draft.id ? 'SAVE' : 'SAVE_DRAFT')}><Save className="mr-2 h-4 w-4" />Save</Button>
        <Button size="sm" disabled={saving || !publicBaseUrl || !publicSiteEnabled} onClick={() => void save('PUBLISH')}><Eye className="mr-2 h-4 w-4" />{draft.status === 'PUBLISHED' ? 'Update Live Site' : 'Publish to Site'}</Button>
      </div>
    </header>

    <div className="flex-1 flex overflow-hidden">
      <aside className="w-80 flex-shrink-0 bg-white border-r border-stone-200 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
        <div className="flex border-b border-stone-200">
          <button className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'blocks' && !activeBlock ? 'border-b-2 border-brand-500 text-brand-600' : 'text-stone-500 hover:bg-stone-50'}`} onClick={() => { setActiveTab('blocks'); setSelectedBlockId(null); }}><LayoutTemplate className="inline mr-2 h-3.5 w-3.5" />Blocks</button>
          <button className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'basics' && !activeBlock ? 'border-b-2 border-brand-500 text-brand-600' : 'text-stone-500 hover:bg-stone-50'}`} onClick={() => { setActiveTab('basics'); setSelectedBlockId(null); }}><Settings2 className="inline mr-2 h-3.5 w-3.5" />Basics</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {activeBlock ? (
             <BlockSettings block={activeBlock} update={updateBlock} />
          ) : activeTab === 'basics' ? (
             <div className="space-y-6 animate-in slide-in-from-left-2 duration-200">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-stone-700">Event title<input value={draft.title} onChange={(event) => { const title = event.target.value; setDraft((current) => current ? ({ ...current, title, slug: slugTouched ? current.slug : normalizePublicEventSlug(title) }) : current); }} maxLength={160} placeholder="Annual Science Fair" className={`${inputClass} mt-1`} /></label>
                <label className="block text-sm font-medium text-stone-700">Event URL<div className="mt-1 flex items-center rounded-lg border border-stone-200 bg-stone-50 focus-within:border-brand-500"><span className="shrink-0 pl-3 text-xs text-stone-400">/event/</span><input value={draft.slug} onChange={(event) => { setSlugTouched(true); setDraft((current) => current ? ({ ...current, slug: normalizePublicEventSlug(event.target.value) }) : current); }} maxLength={120} className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm outline-none" /></div></label>
                <label className="block text-sm font-medium text-stone-700">Short summary<textarea value={draft.summary || ''} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} maxLength={500} rows={3} placeholder="A short introduction used on the homepage event card." className={`${inputClass} mt-1 resize-y`} /></label>
                <label className="block text-sm font-medium text-stone-700">Date and time<input value={draft.eventDate || ''} onChange={(event) => setDraft({ ...draft, eventDate: event.target.value })} maxLength={120} placeholder="Saturday, 10:00 AM" className={`${inputClass} mt-1`} /></label>
                <label className="block text-sm font-medium text-stone-700">Venue<input value={draft.venue || ''} onChange={(event) => setDraft({ ...draft, venue: event.target.value })} maxLength={200} placeholder="Main Campus" className={`${inputClass} mt-1`} /></label>
                <div><span className="mb-2 block text-sm font-medium text-stone-700">Cover image</span><ImageUploader value={draft.coverImageUrl || ''} onChange={(coverImageUrl) => setDraft({ ...draft, coverImageUrl })} label="cover image" /></div>
                <label className="block text-sm font-medium text-stone-700">Keep event published for<select value={draft.visibilityDuration} onChange={(event) => setDraft({ ...draft, visibilityDuration: event.target.value as PublicEventDuration })} className={`${inputClass} mt-1`}>{PUBLIC_EVENT_DURATIONS.map((duration) => <option key={duration} value={duration}>{PUBLIC_EVENT_DURATION_LABELS[duration]}</option>)}</select></label>
              </div>
             </div>
          ) : (
             <div className="space-y-5 animate-in slide-in-from-left-2 duration-200">
               <div>
                 <h3 className="text-sm font-bold text-stone-900 mb-3">Add Content Block</h3>
                 <div className="grid grid-cols-2 gap-2">
                   {([{ type: 'heading', label: 'Heading', icon: Heading2 }, { type: 'paragraph', label: 'Text', icon: Type }, { type: 'image', label: 'Image', icon: ImageIcon }, { type: 'callout', label: 'Highlight', icon: Info }, { type: 'schedule', label: 'Schedule', icon: ListPlus }, { type: 'button', label: 'Button', icon: Link2 }] as const).map((item) => (
                     <button key={item.type} type="button" disabled={draft.blocks.length >= 40} onClick={() => { const newBlock = makeBlock(item.type); setDraft({ ...draft, blocks: [...draft.blocks, newBlock] }); setSelectedBlockId(newBlock.id); }} className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-stone-200 bg-white hover:border-brand-300 hover:bg-brand-50 transition-colors text-stone-600 hover:text-brand-700 disabled:opacity-50">
                       <item.icon className="h-6 w-6 stroke-[1.5]" />
                       <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
                     </button>
                   ))}
                 </div>
               </div>
             </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[url('/grid.svg')] bg-center p-8 lg:p-12" onClick={(e) => { if (e.target === e.currentTarget) setSelectedBlockId(null); }}>
        <div className="mx-auto max-w-4xl bg-[#f2efe7] shadow-2xl ring-1 ring-stone-900/5 min-h-[80vh] transition-all" style={{ '--site-accent': '#233c32' } as CSSProperties}>
          <div className="relative aspect-[16/6] bg-[#d9d4c9] group">
            {draft.coverImageUrl ? <Image placeholder="blur" blurDataURL={blurDataURL} unoptimized fill sizes="1000px" src={draft.coverImageUrl} alt="" className="object-cover" /> : <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-stone-400">Cover image will appear here</div>}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <Button type="button" variant="outline" className="opacity-0 group-hover:opacity-100 transition-opacity translate-y-4 group-hover:translate-y-0" onClick={() => { setActiveTab('basics'); setSelectedBlockId(null); }}><ImageIcon className="mr-2 h-4 w-4" /> Change Cover Image</Button>
            </div>
          </div>
          
          <div className="bg-[var(--site-accent)] p-8 md:p-12 text-white relative group cursor-pointer" onClick={() => { setActiveTab('basics'); setSelectedBlockId(null); }}>
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-white/20 transition-colors" />
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Event / {institutionName}</p>
            <h2 className="mt-4 font-display text-4xl md:text-5xl font-semibold tracking-[-0.04em] leading-tight">{draft.title || 'Your event title'}</h2>
            {draft.summary && <p className="mt-4 text-base md:text-lg leading-relaxed text-white/75 max-w-3xl">{draft.summary}</p>}
            <div className="mt-6 flex flex-wrap gap-4 text-sm font-medium text-white/80">
              {draft.eventDate && <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-white/50" />{draft.eventDate}</span>}
              {draft.venue && <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-white/50" />{draft.venue}</span>}
            </div>
          </div>

          <div className="p-8 md:p-12 min-h-[300px]">
            {draft.blocks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-stone-300 rounded-2xl">
                <LayoutTemplate className="h-12 w-12 text-stone-300 mb-4" />
                <h3 className="text-xl font-display font-semibold text-stone-600">Canvas is empty</h3>
                <p className="mt-2 text-stone-500 max-w-sm">Drag and drop blocks from the sidebar or click to add them here.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={draft.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                  {draft.blocks.map((block) => (
                    <SortableBlockItem 
                      key={block.id} 
                      block={block} 
                      activeId={selectedBlockId} 
                      onEdit={handleEditBlock} 
                      onRemove={removeBlock} 
                    />
                  ))}
                </SortableContext>
                <DragOverlay>
                  {activeDragId ? (
                    <div className="opacity-80 scale-105 rotate-2 shadow-2xl bg-white p-4 border border-brand-200 rounded-lg pointer-events-none">
                      <EventContentBlocks blocks={[draft.blocks.find(b => b.id === activeDragId)!]} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </main>
    </div>
  </div>;
}
