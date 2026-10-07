'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/toaster';

export function CampusReadOnlyBoundary({ children, readOnly, campusName, homeCampusName }: {
  children: React.ReactNode; readOnly: boolean; campusName: string; homeCampusName: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [switching, setSwitching] = useState(false);
  const { toast } = useToast();
  async function returnHome() {
    if (switching) return;
    setSwitching(true);
    try {
      await api.post('/api/institution/campus-view', { returnHome: true });
      window.location.assign(new URL('/institution/dashboard', window.location.origin).href);
    } catch (error) {
      toast({ title: 'Could not switch campus', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
      setSwitching(false);
    }
  }
  useEffect(() => {
    document.documentElement.dataset.campusReadOnly = String(readOnly);
    if (!readOnly) return () => { delete document.documentElement.dataset.campusReadOnly; };
    const disabled = new Set<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>();
    const disableForms = () => {
      document.querySelectorAll<HTMLFormElement>('form:not([data-campus-view-control]):not([method="get"])').forEach((form) => {
        form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input,button,select,textarea').forEach((control) => {
          if (!control.disabled) { disabled.add(control); control.disabled = true; }
        });
      });
      document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        const label = button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent ?? '';
        if (!button.disabled && /^(add|create|edit|update|delete|remove|save|submit|approve|reject|verify|publish|unpublish|upload|reset password|promote|mark |record |enable |disable )\b/i.test(label.trim())) {
          disabled.add(button); button.disabled = true;
        }
      });
    };
    disableForms();
    const observer = new MutationObserver(disableForms);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    return () => {
      observer.disconnect(); disabled.forEach((control) => { control.disabled = false; });
      delete document.documentElement.dataset.campusReadOnly;
    };
  }, [readOnly]);
  return <div ref={container}>
    {readOnly && <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p><strong>{campusName} — Read-only view.</strong> You can make changes only in {homeCampusName}.</p>
      <button type="button" onClick={() => void returnHome()} disabled={switching} className="font-semibold underline disabled:cursor-wait disabled:opacity-60">
        {switching ? 'Switching campus…' : `Switch to ${homeCampusName}`}
      </button>
    </div>}
    {children}
  </div>;
}
