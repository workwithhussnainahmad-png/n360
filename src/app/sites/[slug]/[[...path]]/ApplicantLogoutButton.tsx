'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ApplicantLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" disabled={busy} onClick={async () => { setBusy(true); await fetch('/api/public/admissions/auth/logout', { method: 'POST' }); router.replace('/admissions/login'); router.refresh(); }} className="text-sm font-semibold text-stone-600 hover:text-stone-900 disabled:opacity-60">{busy ? 'Logging out...' : 'Log out'}</button>;
}
