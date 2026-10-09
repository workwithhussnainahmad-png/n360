"use client";

import { createContext, startTransition, useContext, useRef, useState, type ComponentProps } from 'react';
import { ApiError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/validation-errors';
import { toast } from './toaster';

const ActionPending = createContext(false);
export const useActionPending = () => useContext(ActionPending);
const ActionErrors = createContext<Record<string, string[]>>({});
export const useActionFieldError = (name?: string) => useContext(ActionErrors)[name || '']?.join(' ');

type Props = Omit<ComponentProps<'form'>, 'action'> & {
  action: (data: FormData) => unknown | Promise<unknown>;
  onFailure?: () => void;
};

/** Failed submissions retain values; only successful submissions reset the form. */
export function ActionForm({ action, children, onSubmit, onChange, onFailure, ...props }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const running = useRef(false);
  function submit(event: Parameters<NonNullable<ComponentProps<'form'>['onSubmit']>>[0]) {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (running.current) return;
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(form, submitter);
    running.current = true;
    setPending(true); setError(''); setFieldErrors({});
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result && typeof result === 'object' && 'ok' in result && result.ok === false) throw new ApiError(400, result);
        if (result && typeof result === 'object' && 'ok' in result && result.ok === true) form.reset();
      } catch (cause) {
        const message = apiErrorMessage(cause);
        setError(message);
        if (cause instanceof ApiError) setFieldErrors(cause.fieldErrors);
        toast({ title: 'Check your submission', description: message, variant: 'destructive' });
        onFailure?.();
      } finally { running.current = false; setPending(false); }
    });
  }
  return <form {...props} onSubmit={submit} onChange={event => { setError(''); setFieldErrors({}); onChange?.(event); }} aria-busy={pending}>
    <ActionPending.Provider value={pending}>
      <ActionErrors.Provider value={fieldErrors}>
        <fieldset disabled={pending} className="m-0 min-w-0 border-0 p-0 [display:contents]">{children}</fieldset>
        {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">{error}</p>}
      </ActionErrors.Provider>
    </ActionPending.Provider>
  </form>;
}
