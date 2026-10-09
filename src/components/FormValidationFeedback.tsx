"use client";

import { useEffect } from 'react';
import { toast } from '@/components/ui/toaster';
import { fieldLabel, nativeValidationMessage } from '@/lib/validation-errors';

/** Covers native fields as well as shared controls; invalid events do not bubble. */
export default function FormValidationFeedback() {
  useEffect(() => {
    let queued = false;
    const whitespaceErrors = new WeakSet<HTMLInputElement | HTMLTextAreaElement>();
    const onInvalid = (event: Event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      if (queued) return;
      queued = true;
      const label = field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') || fieldLabel(field.name || field.id);
      toast({ title: 'Check this field', description: `${label}: ${nativeValidationMessage(field)}`, variant: 'destructive' });
      queueMicrotask(() => { queued = false; });
    };
    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      for (const field of Array.from(form.elements)) {
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !field.required || field.disabled) continue;
        if (field instanceof HTMLInputElement && !['text', 'search', 'tel', 'email', 'url'].includes(field.type)) continue;
        if (field.value.trim()) continue;
        field.setCustomValidity('This value is required.');
        whitespaceErrors.add(field);
        event.preventDefault();
        event.stopPropagation();
        field.reportValidity(); field.focus();
        break;
      }
    };
    const onInput = (event: Event) => {
      const field = event.target;
      if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && whitespaceErrors.has(field)) {
        field.setCustomValidity(''); whitespaceErrors.delete(field);
      }
    };
    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('input', onInput, true);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('input', onInput, true);
    };
  }, []);
  return null;
}
