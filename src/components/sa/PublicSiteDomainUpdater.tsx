'use client';

import { useState } from 'react';
import { updatePublicSiteBaseDomainAction } from '@/app/actions/sa-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';

export function PublicSiteDomainUpdater({ currentDomain }: { currentDomain: string }) {
  const [domain, setDomain] = useState(currentDomain);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();
  async function update() {
    setPending(true);
    try {
      const result = await updatePublicSiteBaseDomainAction(domain);
      setDomain(result.domain);
      toast({ title: 'Public website domain updated', description: `Institution links will use .${result.domain}.` });
    } catch (error) {
      toast({ title: 'Unable to update domain', description: error instanceof Error ? error.message : 'Try again.', variant: 'destructive' });
    } finally { setPending(false); }
  }
  return <Card><CardHeader><CardTitle>Institution website domain</CardTitle><CardDescription>Controls generated institution homepage links and QR codes. Configure wildcard DNS and TLS before changing it.</CardDescription></CardHeader><CardContent className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"><Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="nisaab360.app" aria-label="Institution website base domain" /><Button onClick={update} disabled={pending || domain.trim().toLowerCase() === currentDomain}>{pending ? 'Updating...' : 'Update domain'}</Button></CardContent></Card>;
}
