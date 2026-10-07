'use client';

import { FormEvent, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type InstitutionPublicSiteControlProps = {
  institutionId: number;
  institutionStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  initialSlug: string | null;
  initialEnabled: boolean;
  baseDomain: string;
};

export function InstitutionPublicSiteControl({
  institutionId,
  institutionStatus,
  initialSlug,
  initialEnabled,
  baseDomain,
}: InstitutionPublicSiteControlProps) {
  const [slug, setSlug] = useState(initialSlug || '');
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const approved = institutionStatus === 'APPROVED';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/employee/institutions/${institutionId}/public-site`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicSlug: slug, publicSiteEnabled: enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save public-site settings');

      setSlug(data.publicSlug);
      setEnabled(data.publicSiteEnabled);
      setMessage({ kind: 'success', text: `Saved. Public URL: ${data.publicUrl}` });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Unable to save public-site settings' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border bg-stone-50/50">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Globe2 className="h-5 w-5 text-brand-600" />
          Public institution website
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={save} className="space-y-5">
          <div>
            <label htmlFor={`public-slug-${institutionId}`} className="mb-1 block text-sm font-medium text-stone-700">Subdomain</label>
            <div className="flex rounded-md border border-border bg-white focus-within:ring-2 focus-within:ring-brand-500">
              <input
                id={`public-slug-${institutionId}`}
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/\s+/g, '-'))}
                minLength={2}
                maxLength={30}
                pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                required
                disabled={!approved || saving}
                className="min-w-0 flex-1 rounded-l-md bg-transparent px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:bg-stone-100"
                placeholder="ncs"
              />
              <span className="flex items-center border-l border-border bg-stone-50 px-3 text-sm text-stone-500">.{baseDomain}</span>
            </div>
            <p className="mt-2 text-xs text-stone-500">Assign this only after the institution&apos;s payment and approval have been verified.</p>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-border p-4">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              disabled={!approved || !slug || saving}
              className="mt-1 h-4 w-4 accent-brand-700"
            />
            <span>
              <span className="block text-sm font-semibold text-stone-900">Publish website</span>
              <span className="mt-1 block text-xs leading-5 text-stone-500">When disabled, the subdomain remains reserved but its website returns not found.</span>
            </span>
          </label>

          {!approved && <p className="text-sm text-amber-700">Approve this institution before provisioning its website.</p>}
          {message && (
            <p role="status" className={`text-sm ${message.kind === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>{message.text}</p>
          )}

          <Button type="submit" disabled={!approved || saving}>{saving ? 'Saving...' : 'Save public website'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
