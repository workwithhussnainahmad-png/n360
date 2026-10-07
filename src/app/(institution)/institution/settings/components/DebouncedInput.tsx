import { useState, useEffect, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type DebouncedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string | null;
  onChange: (value: string) => void;
  debounceMs?: number;
};

export function DebouncedInput({ value: initialValue, onChange, debounceMs = 300, ...props }: DebouncedInputProps) {
  const [value, setValue] = useState(initialValue || '');
  
  useEffect(() => { setValue(initialValue || ''); }, [initialValue]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (value !== (initialValue || '')) { onChange(value); }
    }, debounceMs);
    return () => clearTimeout(handler);
  }, [value, initialValue, onChange, debounceMs]);

  return <input value={value} onChange={e => setValue(e.target.value)} {...props} />;
}

type DebouncedTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string | null;
  onChange: (value: string) => void;
  debounceMs?: number;
};

export function DebouncedTextarea({ value: initialValue, onChange, debounceMs = 300, ...props }: DebouncedTextareaProps) {
  const [value, setValue] = useState(initialValue || '');
  
  useEffect(() => { setValue(initialValue || ''); }, [initialValue]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (value !== (initialValue || '')) { onChange(value); }
    }, debounceMs);
    return () => clearTimeout(handler);
  }, [value, initialValue, onChange, debounceMs]);

  return <textarea value={value} onChange={e => setValue(e.target.value)} {...props} />;
}
