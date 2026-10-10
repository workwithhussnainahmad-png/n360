'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, Tablet, Smartphone } from 'lucide-react';
export function ResponsivePreview({ children, title }: { children: ReactNode; title: string }) {
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'phone'>('desktop');
  const [document, setDocument] = useState<Document | null>(null);
  useEffect(() => {
    if (!document) return;
    const head = document.head;
    const nodes = Array.from(window.document.querySelectorAll('style, link[rel="stylesheet"]')).map((node) => node.cloneNode(true));
    nodes.forEach((node) => head.appendChild(node));
    return () => nodes.forEach((node) => node.parentNode?.removeChild(node));
  }, [document]);
  return <div className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-white p-3"><span className="text-xs font-semibold text-stone-600">Preview · unsaved changes</span><div className="flex gap-1">{([{ id: 'desktop', Icon: Monitor }, { id: 'tablet', Icon: Tablet }, { id: 'phone', Icon: Smartphone }] as const).map(({ id, Icon }) => <button key={id} type="button" aria-label={id + ' preview'} aria-pressed={device === id} className={'rounded p-2 ' + (device === id ? 'bg-brand-100 text-brand-800' : 'text-stone-500')} onClick={() => setDevice(id)}><Icon size={18} /></button>)}</div></div>
    <div className="overflow-x-auto p-2 sm:p-4"><iframe title={title} className="mx-auto block min-h-[620px] border-0 bg-white" style={{ width: device === 'phone' ? 390 : device === 'tablet' ? 768 : '100%', maxWidth: device === 'desktop' ? '100%' : undefined }} srcDoc={'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*,*::before,*::after{box-sizing:border-box}</style></head><body></body></html>'} onLoad={(event) => { const doc = event.currentTarget.contentDocument; if (doc) { doc.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) e.preventDefault(); }); setDocument(doc); } }} />{document && createPortal(children, document.body)}</div>
  </div>;
}
