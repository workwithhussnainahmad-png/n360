'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WEBSITE_SECTIONS, websiteSections, type WebsiteDesign, type WebsiteSection } from '@/lib/public-site-builder';
import { PageDesignControls } from '@/components/public-site/PageDesignControls';
import { BlockComposer } from '@/components/public-site/BlockComposer';

function SectionRow({ section, index, count, update, move }: { section: WebsiteSection; index: number; count: number; update: (value: WebsiteSection) => void; move: (offset: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });
  const label = WEBSITE_SECTIONS.find((item) => item.id === section.id)!.label;
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="rounded-lg border border-stone-200 bg-white p-3">
    <div className="flex items-center gap-2"><button type="button" {...attributes} {...listeners} aria-label={'Reorder ' + label} className="touch-none rounded p-2 text-stone-500"><GripVertical size={16} /></button><label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={section.visible} onChange={(e) => update({ ...section, visible: e.target.checked })} />{label}</label><button type="button" disabled={!index} aria-label={'Move ' + label + ' up'} onClick={() => move(-1)} className="rounded p-2 text-stone-500 disabled:opacity-25"><ArrowUp size={16} /></button><button type="button" disabled={index === count - 1} aria-label={'Move ' + label + ' down'} onClick={() => move(1)} className="rounded p-2 text-stone-500 disabled:opacity-25"><ArrowDown size={16} /></button></div>
    {!['statistics', 'leadership'].includes(section.id) && <label className="mt-2 block text-xs text-stone-500">Custom heading<input value={section.title} maxLength={120} placeholder="Use the theme heading" onChange={(e) => update({ ...section, title: e.target.value })} className="mt-1 w-full rounded border border-stone-200 bg-white p-2 text-sm text-stone-900" /></label>}
  </div>;
}
export function WebsiteBuilderControls({ value, onChange, themeAccent }: { value: WebsiteDesign; themeAccent?: string; onChange: (value: WebsiteDesign) => void }) {
  const [tab, setTab] = useState<'appearance' | 'sections' | 'custom'>('appearance');
  const sections = websiteSections(value);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function move(from: number, to: number) { if (to >= 0 && to < sections.length) onChange({ ...value, sections: arrayMove(sections, from, to) }); }
  function dragEnd({ active, over }: DragEndEvent) { if (over && active.id !== over.id) move(sections.findIndex((s) => s.id === active.id), sections.findIndex((s) => s.id === over.id)); }
  return <div className="min-w-0 space-y-5 rounded-xl border border-brand-200 bg-white p-4 sm:p-5"><div><h2 className="font-display text-xl font-semibold">Make your website yours</h2><p className="mt-2 text-sm leading-6 text-stone-500">Choose the presentation, arrange your homepage, and add content without writing code.</p></div><nav className="flex flex-wrap gap-2" aria-label="Website design controls">{(['appearance', 'sections', 'custom'] as const).map((item) => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)} className={'rounded-lg px-3 py-2 text-sm font-semibold capitalize ' + (tab === item ? 'bg-brand-950 text-white' : 'bg-stone-100 text-stone-600')}>{item === 'custom' ? 'Custom content' : item}</button>)}</nav>
    <div hidden={tab !== 'appearance'} className="space-y-5"><PageDesignControls website fallbackAccent={themeAccent} value={value} onChange={onChange} /><div className="grid gap-4 border-t pt-4 sm:grid-cols-2"><label className="text-sm font-medium">Homepage button text<input value={value.heroButtonLabel || ''} maxLength={80} placeholder="Book a campus visit" className="mt-1 w-full rounded-lg border p-2.5 text-sm" onChange={(e) => onChange({ ...value, heroButtonLabel: e.target.value })} /></label><label className="text-sm font-medium">Homepage button destination<input value={value.heroButtonUrl || ''} maxLength={500} placeholder="#contact or https://…" className="mt-1 w-full rounded-lg border p-2.5 text-sm" onChange={(e) => onChange({ ...value, heroButtonUrl: e.target.value })} /></label></div></div>
    <div hidden={tab !== 'sections'}><p className="mb-4 text-xs leading-5 text-stone-500">Drag to arrange sections, or use the arrows. Uncheck a section to hide it. Content stays saved. Empty sections and closed admissions remain hidden.</p><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}><div className="grid gap-2">{sections.map((section, index) => <SectionRow key={section.id} section={section} index={index} count={sections.length} move={(offset) => move(index, index + offset)} update={(next) => onChange({ ...value, sections: sections.map((item) => item.id === next.id ? next : item) })} />)}</div></SortableContext></DndContext></div>
    <div hidden={tab !== 'custom'}><p className="mb-4 text-xs leading-5 text-stone-500">Add FAQs, photographs, videos, information panels, and more. Move “Custom content” anywhere on your homepage using Sections.</p><BlockComposer blocks={value.customBlocks || []} onChange={(customBlocks) => onChange({ ...value, customBlocks })} /></div>
  </div>;
}
