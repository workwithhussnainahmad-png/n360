'use client';

import { type FormEvent, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Download, ExternalLink, Eye, Globe2, Plus, QrCode, Redo2, Trash2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WebsiteNotices } from '@/lib/public-website-notices';
import { PublicWebsiteNoticesEditor } from './PublicWebsiteNoticesEditor';
import { WebsiteInput, WebsiteTextarea } from './components/WebsiteInputs';
import { EditorSection } from './components/EditorSection';
import { ImageUploadButton } from './components/ImageUploadButton';
import { SelectedImage } from './components/SelectedImage';
import { PublicWebsiteThemePicker } from './PublicWebsiteThemePicker';
import { getPublicSiteTheme, type PublicSiteThemeId } from '@/lib/public-site-themes';
import type { WebsiteDesign } from '@/lib/public-site-builder';
import type { PublicInstitutionTenant } from '@/lib/institution-tenant';
import { api } from '@/lib/api-client';
import { WebsiteBuilderControls, type WebsiteDesignTab } from './WebsiteBuilderControls';
import { useEditorHistory } from '@/components/public-site/useEditorHistory';
const WebsitePreview = lazy(() => import('./WebsitePreview').then((module) => ({ default: module.WebsitePreview })));

type ContentCard = { title: string; description: string };
type Statistic = { value: string; label: string };
type GalleryImage = { url: string; caption: string };
type PublicProfile = {
  tagline: string | null; description: string | null; heroImageUrl: string | null;
  announcementText: string | null; announcementLink: string | null; aboutTitle: string | null;
  mission: string | null; vision: string | null; principalName: string | null;
  principalTitle: string | null; principalMessage: string | null; principalImageUrl: string | null;
  statistics: Statistic[]; programs: ContentCard[]; highlights: ContentCard[]; galleryImages: GalleryImage[];
  publicEmail: string | null; publicPhone: string | null; publicAddress: string | null; mapUrl: string | null;
  facebookUrl: string | null; instagramUrl: string | null; youtubeUrl: string | null; theme: PublicSiteThemeId;
  websiteNotices: WebsiteNotices; design?: WebsiteDesign;
};
type PublicWebsiteEditorProps = { publicSlug: string | null; publicSiteEnabled: boolean; publicUrl: string | null; qrUrl: string | null; eventLinks: Array<{ title: string; slug: string }>; initialProfile: PublicProfile; previewIdentity?: Pick<PublicInstitutionTenant, 'name' | 'type' | 'city' | 'country' | 'logoKey' | 'admissionsEnabled'>; previewEvents?: Array<{ id: number; title: string; slug: string; summary: string | null; coverImageUrl: string | null; eventDate: string | null; venue: string | null }> };

const fieldClass = 'w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';

export function PublicWebsiteEditor({ publicSlug, publicSiteEnabled, publicUrl, qrUrl, eventLinks, initialProfile, previewIdentity, previewEvents = [] }: PublicWebsiteEditorProps) {
  const history = useEditorHistory(() => ({
    ...initialProfile,
    design: initialProfile.design || {} as WebsiteDesign,
    tagline: initialProfile.tagline || '', description: initialProfile.description || '', heroImageUrl: initialProfile.heroImageUrl || '',
    announcementText: initialProfile.announcementText || '', announcementLink: initialProfile.announcementLink || '', aboutTitle: initialProfile.aboutTitle || '',
    mission: initialProfile.mission || '', vision: initialProfile.vision || '', principalName: initialProfile.principalName || '',
    principalTitle: initialProfile.principalTitle || '', principalMessage: initialProfile.principalMessage || '', principalImageUrl: initialProfile.principalImageUrl || '',
    publicEmail: initialProfile.publicEmail || '', publicPhone: initialProfile.publicPhone || '', publicAddress: initialProfile.publicAddress || '',
    mapUrl: initialProfile.mapUrl || '', facebookUrl: initialProfile.facebookUrl || '', instagramUrl: initialProfile.instagramUrl || '', youtubeUrl: initialProfile.youtubeUrl || '',
  }));
  const { value: profile, setValue: setProfile } = history;
  const [savedContent, setSavedContent] = useState(profile);
  const [savedTheme, setSavedTheme] = useState(initialProfile.theme);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [view, setView] = useState<'design' | 'content' | 'preview'>('design');
  const [designTab, setDesignTab] = useState<WebsiteDesignTab>('appearance');
  const [generatingQr, setGeneratingQr] = useState(false);
  const qrBusy = useRef(false);
  const changes = useMemo(() => Object.fromEntries(Object.entries(profile).filter(([key, value]) => key !== 'theme' && value !== savedContent[key as keyof typeof savedContent] && JSON.stringify(value) !== JSON.stringify(savedContent[key as keyof typeof savedContent]))), [profile, savedContent]);
  const dirty = Object.keys(changes).length > 0;
  useEffect(() => {
    if (!dirty && profile.theme === savedTheme) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, profile.theme, savedTheme]);
  const [openSections, setOpenSections] = useState<string[]>(['hero']);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const canEdit = Boolean(publicSlug);
  const publicHostname = publicUrl ? new URL(publicUrl).hostname : null;
  const toggleSection = useCallback((key: string) => setOpenSections((current) => current.includes(key) ? [] : [key]), []);
  const sectionProps = useCallback((sectionKey: string) => ({ sectionKey, open: openSections.includes(sectionKey), onToggle: toggleSection }), [openSections, toggleSection]);

  async function generateQrCode() {
    if (!qrUrl || qrBusy.current) return;
    qrBusy.current = true; setGeneratingQr(true);
    try { const { default: generator } = await import('qrcode'); setQrDataUrl(await generator.toDataURL(qrUrl, { width: 320, margin: 2, color: { dark: '#171c1a', light: '#ffffff' } })); }
    catch { setMessage({ kind: 'error', text: 'Unable to generate the QR code. Please try again.' }); }
    finally { qrBusy.current = false; setGeneratingQr(false); }
  }

  const updateField = useCallback((field: keyof typeof profile, value: string) => { setProfile((current) => current[field] === value ? current : ({ ...current, [field]: value })); }, [setProfile]);
  const updateCard = useCallback((list: 'programs' | 'highlights', index: number, field: keyof ContentCard, value: string) => { setProfile((current) => ({ ...current, [list]: current[list].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) })); }, [setProfile]);
  const addCard = useCallback((list: 'programs' | 'highlights') => { setProfile((current) => current[list].length >= 8 ? current : ({ ...current, [list]: [...current[list], { title: '', description: '' }] })); }, [setProfile]);
  const removeItem = useCallback((list: 'programs' | 'highlights' | 'statistics' | 'galleryImages', index: number) => { setProfile((current) => ({ ...current, [list]: current[list].filter((_, itemIndex) => itemIndex !== index) })); }, [setProfile]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (savingRef.current) return; savingRef.current = true; setSaving(true); setMessage(null);
    try {
      if (!Object.keys(changes).length) {
        setMessage({ kind: 'success', text: 'Your website content is already saved. Use Apply theme to change the theme.' });
        return;
      }
      await api.patch('/api/institution/public-site', changes);
      setSavedContent(profile);
      setMessage({ kind: 'success', text: 'Website saved. Visitors will see your changes on their next refresh.' });
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save website information' }); }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function saveTheme() {
    if (savingRef.current) return; savingRef.current = true; setSaving(true); setMessage(null);
    try {
      await api.patch('/api/institution/public-site', { theme: profile.theme });
      setSavedTheme(profile.theme);
      setMessage({ kind: 'success', text: 'Theme applied. All saved content is preserved. Visitors see the design on their next refresh.' });
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to apply theme' }); }
    finally { savingRef.current = false; setSaving(false); }
  }

  return <form onSubmit={save} className="min-w-0 space-y-5 [overflow-anchor:none]">
    <div className="mt-2 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-stone-50 p-4"><div className="flex gap-3"><Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" /><div><p className="text-sm font-semibold text-stone-900">{publicHostname || 'Subdomain not assigned'}</p><p className="mt-1 text-xs text-stone-500">{publicSiteEnabled ? 'Your public website is live.' : publicSlug ? 'Your subdomain is reserved but not published.' : 'Nisaab360 staff will assign this after approval and payment verification.'}</p></div></div>{publicSiteEnabled && publicUrl && <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" size="sm" disabled={generatingQr} onClick={generateQrCode}><QrCode className="mr-2 h-4 w-4" />Generate QR code</Button><a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-900">Visit site <ExternalLink className="h-4 w-4" /></a></div>}</div>
    {qrDataUrl && qrUrl && <div className="relative flex flex-col items-start gap-4 rounded-xl border border-stone-200 bg-white p-5 pr-14 sm:flex-row sm:items-center"><Button type="button" variant="ghost" size="icon" onClick={() => setQrDataUrl(null)} aria-label="Close QR code" className="absolute right-3 top-3"><X className="h-4 w-4" /></Button><Image unoptimized width={144} height={144} src={qrDataUrl} alt={`QR code for ${publicHostname}`} className="h-36 w-36 rounded-lg border border-stone-200 bg-white p-2" /><div><p className="font-semibold text-stone-900">Institution homepage QR code</p><p className="mt-1 break-all text-xs text-stone-500">{qrUrl}</p><a href={qrDataUrl} download={`${publicSlug}-website-qr.png`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-700"><Download className="h-4 w-4" />Download PNG</a></div></div>}
    <nav aria-label="Public website editor" className="flex flex-wrap gap-2">{([{ id: 'design', label: 'Design & layout' }, { id: 'content', label: 'Website content' }, { id: 'preview', label: 'Preview website' }] as const).map(({ id, label }) => <button type="button" key={id} onClick={() => setView(id)} aria-pressed={view === id} className={'rounded-lg px-4 py-2.5 text-sm font-semibold ' + (view === id ? 'bg-brand-950 text-white' : 'border border-stone-200 bg-white text-stone-600')}>{id === 'preview' && <Eye size={15} className="mr-2 inline" />}{label}</button>)}</nav>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3"><p className="text-xs text-stone-500">{dirty || profile.theme !== savedTheme ? 'Unsaved website changes' : 'All website changes saved'}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" aria-label="Undo website change" disabled={saving || !history.canUndo} onClick={history.undo}><Undo2 size={16} /></Button><Button type="button" size="sm" variant="outline" aria-label="Redo website change" disabled={saving || !history.canRedo} onClick={history.redo}><Redo2 size={16} /></Button></div></div>
    {view === 'preview' && previewIdentity && <Suspense fallback={<p role="status" className="p-4 text-sm text-stone-500">Opening website preview…</p>}><WebsitePreview tenant={{ ...profile, ...previewIdentity, id: 0, publicSlug: publicSlug || 'preview', accentColor: getPublicSiteTheme(profile.theme).accent }} events={previewEvents} /></Suspense>}
    <fieldset disabled={!canEdit || saving} className="min-w-0 space-y-4 disabled:opacity-60">
      {view === 'design' && <>
      <WebsiteBuilderControls tab={designTab} onTabChange={setDesignTab} themeAccent={getPublicSiteTheme(profile.theme).accent} value={profile.design} onChange={(design) => setProfile((current) => ({ ...current, design }))} />
      <div className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5"><PublicWebsiteThemePicker value={profile.theme} onChange={(theme) => setProfile((current) => ({ ...current, theme }))} /><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-stone-500">Every theme uses the same saved website content.</p><Button type="button" disabled={!canEdit || saving || profile.theme === savedTheme} onClick={saveTheme}>Apply theme</Button></div></div>
      </>}
      {view === 'content' && <>
      <EditorSection {...sectionProps('hero')} title="Brand and homepage hero" description="The first impression: headline, cover photograph, and announcement." guide={<>Use a short promise as the headline, not the institution name. Add one wide, real campus photograph. Use the announcement only for a current notice such as “Admissions open until 20 March”.</>}>
        <div className="mb-4 space-y-2"><span className="block text-sm font-medium text-stone-700">Homepage cover image</span>{profile.heroImageUrl ? <SelectedImage src={profile.heroImageUrl} alt="Homepage cover preview" onReplace={(url) => updateField('heroImageUrl', url)} onRemove={() => updateField('heroImageUrl', '')} /> : <div className="rounded-lg border border-dashed border-stone-300 bg-white p-5"><ImageUploadButton label="Choose cover image from device" onUploaded={(url) => updateField('heroImageUrl', url)} /><p className="mt-2 text-xs leading-5 text-stone-500">JPG, PNG, or WebP. Images are compressed before upload and must be no larger than 5 MB afterward.</p></div>}</div>
        <div className="space-y-4"><label className="block text-sm font-medium text-stone-700">Homepage headline<WebsiteInput value={profile.tagline} onChange={(value) => updateField('tagline', value)} maxLength={160} placeholder="Building confident learners for a changing world" className={`${fieldClass} mt-1`} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-stone-700">Announcement text<WebsiteInput value={profile.announcementText} onChange={(value) => updateField('announcementText', value)} maxLength={240} placeholder="Admissions for 2027 are now open" className={`${fieldClass} mt-1`} /></label><label className="text-sm font-medium text-stone-700">Announcement link<WebsiteInput value={profile.announcementLink} onChange={(value) => updateField('announcementLink', value)} maxLength={500} placeholder="/admissions or https://..." className={`${fieldClass} mt-1`} /></label></div></div>
      </EditorSection>

      <EditorSection {...sectionProps('notices')} title="Website popups and urgent alerts" description="Publish optional event popups, urgent alerts, and upcoming events without changing website code." guide={<>Each feature is optional and can be switched on or off independently. Empty features remain hidden even when enabled, so you can save drafts and complete them later.</>}>
        <PublicWebsiteNoticesEditor value={profile.websiteNotices} eventLinks={eventLinks} onChange={(websiteNotices) => setProfile((current) => ({ ...current, websiteNotices }))} />
      </EditorSection>

      <EditorSection {...sectionProps('published-timetable')} title="Published timetable" description="Upload one timetable image and choose whether visitors can see it on the public website." guide={<>Upload a clear, current timetable image. Landscape images are easiest to read on desktop, while a high-resolution image lets mobile visitors zoom in. The section stays hidden until it is enabled and an image has been uploaded.</>}>
        <div className="space-y-4">
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-stone-200 bg-white p-4"><span><span className="block text-sm font-semibold text-stone-900">Show timetable on public website</span><span className="mt-1 block text-xs leading-5 text-stone-500">Visitors will see a dedicated timetable section and navigation link.</span></span><input type="checkbox" checked={profile.websiteNotices.publishedTimetable.enabled} onChange={(event) => setProfile((current) => ({ ...current, websiteNotices: { ...current.websiteNotices, publishedTimetable: { ...current.websiteNotices.publishedTimetable, enabled: event.target.checked } } }))} className="mt-1 h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" /></label>
          <div className="space-y-2"><span className="block text-sm font-medium text-stone-700">Timetable image</span>{profile.websiteNotices.publishedTimetable.imageUrl ? <SelectedImage shape="document" src={profile.websiteNotices.publishedTimetable.imageUrl} alt="Published timetable preview" onReplace={(imageUrl) => setProfile((current) => ({ ...current, websiteNotices: { ...current.websiteNotices, publishedTimetable: { ...current.websiteNotices.publishedTimetable, imageUrl } } }))} onRemove={() => setProfile((current) => ({ ...current, websiteNotices: { ...current.websiteNotices, publishedTimetable: { ...current.websiteNotices.publishedTimetable, imageUrl: '' } } }))} /> : <div className="rounded-lg border border-dashed border-stone-300 bg-white p-5"><ImageUploadButton label="Choose timetable image from device" onUploaded={(imageUrl) => setProfile((current) => ({ ...current, websiteNotices: { ...current.websiteNotices, publishedTimetable: { ...current.websiteNotices.publishedTimetable, imageUrl } } }))} /><p className="mt-2 text-xs leading-5 text-stone-500">JPG, PNG, or WebP. The public section remains hidden when no image is uploaded.</p></div>}</div>
        </div>
      </EditorSection>

      <EditorSection {...sectionProps('about')} title="About, mission and vision" description="Tell families what the institution stands for and how it educates students." guide={<>Write a short introduction covering your history, teaching approach, and community. <strong>Mission</strong> explains what you do today; <strong>vision</strong> explains the future you want to create.</>}>
        <div className="space-y-4"><label className="block text-sm font-medium text-stone-700">About section heading<WebsiteInput value={profile.aboutTitle} onChange={(value) => updateField('aboutTitle', value)} maxLength={120} placeholder="An education grounded in purpose" className={`${fieldClass} mt-1`} /></label><label className="block text-sm font-medium text-stone-700">About the institution<WebsiteTextarea value={profile.description} onChange={(value) => updateField('description', value)} maxLength={2000} rows={6} placeholder="History, educational approach, community, and what makes your institution different." className={`${fieldClass} mt-1 resize-y leading-6`} /></label><div className="grid gap-4 lg:grid-cols-2"><label className="text-sm font-medium text-stone-700">Mission<WebsiteTextarea value={profile.mission} onChange={(value) => updateField('mission', value)} maxLength={1200} rows={4} className={`${fieldClass} mt-1 resize-y`} /></label><label className="text-sm font-medium text-stone-700">Vision<WebsiteTextarea value={profile.vision} onChange={(value) => updateField('vision', value)} maxLength={1200} rows={4} className={`${fieldClass} mt-1 resize-y`} /></label></div></div>
      </EditorSection>

      <EditorSection {...sectionProps('statistics')} title="Institution at a glance" description="Add up to six strong numbers, such as students, teachers, years, or results." guide={<>Only add factual numbers that help a family understand your scale, for example <strong>1,200+ / Students</strong>, <strong>65 / Teachers</strong>, or <strong>25 years / Serving the community</strong>. Do not add sentences here.</>}>
        <div className="space-y-3">{profile.statistics.map((item, index) => <div key={index} className="grid gap-2 rounded-lg border border-stone-200 bg-white p-3 sm:grid-cols-[140px_1fr_auto]"><WebsiteInput required value={item.value} onChange={(value) => setProfile((current) => ({ ...current, statistics: current.statistics.map((stat, itemIndex) => itemIndex === index ? { ...stat, value: value } : stat) }))} maxLength={30} placeholder="1,200+" className={fieldClass} /><WebsiteInput required value={item.label} onChange={(value) => setProfile((current) => ({ ...current, statistics: current.statistics.map((stat, itemIndex) => itemIndex === index ? { ...stat, label: value } : stat) }))} maxLength={80} placeholder="Students learning with us" className={fieldClass} /><Button type="button" size="sm" variant="outline" onClick={() => removeItem('statistics', index)} aria-label="Remove statistic"><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" disabled={profile.statistics.length >= 6} onClick={() => setProfile((current) => ({ ...current, statistics: [...current.statistics, { value: '', label: '' }] }))}><Plus className="mr-2 h-4 w-4" />Add statistic</Button></div>
      </EditorSection>

      {(['programs', 'highlights'] as const).map((list) => <EditorSection {...sectionProps(list)} key={list} title={list === 'programs' ? 'Programs and learning pathways' : 'Campus experience and highlights'} description={list === 'programs' ? 'Show the classes, levels, streams, or degrees families can choose.' : 'Show facilities, activities, student support, sports, labs, or achievements.'} guide={list === 'programs' ? <><strong>Programs are what a student can study</strong>—for example Primary School, Matric Science, FSc Pre-Medical, ICS, or BS Computer Science. Do not enter a campus name here.</> : <><strong>Highlights describe the student experience</strong>—for example a science laboratory, sports ground, scholarship program, counselling, or a notable achievement.</>}><div className="space-y-3">{profile[list].map((item, index) => <div key={index} className="rounded-lg border border-stone-200 bg-white p-4"><div className="flex gap-2"><WebsiteInput required value={item.title} onChange={(value) => updateCard(list, index, 'title', value)} maxLength={120} placeholder={list === 'programs' ? 'FSc Pre-Medical' : 'Science laboratories'} className={fieldClass} /><Button type="button" size="sm" variant="outline" onClick={() => removeItem(list, index)} aria-label="Remove item"><Trash2 className="h-4 w-4" /></Button></div><WebsiteTextarea value={item.description} onChange={(value) => updateCard(list, index, 'description', value)} maxLength={500} rows={2} placeholder={list === 'programs' ? 'Subjects, grade level, duration, or who this program is for' : 'What is available and how it benefits students'} className={`${fieldClass} mt-2 resize-y`} /></div>)}<Button type="button" variant="outline" disabled={profile[list].length >= 8} onClick={() => addCard(list)}><Plus className="mr-2 h-4 w-4" />Add {list === 'programs' ? 'program' : 'highlight'}</Button></div></EditorSection>)}

      <EditorSection {...sectionProps('leadership')} title="Message from leadership" description="Add a principal, director, rector, or head’s welcome message." guide={<>Add one genuine welcome message from the principal, director, rector, or head. Include the person’s name, exact designation, and a formal portrait. Keep the message personal and specific.</>}>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-stone-700">Name<WebsiteInput value={profile.principalName} onChange={(value) => updateField('principalName', value)} maxLength={120} placeholder="Dr. Ayesha Khan" className={`${fieldClass} mt-1`} /></label><label className="text-sm font-medium text-stone-700">Title<WebsiteInput value={profile.principalTitle} onChange={(value) => updateField('principalTitle', value)} maxLength={120} placeholder="Principal" className={`${fieldClass} mt-1`} /></label><div className="space-y-2 sm:col-span-2"><span className="block text-sm font-medium text-stone-700">Leadership photograph</span>{profile.principalImageUrl ? <SelectedImage shape="portrait" src={profile.principalImageUrl} alt="Leadership photograph preview" onReplace={(url) => updateField('principalImageUrl', url)} onRemove={() => updateField('principalImageUrl', '')} /> : <div className="rounded-lg border border-dashed border-stone-300 bg-white p-5"><ImageUploadButton label="Choose photograph from device" onUploaded={(url) => updateField('principalImageUrl', url)} /><p className="mt-2 text-xs text-stone-500">JPG, PNG, or WebP. Images are compressed before upload and must be no larger than 5 MB afterward.</p></div>}</div><label className="text-sm font-medium text-stone-700 sm:col-span-2">Message<WebsiteTextarea value={profile.principalMessage} onChange={(value) => updateField('principalMessage', value)} maxLength={1800} rows={5} className={`${fieldClass} mt-1 resize-y`} /></label></div>
      </EditorSection>

      <EditorSection {...sectionProps('gallery')} title="Photo gallery" description="Upload up to eight photographs showing campus life, events, and facilities." guide={<>Use real, clear photographs of your campus, classrooms, events, facilities, or students—with permission. Add a useful caption such as “Annual science exhibition 2026”. Avoid posters and repeated logos.</>}>
        <div className="mb-4 rounded-lg border border-dashed border-stone-300 bg-white p-5"><ImageUploadButton disabled={profile.galleryImages.length >= 8} label="Choose gallery image from device" onUploaded={(url) => setProfile((current) => current.galleryImages.length >= 8 ? current : ({ ...current, galleryImages: [...current.galleryImages, { url, caption: '' }] }))} /><p className="mt-2 text-xs leading-5 text-stone-500">JPG, PNG, or WebP. Images are compressed before upload and must be no larger than 5 MB afterward. {profile.galleryImages.length}/8 images added.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">{profile.galleryImages.map((item, index) => <div key={`${item.url}-${index}`} className="overflow-hidden rounded-lg border border-stone-200 bg-white"><div className="relative aspect-[16/10] bg-stone-100"><Image unoptimized fill sizes="(max-width: 640px) 100vw, 420px" src={item.url} alt={item.caption || `Gallery image ${index + 1}`} className="object-cover" /></div><div className="space-y-2 p-3"><WebsiteInput value={item.caption} onChange={(value) => setProfile((current) => ({ ...current, galleryImages: current.galleryImages.map((image, itemIndex) => itemIndex === index ? { ...image, caption: value } : image) }))} maxLength={120} placeholder="Photo caption" aria-label={`Caption for gallery image ${index + 1}`} className={fieldClass} /><div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => removeItem('galleryImages', index)}><Trash2 className="mr-2 h-4 w-4" />Remove</Button></div></div></div>)}</div>
      </EditorSection>

      <EditorSection {...sectionProps('contact')} title="Contact, map and social media" description="Make it easy for families to visit, call, email, and follow the institution." guide={<>Enter details that parents may publicly use. The address should be the visitor-facing campus address. Paste the full Google Maps share link and the full URL of each official social-media page.</>}>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-stone-700">Public email<WebsiteInput type="email" value={profile.publicEmail} onChange={(value) => updateField('publicEmail', value)} maxLength={255} placeholder="admissions@example.edu.pk" className={`${fieldClass} mt-1`} /></label><label className="text-sm font-medium text-stone-700">Public phone<WebsiteInput type="tel" value={profile.publicPhone} onChange={(value) => updateField('publicPhone', value)} maxLength={50} placeholder="+92 300 1234567" className={`${fieldClass} mt-1`} /></label><label className="text-sm font-medium text-stone-700 sm:col-span-2">Campus address<WebsiteInput value={profile.publicAddress} onChange={(value) => updateField('publicAddress', value)} maxLength={300} className={`${fieldClass} mt-1`} /></label><label className="text-sm font-medium text-stone-700 sm:col-span-2">Google Maps link<WebsiteInput type="url" value={profile.mapUrl} onChange={(value) => updateField('mapUrl', value)} maxLength={500} placeholder="https://maps.google.com/..." className={`${fieldClass} mt-1`} /></label><label className="text-sm font-medium text-stone-700">Facebook<WebsiteInput type="url" value={profile.facebookUrl} onChange={(value) => updateField('facebookUrl', value)} maxLength={500} placeholder="https://facebook.com/..." className={`${fieldClass} mt-1`} /></label><label className="text-sm font-medium text-stone-700">Instagram<WebsiteInput type="url" value={profile.instagramUrl} onChange={(value) => updateField('instagramUrl', value)} maxLength={500} placeholder="https://instagram.com/..." className={`${fieldClass} mt-1`} /></label><label className="text-sm font-medium text-stone-700 sm:col-span-2">YouTube<WebsiteInput type="url" value={profile.youtubeUrl} onChange={(value) => updateField('youtubeUrl', value)} maxLength={500} placeholder="https://youtube.com/..." className={`${fieldClass} mt-1`} /></label></div>
      </EditorSection>
      </>}
    </fieldset>

    {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg px-4 py-3 text-sm ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}
    <div className="sticky bottom-0 z-20 -mx-4 flex justify-end border-t border-stone-200 bg-white/95 px-4 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur sm:-mx-6 sm:px-6"><Button type="submit" disabled={!canEdit || saving}>{saving ? 'Saving website...' : 'Save public website'}</Button></div>
  </form>;
}
