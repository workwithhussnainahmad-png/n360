'use client';

import Image from 'next/image';
import { BellRing, CalendarDays, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WebsiteNotices, WebsiteUpcomingEvent } from '@/lib/public-website-notices';
import { ImageUploadButton } from './components/ImageUploadButton';

const fieldClass = 'w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
const EMPTY_EVENT: WebsiteUpcomingEvent = { title: '', description: '', dateTime: '', venue: '', buttonText: '', buttonUrl: '' };

function EventLinkPicker({ events, onSelect }: { events: Array<{ title: string; slug: string }>; onSelect: (url: string) => void }) {
  if (events.length === 0) return <p className="text-xs text-stone-500">No active published events are available to link yet.</p>;
  return <label className="block text-xs font-medium text-stone-600">Or link a published event<select defaultValue="" onChange={(event) => { if (event.target.value) onSelect(`/event/${event.target.value}`); event.target.value = ''; }} className={`${fieldClass} mt-1`}><option value="">Choose an event...</option>{events.map((event) => <option key={event.slug} value={event.slug}>{event.title}</option>)}</select></label>;
}

function FeatureToggle({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-stone-200 bg-white p-4"><span><span className="block text-sm font-semibold text-stone-900">{title}</span><span className="mt-1 block text-xs leading-5 text-stone-500">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" /></label>;
}

function PopupImageUpload({ imageUrl, onChange }: { imageUrl: string; onChange: (url: string) => void }) {
  return <div className="space-y-3">{imageUrl && <div className="relative aspect-[16/7] overflow-hidden rounded-lg bg-stone-100"><Image unoptimized fill sizes="700px" src={imageUrl} alt="Event popup preview" className="object-cover" /></div>}<div className="flex flex-wrap gap-2"><ImageUploadButton label={imageUrl ? 'Replace image' : 'Add optional image'} onUploaded={onChange} />{imageUrl && <Button type="button" size="sm" variant="outline" onClick={() => onChange('')}>Remove image</Button>}</div></div>;
}

export function PublicWebsiteNoticesEditor({ value, eventLinks, onChange }: { value: WebsiteNotices; eventLinks: Array<{ title: string; slug: string }>; onChange: (value: WebsiteNotices) => void }) {
  const updateEvent = (patch: Partial<WebsiteNotices['eventPopup']>) => onChange({ ...value, eventPopup: { ...value.eventPopup, ...patch } });
  const updateAlert = (patch: Partial<WebsiteNotices['urgentAlert']>) => onChange({ ...value, urgentAlert: { ...value.urgentAlert, ...patch } });
  const updateUpcoming = (patch: Partial<WebsiteNotices['upcomingEventsPopup']>) => onChange({ ...value, upcomingEventsPopup: { ...value.upcomingEventsPopup, ...patch } });
  const updateUpcomingEvent = (index: number, patch: Partial<WebsiteUpcomingEvent>) => updateUpcoming({ events: value.upcomingEventsPopup.events.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });

  return <div className="space-y-6">
    <section className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
      <FeatureToggle checked={value.eventPopup.enabled} onChange={(enabled) => updateEvent({ enabled })} title="Event popup" description="Show one featured event when a visitor opens the website. Every field below is optional." />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-stone-700 sm:col-span-2">Title<input value={value.eventPopup.title} onChange={(event) => updateEvent({ title: event.target.value })} maxLength={160} placeholder="Annual Sports Day" className={`${fieldClass} mt-1`} /></label>
        <label className="text-sm font-medium text-stone-700 sm:col-span-2">Description<textarea value={value.eventPopup.description} onChange={(event) => updateEvent({ description: event.target.value })} maxLength={1200} rows={3} className={`${fieldClass} mt-1 resize-y`} /></label>
        <label className="text-sm font-medium text-stone-700">Date and time<input value={value.eventPopup.dateTime} onChange={(event) => updateEvent({ dateTime: event.target.value })} maxLength={120} placeholder="Saturday, 10:00 AM" className={`${fieldClass} mt-1`} /></label>
        <label className="text-sm font-medium text-stone-700">Venue<input value={value.eventPopup.venue} onChange={(event) => updateEvent({ venue: event.target.value })} maxLength={200} placeholder="Main Campus Ground" className={`${fieldClass} mt-1`} /></label>
        <label className="text-sm font-medium text-stone-700">Button text<input value={value.eventPopup.buttonText} onChange={(event) => updateEvent({ buttonText: event.target.value })} maxLength={80} placeholder="View details" className={`${fieldClass} mt-1`} /></label>
        <div className="space-y-2"><label className="text-sm font-medium text-stone-700">Button link<input value={value.eventPopup.buttonUrl} onChange={(event) => updateEvent({ buttonUrl: event.target.value })} maxLength={500} placeholder="/event/science-fair or https://..." className={`${fieldClass} mt-1`} /></label><EventLinkPicker events={eventLinks} onSelect={(buttonUrl) => updateEvent({ buttonUrl, buttonText: value.eventPopup.buttonText || 'Learn more' })} /></div>
        <div className="sm:col-span-2"><PopupImageUpload imageUrl={value.eventPopup.imageUrl} onChange={(imageUrl) => updateEvent({ imageUrl })} /></div>
      </div>
    </section>

    <section className="space-y-4 rounded-xl border border-red-200 bg-red-50/40 p-4">
      <FeatureToggle checked={value.urgentAlert.enabled} onChange={(enabled) => updateAlert({ enabled })} title="Urgent alert bar" description="Display a high-priority message above the website header. Leave it empty to keep it hidden." />
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-stone-700 sm:col-span-2">Alert message<textarea value={value.urgentAlert.message} onChange={(event) => updateAlert({ message: event.target.value })} maxLength={300} rows={2} placeholder="Campus will remain closed tomorrow due to severe weather." className={`${fieldClass} mt-1 resize-y`} /></label><label className="text-sm font-medium text-stone-700">Button text<input value={value.urgentAlert.buttonText} onChange={(event) => updateAlert({ buttonText: event.target.value })} maxLength={80} placeholder="Read notice" className={`${fieldClass} mt-1`} /></label><div className="space-y-2"><label className="text-sm font-medium text-stone-700">Button link<input value={value.urgentAlert.buttonUrl} onChange={(event) => updateAlert({ buttonUrl: event.target.value })} maxLength={500} placeholder="/event/science-fair or https://..." className={`${fieldClass} mt-1`} /></label><EventLinkPicker events={eventLinks} onSelect={(buttonUrl) => updateAlert({ buttonUrl, buttonText: value.urgentAlert.buttonText || 'Learn more' })} /></div></div>
    </section>

    <section className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
      <FeatureToggle checked={value.upcomingEventsPopup.enabled} onChange={(enabled) => updateUpcoming({ enabled })} title="Upcoming events popup" description="Show a visitor-friendly list of upcoming activities. Event content is optional." />
      <label className="block text-sm font-medium text-stone-700">Popup heading<input value={value.upcomingEventsPopup.heading} onChange={(event) => updateUpcoming({ heading: event.target.value })} maxLength={160} placeholder="Coming up at our campus" className={`${fieldClass} mt-1`} /></label>
      <div className="space-y-3">{value.upcomingEventsPopup.events.map((item, index) => <div key={index} className="space-y-3 rounded-lg border border-stone-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm font-semibold text-stone-900"><CalendarDays className="h-4 w-4" />Event {index + 1}</p><Button type="button" size="sm" variant="outline" onClick={() => updateUpcoming({ events: value.upcomingEventsPopup.events.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Remove event ${index + 1}`}><Trash2 className="h-4 w-4" /></Button></div><div className="grid gap-3 sm:grid-cols-2"><input value={item.title} onChange={(event) => updateUpcomingEvent(index, { title: event.target.value })} maxLength={160} placeholder="Event title (optional)" aria-label={`Event ${index + 1} title`} className={fieldClass} /><input value={item.dateTime} onChange={(event) => updateUpcomingEvent(index, { dateTime: event.target.value })} maxLength={120} placeholder="Date and time (optional)" aria-label={`Event ${index + 1} date and time`} className={fieldClass} /><input value={item.venue} onChange={(event) => updateUpcomingEvent(index, { venue: event.target.value })} maxLength={200} placeholder="Venue (optional)" aria-label={`Event ${index + 1} venue`} className={fieldClass} /><input value={item.buttonText} onChange={(event) => updateUpcomingEvent(index, { buttonText: event.target.value })} maxLength={80} placeholder="Button text (optional)" aria-label={`Event ${index + 1} button text`} className={fieldClass} /><textarea value={item.description} onChange={(event) => updateUpcomingEvent(index, { description: event.target.value })} maxLength={600} rows={2} placeholder="Description (optional)" aria-label={`Event ${index + 1} description`} className={`${fieldClass} resize-y sm:col-span-2`} /><input value={item.buttonUrl} onChange={(event) => updateUpcomingEvent(index, { buttonUrl: event.target.value })} maxLength={500} placeholder="Button link (optional)" aria-label={`Event ${index + 1} button link`} className={`${fieldClass} sm:col-span-2`} /><div className="sm:col-span-2"><EventLinkPicker events={eventLinks} onSelect={(buttonUrl) => updateUpcomingEvent(index, { buttonUrl, buttonText: item.buttonText || 'Learn more' })} /></div></div></div>)}<Button type="button" variant="outline" disabled={value.upcomingEventsPopup.events.length >= 8} onClick={() => updateUpcoming({ events: [...value.upcomingEventsPopup.events, { ...EMPTY_EVENT }] })}><Plus className="mr-2 h-4 w-4" />Add optional event</Button></div>
    </section>

    <p className="flex items-start gap-2 text-xs leading-5 text-stone-500"><BellRing className="mt-0.5 h-4 w-4 shrink-0" />Disabled or empty notices stay hidden. You can save the public website without completing any of these fields.</p>
  </div>;
}
