'use client';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WEBSITE_SECTIONS, websiteSections, type WebsiteDesign, type WebsiteSection } from '@/lib/public-site-builder';

function SectionRow({ section, index, count, update, move }: { section: WebsiteSection; index: number; count: number; update: (value: WebsiteSection) => void; move: (offset: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: section.id });
  const label = WEBSITE_SECTIONS.find((item) => item.id === section.id)!.label;
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="rounded-lg border border-stone-200 bg-white p-3">
    <div className="flex items-center gap-2"><button type="button" {...attributes} {...listeners} aria-label={'Reorder ' + label} className="touch-none rounded p-2 text-stone-500"><GripVertical size={16} /></button><label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={section.visible} onChange={(event) => update({ ...section, visible: event.target.checked })} />{label}</label><button type="button" disabled={!index} aria-label={'Move ' + label + ' up'} onClick={() => move(-1)} className="rounded p-2 text-stone-500 disabled:opacity-25"><ArrowUp size={16} /></button><button type="button" disabled={index === count - 1} aria-label={'Move ' + label + ' down'} onClick={() => move(1)} className="rounded p-2 text-stone-500 disabled:opacity-25"><ArrowDown size={16} /></button></div>
    {!['statistics', 'leadership'].includes(section.id) && <label className="mt-2 block text-xs text-stone-500">Custom heading<input value={section.title} maxLength={120} placeholder="Use the theme heading" onChange={(event) => update({ ...section, title: event.target.value })} className="mt-1 w-full rounded border border-stone-200 bg-white p-2 text-sm text-stone-900" /></label>}
  </div>;
}
export function WebsiteSectionControls({ value, onChange }: { value: WebsiteDesign; onChange: (value: WebsiteDesign) => void }) {
  const sections = websiteSections(value);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function move(from: number, to: number) { if (from >= 0 && to >= 0 && to < sections.length) onChange({ ...value, sections: arrayMove(sections, from, to) }); }
  function dragEnd({ active, over }: DragEndEvent) { if (over && active.id !== over.id) move(sections.findIndex((item) => item.id === active.id), sections.findIndex((item) => item.id === over.id)); }
  return <div><p className="mb-4 text-xs leading-5 text-stone-500">Drag to arrange sections, or use the arrows. Uncheck a section to hide it. Content stays saved. Empty sections and closed admissions remain hidden.</p><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={sections.map((section) => section.id)} strategy={verticalListSortingStrategy}><div className="grid gap-2">{sections.map((section, index) => <SectionRow key={section.id} section={section} index={index} count={sections.length} move={(offset) => move(index, index + offset)} update={(next) => onChange({ ...value, sections: sections.map((item) => item.id === next.id ? next : item) })} />)}</div></SortableContext></DndContext></div>;
}
