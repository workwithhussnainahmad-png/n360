'use client';
import { lazy, Suspense, useState } from 'react';
import type { WebsiteDesign } from '@/lib/public-site-builder';
import { PageDesignControls } from '@/components/public-site/PageDesignControls';

const WebsiteSectionControls = lazy(() => import('./WebsiteSectionControls').then((module) => ({ default: module.WebsiteSectionControls })));
const BlockComposer = lazy(() => import('@/components/public-site/BlockComposer').then((module) => ({ default: module.BlockComposer })));
export type WebsiteDesignTab = 'appearance' | 'sections' | 'custom';
export function WebsiteBuilderControls({ value, onChange, themeAccent, tab: controlledTab, onTabChange }: { value: WebsiteDesign; themeAccent?: string; onChange: (value: WebsiteDesign) => void; tab?: WebsiteDesignTab; onTabChange?: (tab: WebsiteDesignTab) => void }) {
  const [localTab, setLocalTab] = useState<WebsiteDesignTab>('appearance');
  const tab = controlledTab || localTab;
  const setTab = onTabChange || setLocalTab;
  return <section className="min-w-0 space-y-5 rounded-xl border border-brand-200 bg-white p-4 sm:p-5" aria-label="Website design settings"><div><h2 className="font-display text-xl font-semibold">Website design settings</h2><p className="mt-2 text-sm leading-6 text-stone-500">Set your colors, fonts and page layout. Arrange homepage sections or add galleries, videos and FAQs without coding.</p></div><nav className="flex flex-wrap gap-2" aria-label="Website design controls">{(['appearance', 'sections', 'custom'] as const).map((item) => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)} className={'rounded-lg px-3 py-2 text-sm font-semibold capitalize ' + (tab === item ? 'bg-brand-950 text-white' : 'bg-stone-100 text-stone-600')}>{item === 'custom' ? 'Custom content' : item === 'sections' ? 'Homepage sections' : 'Appearance'}</button>)}</nav>
    {tab === 'appearance' && <div className="space-y-5"><PageDesignControls website fallbackAccent={themeAccent} value={value} onChange={onChange} /><div className="grid gap-4 border-t pt-4 sm:grid-cols-2"><label className="text-sm font-medium">Homepage button text<input value={value.heroButtonLabel || ''} maxLength={80} placeholder="Book a campus visit" className="mt-1 w-full rounded-lg border p-2.5 text-sm" onChange={(event) => onChange({ ...value, heroButtonLabel: event.target.value })} /></label><label className="text-sm font-medium">Homepage button destination<input value={value.heroButtonUrl || ''} maxLength={500} placeholder="#contact or https://…" className="mt-1 w-full rounded-lg border p-2.5 text-sm" onChange={(event) => onChange({ ...value, heroButtonUrl: event.target.value })} /></label></div></div>}
    {tab === 'sections' && <Suspense fallback={<p role="status">Opening homepage sections…</p>}><WebsiteSectionControls value={value} onChange={onChange} /></Suspense>}
    {tab === 'custom' && <div><p className="mb-4 text-xs leading-5 text-stone-500">Add FAQs, photographs, videos and information panels. Move “Custom content” on your homepage using Homepage sections.</p><Suspense fallback={<p role="status">Opening content blocks…</p>}><BlockComposer blocks={value.customBlocks || []} onChange={(customBlocks) => onChange({ ...value, customBlocks })} /></Suspense></div>}
  </section>;
}
