import React from 'react';
import { GripVertical, Trash2, ImageIcon } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PublicEventBlock } from '@/lib/public-events';
import { EventContentBlocks } from '@/components/public-site/EventContentBlocks';

export const SortableBlockItem = React.memo(function SortableBlockItem({ 
  block, activeId, onEdit, onRemove 
}: { 
  block: PublicEventBlock; activeId: string | null; onEdit: (id: string) => void; onRemove: (id: string) => void 
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`group relative mb-6 rounded-lg border-2 ${activeId === block.id ? 'border-brand-500 bg-brand-50/10' : 'border-transparent hover:border-brand-200 hover:bg-stone-50/50'} transition-colors`}>
      <div className="absolute -left-10 top-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" {...attributes} {...listeners} className="flex h-8 w-8 items-center justify-center rounded bg-white border border-stone-200 text-stone-500 hover:text-stone-900 shadow-sm cursor-grab active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button>
        <button type="button" onClick={() => onRemove(block.id)} className="flex h-8 w-8 items-center justify-center rounded bg-white border border-stone-200 text-red-500 hover:bg-red-50 shadow-sm"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="p-4" onClick={() => onEdit(block.id)}>
        <div className="pointer-events-none">
          <EventContentBlocks blocks={[block]} />
        </div>
        {(!(block as any).url && !(block as any).text && !(block as any).title && !(block as any).label && block.type !== 'image') && <div className="py-8 text-center text-sm font-semibold text-stone-400 uppercase tracking-widest border border-dashed border-stone-300 rounded bg-stone-50/50">{block.type} Block (Empty)</div>}
        {(block.type === 'image' && !(block as any).url) && <div className="py-12 text-center text-sm font-semibold text-stone-400 uppercase tracking-widest border border-dashed border-stone-300 rounded bg-stone-50/50 flex flex-col items-center justify-center gap-2"><ImageIcon className="h-6 w-6 opacity-50" />Image Block (Empty)</div>}
      </div>
    </div>
  );
});
