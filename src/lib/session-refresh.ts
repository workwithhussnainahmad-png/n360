// One refresh owner for background renewal and concurrent API 401 retries.
let pending: Promise<void> | null = null;
export function refreshSession(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch('/api/auth/refresh', { method: 'POST', signal: controller.signal });
      if (!response.ok) throw new Error('Session expired. Please sign in again.');
    } finally { clearTimeout(timeout); }
  })().finally(() => { pending = null; });
  return pending;
}
