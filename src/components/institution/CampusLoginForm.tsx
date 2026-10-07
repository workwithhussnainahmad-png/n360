'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';

export function CampusLoginForm({ existingCampus, endpoint = '/api/institution/campuses', allowCreate = true }: { existingCampus?: { id: number; name: string; address: string | null }; endpoint?: string; allowCreate?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<{ loginEmail: string; defaultPassword: string } | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      const result = await api.post<{ loginEmail: string; defaultPassword: string }>(endpoint, {
        name: existingCampus?.name ?? data.get('name'), address: data.get('address'), loginEmail: data.get('loginEmail'), registrationNumber: data.get('registrationNumber'),
        ...(existingCampus ? { existingCampusId: existingCampus.id } : {}),
      });
      setCredentials(result);
      if (!existingCampus) form.reset();
      toast({ title: 'Campus login created', description: 'The campus must change its default password after first login.', variant: 'success' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not create campus login', description: error instanceof Error ? error.message : 'Check the campus details.', variant: 'destructive' });
    } finally { setBusy(false); }
  }
  return <div className="space-y-4">
    {credentials && <div role="status" className="border border-green-300 bg-green-50 p-4 text-sm text-green-950">
      <p className="font-semibold">Campus login created</p><p>Email: {credentials.loginEmail}</p><p>Default password: <code>{credentials.defaultPassword}</code></p>
      <p className="mt-2">Use Institution login. A new password is required before accessing the dashboard.</p>
    </div>}
    {!credentials && allowCreate && <form onSubmit={submit} className="space-y-4">
      {!existingCampus && <label className="block space-y-1 text-sm font-medium">Campus Name<Input name="name" required minLength={2} maxLength={255} placeholder="e.g. Green Campus" /></label>}
      <label className="block space-y-1 text-sm font-medium">Address<Input name="address" required minLength={2} maxLength={2000} defaultValue={existingCampus?.address ?? ''} /></label>
      <label className="block space-y-1 text-sm font-medium">Login Email<Input name="loginEmail" type="email" required maxLength={255} autoComplete="off" /></label>
      <label className="block space-y-1 text-sm font-medium">Campus Registration No.<Input name="registrationNumber" maxLength={100} placeholder="This campus's registration number" /></label>
      <p className="text-xs text-stone-500">Default password: <code>1234567890</code>. The campus must change it on first login.</p>
      <Button type="submit" disabled={busy}>{busy ? 'Creating…' : existingCampus ? 'Set up login' : 'Create Campus'}</Button>
    </form>}
    {credentials && !existingCampus && allowCreate && <Button variant="outline" onClick={() => setCredentials(null)}>Add another campus</Button>}
  </div>;
}
