import React, { ReactNode, useRef } from 'react';
import { CircleHelp } from 'lucide-react';

function scrollContainerFor(element: HTMLElement | null) {
  let parent = element?.parentElement || null;
  while (parent) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight) return parent;
    parent = parent.parentElement;
  }
  return null;
}

export function preserveElementPosition(element: HTMLElement | null, update: () => void) {
  const scrollContainer = scrollContainerFor(element);
  const top = element?.getBoundingClientRect().top;
  update();
  if (!element || !scrollContainer || top === undefined) return;
  window.requestAnimationFrame(() => {
    if (!element.isConnected) return;
    scrollContainer.scrollTop += element.getBoundingClientRect().top - top;
  });
}

export const EditorSection = React.memo(function EditorSection({ sectionKey, title, description, guide, open, onToggle, children }: { sectionKey: string; title: string; description: string; guide: ReactNode; open: boolean; onToggle: (key: string) => void; children: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  return <section ref={sectionRef} data-editor-section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
    <button type="button" aria-expanded={open} aria-controls={`public-website-section-${sectionKey}`} onClick={() => preserveElementPosition(sectionRef.current, () => onToggle(sectionKey))} className="w-full cursor-pointer px-5 py-4 text-left transition hover:bg-stone-50">
      <span className="flex items-center justify-between gap-4"><span><span className="block font-semibold text-stone-900">{title}</span><span className="mt-1 block text-xs leading-5 text-stone-500">{description}</span></span><span aria-hidden="true" className={`text-xl text-stone-400 transition-transform ${open ? 'rotate-45' : ''}`}>+</span></span>
    </button>
    {open && <div id={`public-website-section-${sectionKey}`} className="border-t border-stone-200 bg-stone-50/40 p-5"><details className="mb-5 rounded-lg border border-brand-100 bg-brand-50"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wide text-brand-950"><CircleHelp className="h-4 w-4" />What should I add?</summary><div className="border-t border-brand-100 px-4 py-3 text-sm leading-6 text-stone-600">{guide}</div></details>{children}</div>}
  </section>;
});
