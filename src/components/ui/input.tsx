"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import { nativeValidationMessage } from "@/lib/validation-errors";
import { useActionFieldError } from './action-form';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, onInvalid, onChange, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);
    const [validationMessage, setValidationMessage] = React.useState("");
    const actionError = useActionFieldError(props.name);
    const message = error || validationMessage || actionError;
    const errorId = React.useId();
    const isPassword = type === "password";

    return (
      <div className="flex min-w-0 w-full flex-col gap-1.5">
        <div className="relative min-w-0">
          <input
            type={isPassword ? (showPassword ? "text" : "password") : type}
            className={cn(
              "flex h-11 w-full rounded-sm border border-border bg-surface px-3.5 py-2 text-sm text-brand-950 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-semibold placeholder:text-stone-400 hover:border-stone-400 focus-ring disabled:cursor-not-allowed disabled:bg-stone-100 disabled:opacity-60",
              isPassword && "pr-10",
              message && "border-danger focus-visible:ring-danger",
              className
            )}
            ref={ref}
            {...props}
            aria-invalid={message ? true : props['aria-invalid']}
            aria-describedby={[props['aria-describedby'], message ? errorId : null].filter(Boolean).join(' ') || undefined}
            onInvalid={(event) => { setValidationMessage(nativeValidationMessage(event.currentTarget)); onInvalid?.(event); }}
            onChange={(event) => { setValidationMessage(""); onChange?.(event); }}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 focus:outline-none focus:text-stone-600 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {message && <span id={errorId} role="alert" className="text-xs text-danger animate-fade-in">{message}</span>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
