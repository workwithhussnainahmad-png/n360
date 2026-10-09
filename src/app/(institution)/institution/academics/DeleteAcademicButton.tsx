"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AcademicKind } from '@/lib/delete-institution-academic';

export function DeleteAcademicButton({ kind, id, name }: { kind: AcademicKind; id: number; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    if (!window.confirm(`Delete ${kind} "${name}"? Items linked to students or other records cannot be deleted.`)) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(`/api/institution/academics?kind=${kind}&id=${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not delete this item.');
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete this item.');
    } finally { setPending(false); }
  }
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="ghost" size="sm" className="text-red-700 hover:text-red-800" disabled={pending} onClick={remove} aria-label={`Delete ${kind} ${name}`}>
        <Trash2 className="mr-1 h-3.5 w-3.5" />{pending ? 'Deleting…' : 'Delete'}
      </Button>
      {error && <p role="alert" className="max-w-xs text-xs text-red-700">{error}</p>}
    </div>
  );
}
