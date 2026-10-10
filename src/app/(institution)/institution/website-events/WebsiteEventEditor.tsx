'use client';
import { useCallback, useDeferredValue, useEffect, useRef, useState, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { arrayMove } from '@dnd-kit/sortable';
import { ArrowLeft, Eye, LayoutTemplate, Plus, Redo2, Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { normalizePublicEventSlug, PUBLIC_EVENT_DURATION_LABELS, PUBLIC_EVENT_DURATIONS, type PublicEventBlock, type PublicEventDuration } from '@/lib/public-events';
import { BLOCK_LABELS, makePublicBlock, newPublicBlockId } from '@/lib/public-site-builder';
import { BlockSettings } from '@/components/public-site/BlockSettings';
import { EventPageContent } from '@/components/public-site/EventPageContent';
import { ImageUploader } from '@/components/public-site/ImageUploader';
import { PageDesignControls } from '@/components/public-site/PageDesignControls';
import { ResponsivePreview } from '@/components/public-site/ResponsivePreview';
import { EventCanvas } from './EventCanvas';
import type { EventDraft } from './event-types';
import styles from './event-editor.module.css';

const field = 'mt-1 w-full rounded-lg border border-stone-200 bg-white p-2.5 text-sm outline-none focus:border-brand-500';
export function WebsiteEventEditor({ draft, setDraft, institutionName, siteAccent, publicBaseUrl, publicSiteEnabled, readOnly, saving, dirty, slugTouched, setSlugTouched, save, back, feedback, reportError, canUndo, canRedo, undo, redo, startWithBlocks }: {
  draft: EventDraft; setDraft: (value: SetStateAction<EventDraft | null>) => void; institutionName: string; siteAccent: string;
  publicBaseUrl: string | null; publicSiteEnabled: boolean; readOnly: boolean; saving: boolean; dirty: boolean;
  slugTouched: boolean; setSlugTouched: (value: boolean) => void; save: (event: FormEvent<HTMLFormElement>) => void; back: () => void;
  feedback: ReactNode; reportError: (message: string) => void; canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void; startWithBlocks: boolean;
}) {
  const [tab, setTab] = useState<'basics' | 'blocks' | 'design'>(startWithBlocks ? 'blocks' : 'basics');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const previewDraft = useDeferredValue(draft);
  const formRef = useRef<HTMLFormElement>(null);
  const disabled = saving || readOnly;
  const selected = draft.blocks.find((block) => block.id === selectedId);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const background = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== formRef.current && !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName));
    const inert = background.map((node) => node.inert);
    background.forEach((node) => { node.inert = true; });
    document.body.style.overflow = 'hidden';
    return () => {
      background.forEach((node, index) => { node.inert = inert[index]; });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  const select = useCallback((id: string) => { setSelectedId(id); setTab('blocks'); setPreview(false); }, []);
  const reorder = useCallback((blocks: PublicEventBlock[]) => setDraft((current) => current ? { ...current, blocks } : current), [setDraft]);
  const move = useCallback((id: string, offset: number) => setDraft((current) => {
    if (!current) return current;
    const from = current.blocks.findIndex((block) => block.id === id), to = from + offset;
    return from >= 0 && to >= 0 && to < current.blocks.length ? { ...current, blocks: arrayMove(current.blocks, from, to) } : current;
  }), [setDraft]);
  const duplicate = useCallback((id: string) => {
    const copyId = newPublicBlockId();
    setDraft((current) => {
      if (!current || current.blocks.length >= 40) return current;
      const index = current.blocks.findIndex((block) => block.id === id);
      if (index < 0) return current;
      const copy = { ...structuredClone(current.blocks[index]), id: copyId };
      return { ...current, blocks: [...current.blocks.slice(0, index + 1), copy, ...current.blocks.slice(index + 1)] };
    });
    select(copyId);
  }, [setDraft, select]);
  const remove = useCallback((id: string) => setDraft((current) => current ? { ...current, blocks: current.blocks.filter((block) => block.id !== id) } : current), [setDraft]);
  const updateBlock = useCallback((block: PublicEventBlock) => setDraft((current) => current ? { ...current, blocks: current.blocks.map((item) => item.id === block.id ? block : item) } : current), [setDraft]);
  function invalid(event: FormEvent<HTMLInputElement>) {
    event.preventDefault(); setTab('basics');
    reportError(event.currentTarget.validationMessage || 'Enter an event title and a valid event URL.');
  }
  return createPortal(<form ref={formRef} onSubmit={save} className={styles.editor} aria-label="Event page designer">
    <header className={styles.header}>
      <div className="min-w-0"><button type="button" disabled={saving} onClick={back} className="mb-1 inline-flex items-center gap-2 text-xs font-semibold text-stone-500"><ArrowLeft size={14} />All events</button><h1 className="max-w-sm truncate font-display text-xl font-semibold">{draft.title || 'Untitled event'}</h1><p className="mt-1 text-xs text-stone-500">{dirty ? 'Unsaved changes' : 'All changes saved'} · {draft.status === 'PUBLISHED' ? 'Published' : 'Draft'}</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" aria-label="Undo" disabled={disabled || !canUndo} onClick={undo}><Undo2 size={16} /></Button><Button type="button" variant="outline" size="sm" aria-label="Redo" disabled={disabled || !canRedo} onClick={redo}><Redo2 size={16} /></Button><Button type="button" variant="outline" size="sm" aria-pressed={preview} onClick={() => setPreview((current) => !current)}><Eye size={15} className="mr-1" />{preview ? 'Back to canvas' : 'Preview'}</Button>{draft.id && draft.status === 'PUBLISHED' && <Button type="submit" name="action" value="UNPUBLISH" variant="outline" size="sm" disabled={disabled}>Unpublish</Button>}<Button type="submit" name="action" value="SAVE" variant="outline" size="sm" disabled={disabled}><Save size={15} className="mr-1" />{saving ? 'Saving…' : 'Save'}</Button><Button type="submit" name="action" value="PUBLISH" size="sm" disabled={disabled || !publicBaseUrl || !publicSiteEnabled}>{draft.status === 'PUBLISHED' ? 'Update live page' : 'Publish to site'}</Button></div>
    </header>
    <div className={styles.workspace}>
      <aside className={styles.sidebar} aria-label="Event settings sidebar">
        <nav className={styles.tabs} aria-label="Event editor">{(['blocks', 'basics', 'design'] as const).map((item) => <button type="button" key={item} aria-pressed={tab === item} onClick={() => { setTab(item); setSelectedId(null); }}>{item === 'basics' ? 'Basics' : item === 'blocks' ? 'Blocks' : 'Design'}</button>)}</nav>
        <div className="space-y-4 p-5">{feedback}{readOnly && <p className="text-sm text-amber-900">Switch to your editable main workspace to change the website.</p>}
          <fieldset disabled={disabled} className="min-w-0">
            <div hidden={tab !== 'basics'} className="space-y-4">
              <label className="block text-sm font-medium">Event title<input required value={draft.title} maxLength={160} className={field} placeholder="Annual science fair" onInvalid={invalid} onChange={(event) => { const title = event.target.value; setDraft((current) => current ? { ...current, title, slug: slugTouched ? current.slug : normalizePublicEventSlug(title) } : current); }} /></label>
              <label className="block text-sm font-medium">Event URL<input required value={draft.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} className={field} onInvalid={invalid} onChange={(event) => { setSlugTouched(true); const slug = event.target.value.toLowerCase(); setDraft((current) => current ? { ...current, slug } : current); }} /><span className="mt-1 block break-all text-xs text-stone-500">{publicBaseUrl}/event/{draft.slug || 'your-event'}</span></label>
              <label className="block text-sm font-medium">Short introduction<textarea value={draft.summary || ''} maxLength={500} rows={3} className={field} onChange={(event) => { const summary = event.target.value; setDraft((current) => current ? { ...current, summary } : current); }} /></label>
              <label className="block text-sm font-medium">Date and time<input value={draft.eventDate || ''} maxLength={120} className={field} onChange={(event) => { const eventDate = event.target.value; setDraft((current) => current ? { ...current, eventDate } : current); }} /></label>
              <label className="block text-sm font-medium">Venue<input value={draft.venue || ''} maxLength={200} className={field} onChange={(event) => { const venue = event.target.value; setDraft((current) => current ? { ...current, venue } : current); }} /></label>
              <ImageUploader value={draft.coverImageUrl || ''} label="cover photo" onChange={(coverImageUrl) => setDraft((current) => current ? { ...current, coverImageUrl } : current)} />
              <label className="block text-sm font-medium">Visibility after publishing<select value={draft.visibilityDuration} className={field} onChange={(event) => { const visibilityDuration = event.target.value as PublicEventDuration; setDraft((current) => current ? { ...current, visibilityDuration } : current); }}>{PUBLIC_EVENT_DURATIONS.map((duration) => <option key={duration} value={duration}>{PUBLIC_EVENT_DURATION_LABELS[duration]}</option>)}</select></label>
              <p className="text-xs leading-5 text-stone-500">Publishing starts a new visibility period. Saving keeps the current expiry.</p>
            </div>
            {tab === 'blocks' && <div className="space-y-4">{selected ? <><button type="button" onClick={() => setSelectedId(null)} className="flex items-center gap-1 text-xs font-semibold text-brand-700"><ArrowLeft size={14} />All blocks</button><BlockSettings block={selected} update={updateBlock} /></> : <><div><h2 className="text-sm font-semibold">Add content block</h2><p className="mt-1 text-xs leading-5 text-stone-500">Click a block on the canvas to edit it. Drag its handle to change the order.</p></div><div className="grid grid-cols-2 gap-2">{(Object.keys(BLOCK_LABELS) as PublicEventBlock['type'][]).map((type) => <button type="button" key={type} disabled={draft.blocks.length >= 40} onClick={() => { const block = makePublicBlock(type); setDraft((current) => current && current.blocks.length < 40 ? { ...current, blocks: [...current.blocks, block] } : current); select(block.id); }} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white p-3 text-center text-xs font-semibold text-stone-600 hover:border-brand-400 hover:bg-brand-50 disabled:opacity-40"><Plus size={20} />{BLOCK_LABELS[type]}</button>)}</div><p className="text-xs text-stone-500">{draft.blocks.length}/40 blocks</p></>}</div>}
            {tab === 'design' && <PageDesignControls compact fallbackAccent={siteAccent} value={draft.design || {}} onChange={(design) => setDraft((current) => current ? { ...current, design } : current)} />}
          </fieldset>
        </div>
      </aside>
      <main className={styles.stage} aria-label={preview ? 'Event preview' : 'Event canvas'}>
        {preview ? <ResponsivePreview title="Event page preview"><EventPageContent event={previewDraft} institutionName={institutionName} accent={siteAccent} /></ResponsivePreview> : <>
          <div className="mx-auto mb-3 flex max-w-5xl flex-wrap items-center justify-between gap-2 text-xs text-stone-500"><span>Live canvas · click a block to edit</span><button type="button" onClick={() => { setTab('basics'); setSelectedId(null); }}>Edit event details</button></div>
          <div className={styles.paper}><EventPageContent event={draft} institutionName={institutionName} accent={siteAccent} content={draft.blocks.length ? <EventCanvas blocks={draft.blocks} selectedId={selectedId} disabled={disabled} select={select} move={move} duplicate={duplicate} remove={remove} reorder={reorder} /> : <div className="rounded-xl border-2 border-dashed border-stone-300 p-8 text-center"><LayoutTemplate size={32} className="mx-auto text-stone-400" /><h2 className="mt-3 font-display text-xl">Canvas is empty</h2><p className="mt-2 text-sm text-stone-500">Choose Blocks in the sidebar to start designing your page.</p></div>} /></div>
        </>}
      </main>
    </div>
  </form>, document.body);
}
