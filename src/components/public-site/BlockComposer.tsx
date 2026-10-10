'use client';
import { useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { PublicEventBlock } from '@/lib/public-events';
import { BLOCK_LABELS, makePublicBlock, newPublicBlockId } from '@/lib/public-site-builder';
import { BlockSettings } from './BlockSettings';
import { Button } from '@/components/ui/button';

function BlockRow({ block, selected, index, count, select, move, duplicate, remove }: { block: PublicEventBlock; selected: boolean; index: number; count: number; select: () => void; move: (offset: number) => void; duplicate: () => void; remove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const summary = 'text' in block ? block.text : 'title' in block ? block.title : 'label' in block ? block.label : BLOCK_LABELS[block.type];
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .4 : 1 }} className={'rounded-lg border bg-white p-2 ' + (selected ? 'border-brand-500 ring-1 ring-brand-500' : 'border-stone-200')}>
    <div className="flex items-center gap-2"><button type="button" {...attributes} {...listeners} aria-label={'Reorder ' + BLOCK_LABELS[block.type]} className="touch-none rounded p-2 text-stone-500"><GripVertical size={16} /></button><button type="button" onClick={select} aria-pressed={selected} className="min-w-0 flex-1 text-left"><span className="block text-xs font-semibold">{index + 1}. {BLOCK_LABELS[block.type]}</span><span className="block truncate text-xs text-stone-500">{summary || 'Add content'}</span></button></div>
    <div className="mt-1 flex justify-end gap-1">{[{ label: 'Move up', Icon: ArrowUp, disabled: index === 0, run: () => move(-1) }, { label: 'Move down', Icon: ArrowDown, disabled: index === count - 1, run: () => move(1) }, { label: 'Duplicate block', Icon: Copy, disabled: count >= 40, run: duplicate }, { label: 'Remove block', Icon: Trash2, disabled: false, run: remove }].map(({ label, Icon, disabled, run }) => <button type="button" key={label} aria-label={label + ' ' + (index + 1)} title={label} disabled={disabled} onClick={run} className="rounded p-2 text-stone-500 hover:bg-stone-100 disabled:opacity-25"><Icon size={14} /></button>)}</div>
  </div>;
}
export function BlockComposer({ blocks, onChange }: { blocks: PublicEventBlock[]; onChange: (blocks: PublicEventBlock[]) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const active = blocks.find((block) => block.id === selectedId);
  function move(from: number, to: number) { if (to >= 0 && to < blocks.length) onChange(arrayMove(blocks, from, to)); }
  function dragEnd({ active, over }: DragEndEvent) { if (over && active.id !== over.id) move(blocks.findIndex((b) => b.id === active.id), blocks.findIndex((b) => b.id === over.id)); }
  return <div className="grid min-w-0 gap-5 lg:grid-cols-2">
    <div className="min-w-0 space-y-5"><details className="rounded-lg border border-stone-200 bg-stone-50 p-3" open={blocks.length === 0}><summary className="cursor-pointer text-sm font-semibold">Add content · {blocks.length}/40 blocks</summary><div className="mt-3 grid grid-cols-2 gap-2">{(Object.keys(BLOCK_LABELS) as PublicEventBlock['type'][]).map((type) => <Button key={type} type="button" variant="outline" size="sm" className="h-auto justify-start whitespace-normal py-2 text-left" disabled={blocks.length >= 40} onClick={() => { const block = makePublicBlock(type); onChange([...blocks, block]); setSelectedId(block.id); }}><Plus size={14} className="mr-1 shrink-0" />{BLOCK_LABELS[type]}</Button>)}</div></details>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}><div className="space-y-2">{blocks.map((block, index) => <BlockRow key={block.id} block={block} selected={selectedId === block.id} index={index} count={blocks.length} select={() => setSelectedId(block.id)} move={(offset) => move(index, index + offset)} duplicate={() => { const copy = { ...structuredClone(block), id: newPublicBlockId() }; onChange([...blocks.slice(0, index + 1), copy, ...blocks.slice(index + 1)]); setSelectedId(copy.id); }} remove={() => onChange(blocks.filter((item) => item.id !== block.id))} />)}</div></SortableContext></DndContext>
    </div>
    <div className="min-w-0 rounded-xl border border-stone-200 bg-white p-4">{active ? <BlockSettings block={active} update={(updated) => onChange(blocks.map((b) => b.id === updated.id ? updated : b))} /> : <p className="text-sm leading-6 text-stone-500">Select a block to edit its content and appearance. Drag the handle to reorder, or use the arrow buttons.</p>}</div>
  </div>;
}
