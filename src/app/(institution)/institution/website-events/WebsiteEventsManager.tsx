'use client';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Copy, ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import { normalizePublicEventSlug, PUBLIC_EVENT_DURATION_LABELS } from '@/lib/public-events';
import { eventTemplate, newPublicBlockId } from '@/lib/public-site-builder';
import { publicEventContentSchema } from '@/lib/validators/public-event';
import { useEditorHistory } from '@/components/public-site/useEditorHistory';

import { eventListItem, type EventDraft, type EventListItem, type EventRecord } from './event-types';
const WebsiteEventEditor = lazy(() => import('./WebsiteEventEditor').then((module) => ({ default: module.WebsiteEventEditor })));

const field = 'mt-1 w-full rounded-lg border border-stone-200 bg-white p-2.5 text-sm outline-none focus:border-brand-500';
const blank = (): EventDraft => ({ id: null, title: '', slug: '', summary: '', coverImageUrl: '', eventDate: '', venue: '', blocks: [], design: {}, status: 'DRAFT', visibilityDuration: 'ONE_WEEK' });
function toDraft(event: EventRecord): EventDraft { return { id: event.id, title: event.title, slug: event.slug, summary: event.summary || '', coverImageUrl: event.coverImageUrl || '', eventDate: event.eventDate || '', venue: event.venue || '', blocks: event.blocks, design: event.design || {}, status: event.status, visibilityDuration: event.visibilityDuration }; }
function stateOf(event: Pick<EventRecord, 'status' | 'expiresAt'>) { return event.status !== 'PUBLISHED' ? 'Draft' : event.expiresAt && new Date(event.expiresAt) <= new Date() ? 'Expired' : 'Live'; }

export function WebsiteEventsManager({ institutionName, siteAccent = '#233c32', publicBaseUrl, publicSiteEnabled, readOnly = false, initialEvents }: { institutionName: string; siteAccent?: string; publicBaseUrl: string | null; publicSiteEnabled: boolean; readOnly?: boolean; initialEvents: EventListItem[] }) {
  const [events, setEvents] = useState(initialEvents);
  const history = useEditorHistory<EventDraft | null>(null);
  const { value: draft, setValue: setDraft } = history;
  const [saved, setSaved] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [startWithBlocks, setStartWithBlocks] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const loadedEvents = useRef(new Map<number, EventRecord>());
  const loadController = useRef<AbortController | null>(null);
  useEffect(() => () => loadController.current?.abort(), []);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [deleting, setDeleting] = useState<EventListItem | null>(null);
  const [discard, setDiscard] = useState(false);
  const dirty = useMemo(() => Boolean(draft && JSON.stringify(draft) !== saved), [draft, saved]);
  const filtered = useMemo(() => { const keyword = search.trim().toLowerCase(); return events.filter((event) => (filter === 'All' || stateOf(event) === filter) && (event.title + ' ' + event.slug).toLowerCase().includes(keyword)); }, [events, filter, search]);
  const lastPage = Math.max(1, Math.ceil(filtered.length / 12));
  const visiblePage = Math.min(page, lastPage);
  const visibleEvents = filtered.slice((visiblePage - 1) * 12, visiblePage * 12);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function open(value: EventDraft, isNew = false) {
    loadController.current?.abort(); loadController.current = null; setLoadingId(null);
    history.reset(value); setSaved(isNew ? '' : JSON.stringify(value)); setSlugTouched(Boolean(value.slug)); setStartWithBlocks(false); setMessage(null);
  }
  function cacheEvent(event: EventRecord) {
    loadedEvents.current.delete(event.id); loadedEvents.current.set(event.id, event);
    if (loadedEvents.current.size > 20) loadedEvents.current.delete(loadedEvents.current.keys().next().value!);
  }
  async function loadEvent(item: EventListItem, copy = false) {
    const cached = loadedEvents.current.get(item.id);
    if (cached?.updatedAt === item.updatedAt) { if (copy) duplicate(cached); else open(toDraft(cached)); return; }
    loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller; setLoadingId(item.id); setMessage(null);
    try {
      const { event } = await api.get<{ event: EventRecord }>('/api/institution/public-events/' + item.id, { signal: controller.signal });
      if (controller.signal.aborted) return;
      cacheEvent(event);
      if (copy) duplicate(event); else open(toDraft(event));
    } catch (error) { if (!controller.signal.aborted) setMessage({ error: true, text: error instanceof Error ? error.message : 'Unable to open this event. Please retry.' }); }
    finally { if (loadController.current === controller) { loadController.current = null; setLoadingId(null); } }
  }
  function duplicate(event: EventRecord) {
    const source = toDraft(event);
    let slug = normalizePublicEventSlug(event.slug.slice(0, 105) + '-copy');
    let n = 2;
    while (events.some((item) => item.slug === slug)) slug = normalizePublicEventSlug(event.slug.slice(0, 100) + '-copy-' + n++);
    open({ ...source, id: null, title: (event.title + ' (copy)').slice(0, 160), slug, status: 'DRAFT', blocks: source.blocks.map((b) => ({ ...structuredClone(b), id: newPublicBlockId() })) }, true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || readOnly || savingRef.current) return;
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') || 'SAVE';
    const { id } = draft;
    const content = { title: draft.title, slug: draft.slug, summary: draft.summary, coverImageUrl: draft.coverImageUrl, eventDate: draft.eventDate, venue: draft.venue, blocks: draft.blocks, design: draft.design, visibilityDuration: draft.visibilityDuration };
    const parsed = publicEventContentSchema.safeParse(content);
    if (!parsed.success) { setMessage({ error: true, text: parsed.error.issues.map((issue) => issue.path.join(' → ') + ': ' + issue.message).slice(0, 4).join('. ') }); return; }
    savingRef.current = true; setSaving(true); setMessage(null);
    try {
      const body = { ...parsed.data, action: id ? action : action === 'PUBLISH' ? 'PUBLISH' : 'SAVE_DRAFT' };
      const data = id ? await api.patch<{ event: EventRecord }>('/api/institution/public-events/' + id, body) : await api.post<{ event: EventRecord }>('/api/institution/public-events', body);
      cacheEvent(data.event);
      setEvents((current) => [eventListItem(data.event), ...current.filter((item) => item.id !== data.event.id)]);
      const next = toDraft(data.event); history.reset(next); setSaved(JSON.stringify(next));
      setMessage({ error: false, text: action === 'PUBLISH' ? 'Event published. Your page is ready to share.' : action === 'UNPUBLISH' ? 'Event moved to drafts.' : 'Event saved successfully.' });
    } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : 'Unable to save. Please try again.' }); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function deleteEvent() {
    if (!deleting || readOnly || savingRef.current) return;
    savingRef.current = true; setSaving(true); setMessage(null);
    try { await api.delete('/api/institution/public-events/' + deleting.id); setEvents((current) => current.filter((item) => item.id !== deleting.id)); loadedEvents.current.delete(deleting.id); setDeleting(null); }
    catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : 'Unable to delete event. Please try again.' }); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const feedback = message && <div role={message.error ? 'alert' : 'status'} className={'rounded-lg border p-3 text-sm ' + (message.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>{message.text}</div>;
  const confirmation = <><Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) { setDeleting(null); setMessage(null); } }}><DialogContent onInteractOutside={(e) => { if (saving) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }}><DialogTitle>Delete event?</DialogTitle><DialogDescription>“{deleting?.title}” will be permanently removed from your website and event library.</DialogDescription>{feedback}<DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button><Button type="button" disabled={saving} onClick={deleteEvent}>{saving ? 'Deleting…' : 'Delete event'}</Button></DialogFooter></DialogContent></Dialog><Dialog open={discard} onOpenChange={setDiscard}><DialogContent><DialogTitle>Leave without saving?</DialogTitle><DialogDescription>Your latest event edits have not been saved. Stay here to save them, or discard these changes.</DialogDescription><DialogFooter><Button type="button" variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button type="button" onClick={() => { history.reset(null); setDiscard(false); setMessage(null); }}>Discard changes</Button></DialogFooter></DialogContent></Dialog></>;
  if (!draft) {
    return <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-2xl font-semibold text-brand-950">Event studio</h1><p className="mt-2 text-sm text-stone-500">Create a memorable event page. Start from a template and make it yours.</p></div><div className="flex flex-wrap gap-2"><Link href="/institution/settings/public-website" prefetch={false}><Button variant="outline">Website designer</Button></Link><Button disabled={readOnly} onClick={() => open(blank(), true)}><Plus size={16} className="mr-2" />Blank event</Button></div></div>
      {(!publicBaseUrl || !publicSiteEnabled) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{!publicBaseUrl ? 'A public subdomain must be assigned before publishing.' : 'Your public website must be enabled before publishing events.'} You can design and save drafts now.</p>}
      <div className="grid gap-3 sm:grid-cols-3">{(['open-day', 'celebration', 'workshop'] as const).map((kind) => <button type="button" key={kind} className="rounded-xl border border-stone-200 bg-white p-5 text-left transition hover:border-brand-400 hover:bg-brand-50" disabled={readOnly} onClick={() => { const template = eventTemplate(kind); open({ ...blank(), ...template, slug: normalizePublicEventSlug(template.title) }, true); setStartWithBlocks(true); }}><span className="text-xs font-semibold uppercase tracking-widest text-brand-700">Start with a template</span><strong className="mt-3 block font-display text-lg">{kind === 'open-day' ? 'Campus open day' : kind === 'celebration' ? 'Annual celebration' : 'Workshop & seminar'}</strong><span className="mt-2 block text-xs leading-5 text-stone-500">Ready-made sections, schedule, and visitor information.</span></button>)}</div>
      <div className="flex flex-wrap gap-3"><label className="relative min-w-0 flex-1"><span className="sr-only">Search events</span><Search size={16} className="absolute left-3 top-3.5 text-stone-400" /><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search events…" className={field + ' !mt-0 !pl-9'} /></label><label><span className="sr-only">Event status</span><select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className={field + ' !mt-0'}>{['All', 'Live', 'Draft', 'Expired'].map((item) => <option key={item}>{item}</option>)}</select></label></div>
      {feedback}<div className="grid gap-3">{!filtered.length && <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-stone-500">{events.length ? 'No events match your search.' : 'Your first event starts here. Choose a template or a blank page.'}</p>}{visibleEvents.map((event) => <article key={event.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-display text-lg font-semibold">{event.title}</h2><span className="rounded-full bg-stone-100 px-2 py-1 text-xs">{stateOf(event)}</span></div><p className="mt-2 break-all text-xs text-stone-500">/event/{event.slug} · {event.blockCount} blocks · Visible for {PUBLIC_EVENT_DURATION_LABELS[event.visibilityDuration]}</p>{event.expiresAt && event.status === 'PUBLISHED' && <p className="mt-1 text-xs text-stone-500">Expires {new Date(event.expiresAt).toLocaleString()}</p>}</div><div className="flex flex-wrap gap-2">{stateOf(event) === 'Live' && publicBaseUrl && publicSiteEnabled && <a href={publicBaseUrl + '/event/' + event.slug} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 text-sm font-semibold text-brand-700"><ExternalLink size={14} />View</a>}<Button variant="outline" disabled={loadingId !== null} onClick={() => void loadEvent(event)}>{loadingId === event.id ? 'Opening…' : 'Edit page'}</Button><Button variant="outline" disabled={readOnly || loadingId !== null} onClick={() => void loadEvent(event, true)} aria-label={'Duplicate ' + event.title}><Copy size={16} /></Button><Button variant="outline" disabled={readOnly || loadingId !== null} onClick={() => { setDeleting(event); setMessage(null); }} aria-label={'Delete ' + event.title}><Trash2 size={16} /></Button></div></article>)}</div>{loadingId !== null && <p role="status" className="text-sm text-stone-500">Loading event page…</p>}{lastPage > 1 && <nav aria-label="Event library pages" className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-stone-500">Page {visiblePage} of {lastPage} · {filtered.length} events</p><div className="flex gap-2"><Button type="button" variant="outline" disabled={visiblePage === 1} onClick={() => setPage(visiblePage - 1)}>Previous</Button><Button type="button" variant="outline" disabled={visiblePage === lastPage} onClick={() => setPage(visiblePage + 1)}>Next</Button></div></nav>}{confirmation}
    </div>;
  }
  return <><Suspense fallback={<p role="status" className="p-6 text-sm text-stone-500">Opening event designer…</p>}><WebsiteEventEditor draft={draft} setDraft={setDraft} institutionName={institutionName} siteAccent={siteAccent} publicBaseUrl={publicBaseUrl} publicSiteEnabled={publicSiteEnabled} readOnly={readOnly} saving={saving} dirty={dirty} slugTouched={slugTouched} setSlugTouched={setSlugTouched} save={save} back={() => dirty ? setDiscard(true) : history.reset(null)} feedback={feedback} reportError={(text) => setMessage({ error: true, text })} canUndo={history.canUndo} canRedo={history.canRedo} undo={history.undo} redo={history.redo} startWithBlocks={startWithBlocks} /></Suspense>{confirmation}</>;
}
