'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/ui/toaster';

export function CampusSwitcher({ campuses, currentCampusId, homeCampusId }: {
  campuses: Array<{ id: number; name: string }>; currentCampusId: number; homeCampusId: number;
}) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  async function switchCampus(campusId: number) {
    setBusy(true);
    try {
      await api.post('/api/institution/campus-view', { campusId });
      // Clear page, query and dialog state together when changing workspaces.
      window.location.assign(new URL('/institution/dashboard', window.location.origin).href);
    } catch (error) {
      toast({ title: 'Could not switch campus', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
      setBusy(false);
    }
  }
  return <div className="min-w-52 space-y-1">
    <label htmlFor="campus-switcher" className="block text-sm font-medium text-stone-700">View campus</label>
    <select id="campus-switcher" aria-label="View campus" value={currentCampusId} disabled={busy}
      onChange={(event) => void switchCampus(Number(event.target.value))}
      className="h-10 w-full rounded-sm border border-stone-300 bg-white px-3 text-sm">
      {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}{campus.id === homeCampusId ? ' (your campus)' : ' (read-only)'}</option>)}
    </select>
    <p className="text-xs text-stone-500">{busy ? 'Switching campus…' : currentCampusId === homeCampusId ? 'Manage your campus.' : 'Viewing only. Changes are disabled.'}</p>
  </div>;
}
