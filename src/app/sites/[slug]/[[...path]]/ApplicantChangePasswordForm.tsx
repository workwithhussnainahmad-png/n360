'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function ApplicantChangePasswordForm({ accentColor }: { accentColor: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    if (data.get('newPassword') !== data.get('confirmPassword')) {
      setError('New passwords do not match');
      setSubmitting(false);
      return;
    }
    try {
      const response = await fetch('/api/public/admissions/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to change password');
      router.replace(result.redirectTo);
      router.refresh();
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : 'Unable to change password');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'mt-1 w-full rounded-md border border-black/15 px-3 py-2.5 font-normal outline-none focus:ring-2';
  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-semibold">Temporary/current password<input name="currentPassword" type="password" required minLength={8} maxLength={128} autoComplete="current-password" className={inputClass} /></label>
      <label className="block text-sm font-semibold">New password<input name="newPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={inputClass} /></label>
      <label className="block text-sm font-semibold">Confirm new password<input name="confirmPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={inputClass} /></label>
      {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={submitting} className="w-full rounded-lg px-5 py-3 text-sm font-bold text-white disabled:opacity-60" style={{ backgroundColor: accentColor }}>{submitting ? 'Saving...' : 'Set new password'}</button>
    </form>
  );
}
