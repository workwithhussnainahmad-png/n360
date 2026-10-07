'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { RestorePreview } from '@/lib/institution-restore-engine';

type RequestItem = {
  id: number; institution_name: string; status: string; backup_generated_at: string;
  preview: RestorePreview | null; preview_hash: string | null; error: string | null;
  recovery_available: boolean; created_at: string;
};
const labels: Record<string, string> = {
  PREVIEW_PENDING: 'Preview queued', PREVIEW_RUNNING: 'Preparing preview', AWAITING_APPROVAL: 'Owner approval needed',
  APPROVED: 'Approved by owner', EXECUTION_PENDING: 'Restore queued', EXECUTION_RUNNING: 'Restoring',
  CACHE_PENDING: 'Data restored; finishing cleanup', COMPLETED: 'Completed', FAILED: 'Failed', REJECTED: 'Cancelled',
};
function displayTable(table: string) { return table.replaceAll('_', ' '); }
function date(value: string) { return new Date(value).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }); }

export function InstitutionRestoreRequests({ administrator = false, institutions = [], embedded = false }: { administrator?: boolean; institutions?: { id: number; name: string }[]; embedded?: boolean }) {
  const base = administrator ? '/api/sa/restore-requests' : '/api/institution/restore-requests';
  const [institutionId, setInstitutionId] = useState(0);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState<Record<number, boolean>>({});
  const load = useCallback(async () => {
    const response = await fetch(institutionId ? `${base}?institutionId=${institutionId}` : base, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load restore requests.');
    setItems(data.items);
  }, [base, institutionId]);
  useEffect(() => {
    const reload = () => { void load().catch(error => setMessage(error instanceof Error ? error.message : 'Could not load requests.')); };
    const initial = window.setTimeout(reload, 0);
    const interval = window.setInterval(reload, 10_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [load]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size > 16 * 1024 * 1024) { setMessage('Choose a ZIP no larger than 16 MB.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch(base, { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Upload failed.');
      form.reset();
      setMessage(`Request #${result.id} submitted. The preview will appear here when ready.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed.'); }
    finally { setBusy(false); }
  }
  async function action(item: RequestItem, value: string) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${base}/${item.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: value, previewHash: item.preview_hash }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Request failed.');
      setConsent(previous => ({ ...previous, [item.id]: false }));
      setMessage(value === 'recovery' ? `Recovery request #${result.id} created. The owner must approve its preview.` : 'Request updated.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed.'); }
    finally { setBusy(false); }
  }
  const content = <div className="min-w-0 space-y-6">
      <p className="text-sm text-stone-600">Restore academic and learning records from a Google Drive backup. Current accounts, class structure, admissions and payment records are preserved. The campus primary account reviews and approves the preview; a platform admin executes the approved restore.</p>
      {administrator && <label className="block text-sm font-medium">Filter requests by institution
        <select value={institutionId} onChange={event => { setInstitutionId(Number(event.target.value)); setItems([]); }} className="mt-2 block w-full max-w-md rounded-md border px-3 py-2">
          <option value={0}>All institutions</option>{institutions.map(institution => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
        </select>
      </label>}
      {!administrator && <form onSubmit={upload} className="space-y-3 rounded-md border p-4">
        <label className="block text-sm font-medium">Original Google Drive backup ZIP (maximum 16 MB)
          <input name="file" type="file" accept=".zip,application/zip" required disabled={busy} className="mt-2 block w-full text-sm" />
        </label>
        <label className="block text-sm font-medium">Archive password
          <input name="password" type="password" required maxLength={200} autoComplete="off" disabled={busy} className="mt-2 block w-full max-w-md rounded-md border px-3 py-2" />
        </label>
        <p className="text-xs text-stone-500">The password is used to open this upload and is not saved. Only one active restore request is allowed.</p>
        <Button disabled={busy} type="submit">Submit restore request</Button>
      </form>}
      {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}
      <Button variant="outline" disabled={busy} onClick={() => void load().catch(error => setMessage(error.message))}>Refresh requests</Button>
      {items.length === 0 && <p className="text-sm text-stone-500">No restore requests.</p>}
      {items.map(item => <section key={item.id} className="space-y-4 rounded-md border p-4">
        <div className="flex flex-wrap justify-between gap-2">
          <h3 className="font-semibold">#{item.id}{administrator ? ` · ${item.institution_name}` : ''}</h3>
          <span className="text-sm font-medium">{labels[item.status] ?? item.status}</span>
        </div>
        <p className="text-xs text-stone-500">Backup: {date(item.backup_generated_at)} · Requested: {date(item.created_at)} (Pakistan time)</p>
        {item.error && <p className="text-sm text-amber-800">{item.error}</p>}
        {item.preview && <details open={['AWAITING_APPROVAL','APPROVED'].includes(item.status)}>
          <summary className="cursor-pointer text-sm font-medium">Review replacement preview</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm"><thead><tr><th className="p-2">Records</th><th className="p-2">Current</th><th className="p-2">After restore</th></tr></thead>
              <tbody>{item.preview.tables.map(table => <tr key={table.table} className="border-t"><td className="p-2 capitalize">{displayTable(table.table)}</td><td className="p-2">{table.current}</td><td className="p-2">{table.replacement}</td></tr>)}</tbody>
            </table>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-600">{item.preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
          <p className="mt-3 text-xs text-stone-500">{item.preview.mediaReferences} media references. Preserved backup categories: {item.preview.preservedTables.map(displayTable).join(', ')}.</p>
        </details>}
        {((!administrator && item.status === 'AWAITING_APPROVAL') || (administrator && item.status === 'APPROVED')) && <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent[item.id] ?? false} onChange={event => setConsent(previous => ({ ...previous, [item.id]: event.target.checked }))} />
            <span>{administrator ? 'I reviewed this institution-approved preview and authorize replacement of the listed records. A recovery snapshot will be retained for 30 days.' : 'I reviewed this preview and understand that current records in the listed categories will be replaced, including newer records.'}</span>
          </label>
          <Button disabled={busy || !consent[item.id]} onClick={() => void action(item, administrator ? 'execute' : 'approve')}>{administrator ? 'Execute approved restore' : 'Approve this preview'}</Button>
        </div>}
        {['PREVIEW_PENDING','AWAITING_APPROVAL','APPROVED'].includes(item.status) && <Button variant="outline" disabled={busy} onClick={() => void action(item, 'reject')}>{administrator ? 'Reject request' : 'Cancel request'}</Button>}
        {administrator && item.status === 'COMPLETED' && item.recovery_available && <Button variant="outline" disabled={busy} onClick={() => void action(item, 'recovery')}>Prepare recovery from pre-restore snapshot</Button>}
      </section>)}
      <p className="text-xs text-stone-500">Showing up to 50 requests, with active requests first. Staged data expires seven days after completion; recovery snapshots expire after 30 days.</p>
    </div>;
  return embedded ? content : <Card className="lg:col-span-2">
    <CardHeader><CardTitle>Institution restore requests</CardTitle></CardHeader>
    <CardContent>{content}</CardContent>
  </Card>;
}
