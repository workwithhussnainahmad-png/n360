import { useEffect, useState, useCallback } from 'react';
import { Settings2 } from 'lucide-react';
import type { PublicEventBlock } from '@/lib/public-events';
import { ImageUploader } from './ImageUploader';

const inputClass = 'w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

export function BlockSettings({ block, update }: { block: PublicEventBlock; update: (b: PublicEventBlock) => void }) {
  const label = block.type === 'heading' ? 'Heading' : block.type === 'paragraph' ? 'Text' : block.type === 'image' ? 'Image' : block.type === 'callout' ? 'Highlight box' : block.type === 'schedule' ? 'Schedule item' : 'Button';
  
  // Local state for debouncing inputs to prevent re-rendering the main canvas on every keystroke
  const [localBlock, setLocalBlock] = useState(block);
  
  // Update local block when incoming block changes (e.g. selected another block)
  useEffect(() => {
    setLocalBlock(block);
  }, [block]);

  const debouncedBlock = useDebounce(localBlock, 300);

  // Notify parent of updates after debounce
  useEffect(() => {
    if (debouncedBlock !== block) {
      update(debouncedBlock);
    }
  }, [debouncedBlock, update, block]);

  const handleChange = useCallback((updates: Partial<PublicEventBlock>) => {
    setLocalBlock(prev => ({ ...prev, ...updates }) as PublicEventBlock);
  }, []);

  return (
    <div className="space-y-4 animate-in slide-in-from-right-2 duration-200">
      <div className="mb-4 pb-2 border-b border-stone-200 flex items-center gap-2"><Settings2 className="h-4 w-4 text-stone-400" /><h3 className="font-semibold text-stone-900">{label} Settings</h3></div>
      {localBlock.type === 'heading' && <input value={localBlock.text} onChange={(e) => handleChange({ text: e.target.value })} maxLength={200} placeholder="Section heading" className={inputClass} />}
      {localBlock.type === 'paragraph' && <textarea value={localBlock.text} onChange={(e) => handleChange({ text: e.target.value })} maxLength={4000} rows={10} placeholder="Write the event details here..." className={`${inputClass} resize-y leading-6`} />}
      {localBlock.type === 'image' && <div className="space-y-4"><ImageUploader value={localBlock.url} onChange={(url) => update({ ...localBlock, url })} label="content image" /><label className="block text-sm font-medium text-stone-700">Alt text<input value={localBlock.alt} onChange={(e) => handleChange({ alt: e.target.value })} maxLength={160} placeholder="Image description for accessibility" className={`${inputClass} mt-1`} /></label><label className="block text-sm font-medium text-stone-700">Caption<input value={localBlock.caption} onChange={(e) => handleChange({ caption: e.target.value })} maxLength={240} placeholder="Optional caption" className={`${inputClass} mt-1`} /></label></div>}
      {localBlock.type === 'callout' && <div className="space-y-4"><label className="block text-sm font-medium text-stone-700">Title<input value={localBlock.title} onChange={(e) => handleChange({ title: e.target.value })} maxLength={160} placeholder="Important information" className={`${inputClass} mt-1`} /></label><label className="block text-sm font-medium text-stone-700">Text<textarea value={localBlock.text} onChange={(e) => handleChange({ text: e.target.value })} maxLength={1200} rows={4} placeholder="What should visitors notice?" className={`${inputClass} resize-y mt-1`} /></label></div>}
      {localBlock.type === 'schedule' && <div className="space-y-4"><label className="block text-sm font-medium text-stone-700">Time<input value={localBlock.time} onChange={(e) => handleChange({ time: e.target.value })} maxLength={80} placeholder="10:00 AM" className={`${inputClass} mt-1`} /></label><label className="block text-sm font-medium text-stone-700">Title<input value={localBlock.title} onChange={(e) => handleChange({ title: e.target.value })} maxLength={160} placeholder="Opening ceremony" className={`${inputClass} mt-1`} /></label><label className="block text-sm font-medium text-stone-700">Description<textarea value={localBlock.description} onChange={(e) => handleChange({ description: e.target.value })} maxLength={600} rows={3} placeholder="Optional schedule details" className={`${inputClass} resize-y mt-1`} /></label></div>}
      {localBlock.type === 'button' && <div className="space-y-4"><label className="block text-sm font-medium text-stone-700">Button label<input value={localBlock.label} onChange={(e) => handleChange({ label: e.target.value })} maxLength={80} placeholder="Register now" className={`${inputClass} mt-1`} /></label><label className="block text-sm font-medium text-stone-700">URL link<input value={localBlock.url} onChange={(e) => handleChange({ url: e.target.value })} maxLength={500} placeholder="/admissions or https://..." className={`${inputClass} mt-1`} /></label></div>}
    </div>
  );
}
