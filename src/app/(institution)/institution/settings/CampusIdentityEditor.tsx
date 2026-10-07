'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';

export function CampusIdentityEditor({ registrationNumber }: { registrationNumber: string }) {
  const [value, setValue] = useState(registrationNumber);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  return <form className="space-y-3" onSubmit={async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch('/api/institution/settings', { registrationNumber: value });
      toast({ title: 'Campus registration number saved', variant: 'success' });
      router.refresh();
    } catch (error) {
      toast({ title: 'Could not save campus profile', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally { setSaving(false); }
  }}>
    <label className="block space-y-2 text-sm font-medium">Campus Registration No.<Input value={value} onChange={(event) => setValue(event.target.value)} maxLength={100} /></label>
    <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save registration number'}</Button>
  </form>;
}
