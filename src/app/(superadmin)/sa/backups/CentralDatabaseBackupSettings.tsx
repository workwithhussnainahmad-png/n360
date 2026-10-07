'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function CentralDatabaseBackupSettings() {
  const [password, setPassword] = useState('');
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch('/api/sa/central-backup/settings').then((r) => r.json()).then((v) => setConfigured(Boolean(v.configured))).catch(() => undefined); }, []);
  async function save() {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch('/api/sa/central-backup/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save password');
      setConfigured(true); setPassword(''); setMessage('Database backup password saved securely.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save password'); }
    finally { setSaving(false); }
  }
  return <Card>
    <CardHeader><CardTitle className="text-lg">Central database backup security</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-stone-600">Set the password used to encrypt database backups before they are uploaded to the administrator Google Drive.</p>
      {configured ? (
        <div className="rounded-md bg-stone-50 p-4 border border-border">
          <p className="text-sm font-medium text-stone-900 mb-1">Status: Password Configured</p>
          <p className="text-sm text-stone-500">The central database backup password is securely set and cannot be changed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-medium text-stone-700">Status: Not configured</p>
          <div className="flex max-w-xl gap-3">
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={14} maxLength={200} placeholder="At least 14 characters" className="h-10 flex-1 rounded-md border border-border bg-white px-3 text-sm" />
            <Button onClick={() => void save()} disabled={saving || password.length < 14}>{saving ? 'Saving…' : 'Save password'}</Button>
          </div>
          {message && <p className="text-sm text-stone-700" role="status">{message}</p>}
        </div>
      )}
    </CardContent>
  </Card>;
}
