'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function ApplicantLoginForm({ accentColor }: { accentColor: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/public/admissions/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to log in');
      router.replace('/admissions/portal');
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to log in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <label className="block text-xs font-bold uppercase tracking-[0.08em]">Parent or guardian email<input name="email" type="email" required maxLength={255} autoComplete="email" placeholder="parent@example.com" className="mt-2 h-12 w-full border border-black/15 bg-white px-4 text-sm font-normal normal-case tracking-normal outline-none transition focus:border-black focus:ring-0" /></label>
      <label className="block text-xs font-bold uppercase tracking-[0.08em]">Password<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="current-password" className="mt-2 h-12 w-full border border-black/15 bg-white px-4 text-sm font-normal normal-case tracking-normal outline-none transition focus:border-black focus:ring-0" /></label>
      {error && <p role="alert" className="border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center px-5 text-sm font-bold text-white transition-opacity disabled:opacity-60" style={{ backgroundColor: accentColor }}>{submitting ? 'Logging in...' : 'Log in to applicant portal'}</button>
      <p className="border-t border-black/10 pt-5 text-sm leading-6 text-black/50">Do not have an applicant account? Your first application creates one automatically. <Link href="/admissions" className="font-bold text-black underline underline-offset-4">Start an application</Link>.</p>
    </form>
  );
}
