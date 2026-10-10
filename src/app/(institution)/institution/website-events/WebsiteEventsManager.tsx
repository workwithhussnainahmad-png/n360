'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Copy, ExternalLink, Eye, Plus, Redo2, Save, Search, Trash2, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import { normalizePublicEventSlug, PUBLIC_EVENT_DURATION_LABELS, PUBLIC_EVENT_DURATIONS, type PublicEventBlock, type PublicEventDuration } from '@/lib/public-events';
import { eventTemplate, newPublicBlockId, type PageDesign } from '@/lib/public-site-builder';
import { publicEventContentSchema } from '@/lib/validators/public-event';
import { EventPageContent } from '@/components/public-site/EventPageContent';
import { BlockComposer } from '@/components/public-site/BlockComposer';
import { ImageUploader } from '@/components/public-site/ImageUploader';
import { PageDesignControls } from '@/components/public-site/PageDesignControls';
import { ResponsivePreview } from '@/components/public-site/ResponsivePreview';
import { useEditorHistory } from '@/components/public-site/useEditorHistory';

type EventRecord = {
  id: number; title: string; slug: string; summary: string | null; coverImageUrl: string | null; eventDate: string | null; venue: string | null;
  blocks: PublicEventBlock[]; design?: PageDesign; status: 'DRAFT' | 'PUBLISHED'; visibilityDuration: PublicEventDuration; publishedAt: string | null; expiresAt: string | null; createdAt: string; updatedAt: string;
};
type EventDraft = Omit<EventRecord, 'id' | 'publishedAt' | 'expiresAt' | 'createdAt' | 'updatedAt'> & { id: number | null };
const field = 'mt-1 w-full rounded-lg border border-stone-200 bg-white p-2.5 text-sm outline-none focus:border-brand-500';
const blank = (): EventDraft => ({ id: null, title: '', slug: '', summary: '', coverImageUrl: '', eventDate: '', venue: '', blocks: [], design: {}, status: 'DRAFT', visibilityDuration: 'ONE_WEEK' });
function toDraft(event: EventRecord): EventDraft { return { id: event.id, title: event.title, slug: event.slug, summary: event.summary || '', coverImageUrl: event.coverImageUrl || '', eventDate: event.eventDate || '', venue: event.venue || '', blocks: event.blocks, design: event.design || {}, status: event.status, visibilityDuration: event.visibilityDuration }; }
function stateOf(event: EventRecord) { return event.status !== 'PUBLISHED' ? 'Draft' : event.expiresAt && new Date(event.expiresAt) <= new Date() ? 'Expired' : 'Live'; }

export function WebsiteEventsManager({ institutionName, siteAccent = '#233c32', publicBaseUrl, publicSiteEnabled, initialEvents }: { institutionName: string; siteAccent?: string; publicBaseUrl: string | null; publicSiteEnabled: boolean; initialEvents: EventRecord[] }) {
  const [events, setEvents] = useState(initialEvents);
  const history = useEditorHistory<EventDraft | null>(null);
  const { value: draft, setValue: setDraft } = history;
  const [saved, setSaved] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [tab, setTab] = useState<'content' | 'details' | 'design' | 'preview'>('details');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [deleting, setDeleting] = useState<EventRecord | null>(null);
  const [discard, setDiscard] = useState(false);
  const dirty = Boolean(draft && JSON.stringify(draft) !== saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function open(value: EventDraft, isNew = false) { history.reset(value); setSaved(isNew ? '' : JSON.stringify(value)); setSlugTouched(Boolean(value.slug)); setTab('details'); setMessage(null); }
  function duplicate(event: EventRecord) {
    const source = toDraft(event);
    let slug = normalizePublicEventSlug(event.slug.slice(0, 105) + '-copy');
    let n = 2;
    while (events.some((item) => item.slug === slug)) slug = normalizePublicEventSlug(event.slug.slice(0, 100) + '-copy-' + n++);
    open({ ...source, id: null, title: (event.title + ' (copy)').slice(0, 160), slug, status: 'DRAFT', blocks: source.blocks.map((b) => ({ ...structuredClone(b), id: newPublicBlockId() })) }, true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || savingRef.current) return;
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') || 'SAVE';
    const { id } = draft;
    const content = { title: draft.title, slug: draft.slug, summary: draft.summary, coverImageUrl: draft.coverImageUrl, eventDate: draft.eventDate, venue: draft.venue, blocks: draft.blocks, design: draft.design, visibilityDuration: draft.visibilityDuration };
    const parsed = publicEventContentSchema.safeParse(content);
    if (!parsed.success) { setMessage({ error: true, text: parsed.error.issues.map((issue) => issue.path.join(' → ') + ': ' + issue.message).slice(0, 4).join('. ') }); return; }
    savingRef.current = true; setSaving(true); setMessage(null);
    try {
      const body = { ...parsed.data, action: id ? action : action === 'PUBLISH' ? 'PUBLISH' : 'SAVE_DRAFT' };
      const data = id ? await api.patch<{ event: EventRecord }>('/api/institution/public-events/' + id, body) : await api.post<{ event: EventRecord }>('/api/institution/public-events', body);
      setEvents((current) => [data.event, ...current.filter((item) => item.id !== data.event.id)]);
      const next = toDraft(data.event); history.reset(next); setSaved(JSON.stringify(next));
      setMessage({ error: false, text: action === 'PUBLISH' ? 'Event published. Your page is ready to share.' : action === 'UNPUBLISH' ? 'Event moved to drafts.' : 'Event saved successfully.' });
    } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : 'Unable to save. Please try again.' }); }
    finally { savingRef.current = false; setSaving(false); }
  }
  async function deleteEvent() {
    if (!deleting || savingRef.current) return;
    savingRef.current = true; setSaving(true); setMessage(null);
    try { await api.delete('/api/institution/public-events/' + deleting.id); setEvents((current) => current.filter((item) => item.id !== deleting.id)); setDeleting(null); }
    catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : 'Unable to delete event. Please try again.' }); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const feedback = message && <div role={message.error ? 'alert' : 'status'} className={'rounded-lg border p-3 text-sm ' + (message.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>{message.text}</div>;
  const confirmation = <><Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) { setDeleting(null); setMessage(null); } }}><DialogContent onInteractOutside={(e) => { if (saving) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (saving) e.preventDefault(); }}><DialogTitle>Delete event?</DialogTitle><DialogDescription>“{deleting?.title}” will be permanently removed from your website and event library.</DialogDescription>{feedback}<DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button><Button type="button" disabled={saving} onClick={deleteEvent}>{saving ? 'Deleting…' : 'Delete event'}</Button></DialogFooter></DialogContent></Dialog><Dialog open={discard} onOpenChange={setDiscard}><DialogContent><DialogTitle>Leave without saving?</DialogTitle><DialogDescription>Your latest event edits have not been saved. Stay here to save them, or discard these changes.</DialogDescription><DialogFooter><Button type="button" variant="outline" onClick={() => setDiscard(false)}>Keep editing</Button><Button type="button" onClick={() => { history.reset(null); setDiscard(false); setMessage(null); }}>Discard changes</Button></DialogFooter></DialogContent></Dialog></>;
  if (!draft) {
    const filtered = events.filter((event) => (filter === 'All' || stateOf(event) === filter) && (event.title + ' ' + event.slug).toLowerCase().includes(search.toLowerCase()));
    return <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-2xl font-semibold text-brand-950">Event studio</h1><p className="mt-2 text-sm text-stone-500">Create a memorable event page. Start from a template and make it yours.</p></div><div className="flex flex-wrap gap-2"><Link href="/institution/settings/public-website"><Button variant="outline">Website designer</Button></Link><Button onClick={() => open(blank(), true)}><Plus size={16} className="mr-2" />Blank event</Button></div></div>
      {(!publicBaseUrl || !publicSiteEnabled) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{!publicBaseUrl ? 'A public subdomain must be assigned before publishing.' : 'Your public website must be enabled before publishing events.'} You can design and save drafts now.</p>}
      <div className="grid gap-3 sm:grid-cols-3">{(['open-day', 'celebration', 'workshop'] as const).map((kind) => <button type="button" key={kind} className="rounded-xl border border-stone-200 bg-white p-5 text-left transition hover:border-brand-400 hover:bg-brand-50" onClick={() => { const template = eventTemplate(kind); open({ ...blank(), ...template, slug: normalizePublicEventSlug(template.title) }, true); setTab('content'); }}><span className="text-xs font-semibold uppercase tracking-widest text-brand-700">Start with a template</span><strong className="mt-3 block font-display text-lg">{kind === 'open-day' ? 'Campus open day' : kind === 'celebration' ? 'Annual celebration' : 'Workshop & seminar'}</strong><span className="mt-2 block text-xs leading-5 text-stone-500">Ready-made sections, schedule, and visitor information.</span></button>)}</div>
      <div className="flex flex-wrap gap-3"><label className="relative min-w-0 flex-1"><span className="sr-only">Search events</span><Search size={16} className="absolute left-3 top-3.5 text-stone-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events…" className={field + ' !mt-0 !pl-9'} /></label><label><span className="sr-only">Event status</span><select value={filter} onChange={(e) => setFilter(e.target.value)} className={field + ' !mt-0'}>{['All', 'Live', 'Draft', 'Expired'].map((item) => <option key={item}>{item}</option>)}</select></label></div>
      {feedback}<div className="grid gap-3">{!filtered.length && <p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-stone-500">{events.length ? 'No events match your search.' : 'Your first event starts here. Choose a template or a blank page.'}</p>}{filtered.map((event) => <article key={event.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-display text-lg font-semibold">{event.title}</h2><span className="rounded-full bg-stone-100 px-2 py-1 text-xs">{stateOf(event)}</span></div><p className="mt-2 break-all text-xs text-stone-500">/event/{event.slug} · {event.blocks.length} blocks · Visible for {PUBLIC_EVENT_DURATION_LABELS[event.visibilityDuration]}</p>{event.expiresAt && event.status === 'PUBLISHED' && <p className="mt-1 text-xs text-stone-500">Expires {new Date(event.expiresAt).toLocaleString()}</p>}</div><div className="flex flex-wrap gap-2">{stateOf(event) === 'Live' && publicBaseUrl && publicSiteEnabled && <a href={publicBaseUrl + '/event/' + event.slug} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 text-sm font-semibold text-brand-700"><ExternalLink size={14} />View</a>}<Button variant="outline" onClick={() => open(toDraft(event))}>Edit page</Button><Button variant="outline" onClick={() => duplicate(event)} aria-label={'Duplicate ' + event.title}><Copy size={16} /></Button><Button variant="outline" onClick={() => { setDeleting(event); setMessage(null); }} aria-label={'Delete ' + event.title}><Trash2 size={16} /></Button></div></article>)}</div>{confirmation}
    </div>;
  }
  return <form onSubmit={save} className="min-w-0 space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4">
      <div className="min-w-0"><button type="button" disabled={saving} onClick={() => dirty ? setDiscard(true) : history.reset(null)} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-stone-500"><ArrowLeft size={14} />All events</button><h1 className="break-words font-display text-xl font-semibold">{draft.title || 'Untitled event'}</h1><p className="mt-1 text-xs text-stone-500">{dirty ? 'Unsaved changes' : 'All changes saved'} · {draft.status === 'PUBLISHED' ? 'Published' : 'Draft'}</p></div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" aria-label="Undo" disabled={saving || !history.canUndo} onClick={history.undo}><Undo2 size={16} /></Button><Button type="button" variant="outline" size="sm" aria-label="Redo" disabled={saving || !history.canRedo} onClick={history.redo}><Redo2 size={16} /></Button>{draft.id && draft.status === 'PUBLISHED' && <Button type="submit" name="action" value="UNPUBLISH" variant="outline" size="sm" disabled={saving}>Unpublish</Button>}<Button type="submit" name="action" value="SAVE" variant="outline" size="sm" disabled={saving}><Save size={15} className="mr-1" />{saving ? 'Saving…' : 'Save'}</Button><Button type="submit" name="action" value="PUBLISH" size="sm" disabled={saving || !publicBaseUrl || !publicSiteEnabled}><Eye size={15} className="mr-1" />{draft.status === 'PUBLISHED' ? 'Update live page' : 'Publish'}</Button></div>
    </header>
    {feedback}<nav aria-label="Event editor" className="flex flex-wrap gap-2">{(['details', 'content', 'design', 'preview'] as const).map((item) => <button type="button" key={item} onClick={() => setTab(item)} aria-pressed={tab === item} className={'rounded-lg px-4 py-2 text-sm font-semibold capitalize ' + (tab === item ? 'bg-brand-950 text-white' : 'border border-stone-200 bg-white text-stone-600')}>{item}</button>)}</nav>
    <fieldset disabled={saving} className="min-w-0 rounded-xl border border-stone-200 bg-white p-4 sm:p-6">
      <div hidden={tab !== 'details'} className="grid gap-6 lg:grid-cols-2"><div className="space-y-4"><label className="block text-sm font-medium">Event title<input required value={draft.title} maxLength={160} className={field} placeholder="Annual science fair" onChange={(e) => { const title = e.target.value; setDraft({ ...draft, title, slug: slugTouched ? draft.slug : normalizePublicEventSlug(title) }); }} onInvalid={(event) => { event.preventDefault(); setTab('details'); setMessage({ error: true, text: event.currentTarget.validationMessage || 'Enter an event title and a valid event URL.' }); }} /></label><label className="block text-sm font-medium">Event URL<input required value={draft.slug} pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} className={field} onInvalid={(event) => { event.preventDefault(); setTab('details'); setMessage({ error: true, text: event.currentTarget.validationMessage || 'Enter an event title and a valid event URL.' }); }} onChange={(e) => { setSlugTouched(true); setDraft({ ...draft, slug: e.target.value.toLowerCase() }); }} /><span className="mt-1 block break-all text-xs text-stone-500">{publicBaseUrl}/event/{draft.slug || 'your-event'}</span></label><label className="block text-sm font-medium">Short introduction<textarea value={draft.summary || ''} maxLength={500} rows={4} className={field} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} /></label></div><div className="space-y-4"><label className="block text-sm font-medium">Date and time<input value={draft.eventDate || ''} maxLength={120} placeholder="Saturday 24 October, 10:00 AM" className={field} onChange={(e) => setDraft({ ...draft, eventDate: e.target.value })} /></label><label className="block text-sm font-medium">Venue<input value={draft.venue || ''} maxLength={200} placeholder="Main campus" className={field} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} /></label><label className="block text-sm font-medium">Visibility after publishing<select value={draft.visibilityDuration} className={field} onChange={(e) => setDraft({ ...draft, visibilityDuration: e.target.value as PublicEventDuration })}>{PUBLIC_EVENT_DURATIONS.map((duration) => <option key={duration} value={duration}>{PUBLIC_EVENT_DURATION_LABELS[duration]}</option>)}</select></label><p className="text-xs leading-5 text-stone-500">Publishing starts a new visibility period. Saving keeps the current expiry.</p><ImageUploader value={draft.coverImageUrl || ''} label="cover photo" onChange={(coverImageUrl) => setDraft((current) => current ? { ...current, coverImageUrl } : current)} /></div></div>
      <div hidden={tab !== 'content'}><BlockComposer blocks={draft.blocks} onChange={(blocks) => setDraft({ ...draft, blocks })} /></div>
      <div hidden={tab !== 'design'}><PageDesignControls fallbackAccent={siteAccent} value={draft.design || {}} onChange={(design) => setDraft({ ...draft, design })} /></div>
      {tab === 'preview' && <ResponsivePreview title="Event page preview"><EventPageContent event={draft} institutionName={institutionName} accent={siteAccent} /></ResponsivePreview>}
    </fieldset>
    {tab !== 'preview' && <details className="rounded-xl border border-stone-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Live preview</summary><div className="mt-4"><ResponsivePreview title="Event page live preview"><EventPageContent event={draft} institutionName={institutionName} accent={siteAccent} /></ResponsivePreview></div></details>}
    {confirmation}
  </form>;
}
