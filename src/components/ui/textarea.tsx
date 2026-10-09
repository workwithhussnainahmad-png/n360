"use client";

import * as React from "react"

import { cn } from "@/lib/utils"
import { nativeValidationMessage } from "@/lib/validation-errors";
import { useActionFieldError } from './action-form';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { error?: string }
>(({ className, error, onInvalid, onChange, ...props }, ref) => {
  const [validationMessage, setValidationMessage] = React.useState('');
  const actionError = useActionFieldError(props.name);
  const message = error || validationMessage || actionError;
  const errorId = React.useId();
  return (
    <div className="flex min-w-0 w-full flex-col gap-1.5">
    <textarea
      className={cn(
        "flex min-h-[110px] w-full resize-y rounded-sm border border-border bg-surface px-3.5 py-3 text-base text-brand-950 placeholder:text-muted-foreground hover:border-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-60 md:text-sm",
        className,
        message && 'border-danger focus-visible:ring-danger'
      )}
      ref={ref}
      {...props}
      aria-invalid={message ? true : props['aria-invalid']}
      aria-describedby={[props['aria-describedby'], message ? errorId : null].filter(Boolean).join(' ') || undefined}
      onInvalid={event => { setValidationMessage(nativeValidationMessage(event.currentTarget)); onInvalid?.(event); }}
      onChange={event => { setValidationMessage(''); onChange?.(event); }}
    />
    {message && <span id={errorId} role="alert" className="text-xs text-danger">{message}</span>}
    </div>
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
