'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, CheckCircle2, Download, FileDown, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Institution = { id: number; name: string; username: string };
type Backup = {
  id: number; backupType: 'DAILY' | 'MONTHLY' | 'MANUAL' | 'EXPORT'; status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  fileSize: number | null; recordCount: number | null; tableCount: number | null; error: string | null;
  attemptCount: number;
  createdAt: string; completedAt: string | null;
};

function bytes(value: number | null) {
  if (!value) return '—';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function InstitutionBackupsClient({ institutions, initialInstitutionId, basePath = "/sa/backups", canDownload = false }: { institutions: Institution[]; initialInstitutionId?: number; basePath?: string; canDownload?: boolean }) {
  const router = useRouter();
  const [institutionId, setInstitutionId] = useState(initialInstitutionId ?? institutions[0]?.id ?? 0);
  const [items, setItems] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState<'MANUAL' | 'EXPORT' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!institutionId) return;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/sa/institution-backups?institutionId=${institutionId}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load backups');
      setItems(payload.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load backups');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!items.some((item) => item.status === 'PENDING' || item.status === 'RUNNING')) return;
    const timer = window.setInterval(() => { void load(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [items, load]);

  async function create(type: 'MANUAL' | 'EXPORT') {
    setCreating(type); setMessage(null);
    try {
      const response = await fetch('/api/sa/institution-backups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ institutionId, backupType: type }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not queue backup');
      setMessage(type === 'EXPORT' ? 'Institution-safe export queued.' : 'Recovery backup queued.');
      await load(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not queue backup');
    } finally { setCreating(null); }
  }

  async function verify(id: number) {
    setMessage('Verifying backup contents and checksum…');
    const response = await fetch(`/api/sa/institution-backups/${id}/verify`, { method: 'POST' });
    const payload = await response.json();
    setMessage(response.ok && payload.valid ? 'Backup verified successfully.' : payload.error || 'Backup verification failed.');
  }

  return <div className="space-y-6">
    <Card>
      <CardHeader className="border-b border-border bg-stone-50/50">
        <CardTitle className="flex items-center gap-2 text-lg"><Archive className="h-5 w-5 text-brand-600" /> Institution backup controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-6">
        <div className="max-w-xl">
          <label htmlFor="backup-institution" className="mb-2 block text-sm font-medium text-stone-700">Institution</label>
          <select id="backup-institution" value={institutionId} onChange={(event) => {
            const id = Number(event.target.value); setInstitutionId(id); setItems([]); setMessage(null);
            router.replace(`${basePath}?institutionId=${id}`, { scroll: false });
          }} className="h-11 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500">
            {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name} ({institution.username})</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void create('MANUAL')} disabled={!institutionId || creating !== null}>
            {creating === 'MANUAL' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Create recovery backup
          </Button>
          <Button variant="outline" onClick={() => void create('EXPORT')} disabled={!institutionId || creating !== null}>
            {creating === 'EXPORT' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />} Create institution-safe export
          </Button>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          Recovery backups contain authentication hashes and are for internal restoration only. Give institutions only an <strong>EXPORT</strong> package, which removes sensitive authentication fields.
        </div>
        {message && <p className="text-sm text-stone-700" role="status">{message}</p>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="border-b border-border"><CardTitle className="text-lg">Available versions</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-stone-50 text-xs uppercase text-stone-500"><tr>
              <th className="px-5 py-3 font-medium">Created</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Records</th><th className="px-5 py-3 font-medium">Size</th><th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {!loading && items.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-stone-500">No backup versions are available yet.</td></tr>}
              {items.map((item) => <tr key={item.id} className="align-top hover:bg-stone-50/50">
                <td className="px-5 py-4 whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td>
                <td className="px-5 py-4 font-medium">{item.backupType}</td>
                <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5">
                  {item.status === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : item.status === 'FAILED' ? <XCircle className="h-4 w-4 text-red-600" /> : <Loader2 className="h-4 w-4 animate-spin text-amber-600" />}
                  {item.status}</span>{item.attemptCount > 1 && <span className="ml-2 text-xs text-stone-500">Attempt {item.attemptCount}/3</span>}{item.error && <p className="mt-1 max-w-xs text-xs text-red-600">{item.error}</p>}</td>
                <td className="px-5 py-4">{item.recordCount?.toLocaleString() ?? '—'}{item.tableCount ? <span className="block text-xs text-stone-500">{item.tableCount} tables</span> : null}</td>
                <td className="px-5 py-4">{bytes(item.fileSize)}</td>
                <td className="px-5 py-4"><div className="flex justify-end gap-2">
                  {canDownload && item.status === 'COMPLETED' && <><Button size="sm" variant="outline" onClick={() => void verify(item.id)}>Verify</Button>
                  <Button size="sm" asChild><a href={`/api/sa/institution-backups/${item.id}/download`}><Download className="mr-1.5 h-4 w-4" /> Download</a></Button></>}
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  </div>;
}
