import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string | null; onChange: (value: string) => void };
type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value: string | null; onChange: (value: string) => void };
// Keep the document current synchronously; defer only the expensive public preview.
export function WebsiteInput({ value, onChange, ...props }: InputProps) {
  return <input {...props} value={value || ''} onChange={(event) => onChange(event.target.value)} />;
}
export function WebsiteTextarea({ value, onChange, ...props }: TextareaProps) {
  return <textarea {...props} value={value || ''} onChange={(event) => onChange(event.target.value)} />;
}
