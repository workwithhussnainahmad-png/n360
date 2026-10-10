'use client';
import { memo } from 'react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PublicEventBlock } from '@/lib/public-events';
import { BLOCK_LABELS } from '@/lib/public-site-builder';
import { EventContentBlocks } from '@/components/public-site/EventContentBlocks';
import styles from './event-editor.module.css';

const CanvasBlock = memo(function CanvasBlock({ block, index, count, selected, disabled, select, move, duplicate, remove }: {
  block: PublicEventBlock; index: number; count: number; selected: boolean; disabled: boolean;
  select: (id: string) => void; move: (id: string, offset: number) => void; duplicate: (id: string) => void; remove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, disabled });
  return <div ref={setNodeRef} data-canvas-block={block.id} className={styles.block + (selected ? ' ' + styles.selected : '')} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .4 : 1 }}>
    <div className={styles.blockToolbar}>
      <button type="button" {...attributes} {...listeners} disabled={disabled} aria-label={'Reorder ' + BLOCK_LABELS[block.type]} className="touch-none rounded p-2"><GripVertical size={15} /></button>
      <button type="button" disabled={disabled} onClick={() => select(block.id)} aria-pressed={selected} className="min-w-0 flex-1 truncate text-left text-xs font-semibold">{index + 1}. {BLOCK_LABELS[block.type]}</button>
      <button type="button" aria-label={'Move up ' + (index + 1)} disabled={disabled || index === 0} onClick={() => move(block.id, -1)}><ArrowUp size={14} /></button>
      <button type="button" aria-label={'Move down ' + (index + 1)} disabled={disabled || index === count - 1} onClick={() => move(block.id, 1)}><ArrowDown size={14} /></button>
      <button type="button" aria-label={'Duplicate block ' + (index + 1)} disabled={disabled || count >= 40} onClick={() => duplicate(block.id)}><Copy size={14} /></button>
      <button type="button" aria-label={'Remove block ' + (index + 1)} disabled={disabled} onClick={() => remove(block.id)}><Trash2 size={14} /></button>
    </div>
    <div onClick={() => { if (!disabled) select(block.id); }} onClickCapture={(event) => { if ((event.target as Element).closest('a')) event.preventDefault(); }} className="min-h-6 cursor-pointer">
      <EventContentBlocks blocks={[block]} />
    </div>
  </div>;
});

export function EventCanvas({ blocks, selectedId, disabled, select, move, duplicate, remove, reorder }: {
  blocks: PublicEventBlock[]; selectedId: string | null; disabled: boolean;
  select: (id: string) => void; move: (id: string, offset: number) => void; duplicate: (id: string) => void; remove: (id: string) => void;
  reorder: (blocks: PublicEventBlock[]) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function dragEnd({ active, over }: DragEndEvent) {
    if (disabled || !over || active.id === over.id) return;
    const from = blocks.findIndex((block) => block.id === active.id), to = blocks.findIndex((block) => block.id === over.id);
    if (from >= 0 && to >= 0) reorder(arrayMove(blocks, from, to));
  }
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
    <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
      <div className={styles.canvasBlocks}>{blocks.map((block, index) => <CanvasBlock key={block.id} block={block} index={index} count={blocks.length} selected={selectedId === block.id} disabled={disabled} select={select} move={move} duplicate={duplicate} remove={remove} />)}</div>
    </SortableContext>
  </DndContext>;
}
