import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { institutions, publicEvents, systemSettings } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { institutionPublicUrl } from '@/lib/institution-domain';
import { WebsiteEventsManager } from './WebsiteEventsManager';

export default async function WebsiteEventsPage() {
  const session = await getSession();
  if (!session || !['INSTITUTION', 'INSTITUTION_ADMIN'].includes(session.role)) redirect('/institution/dashboard');
  const institutionId = session.institutionId || session.userId;
  const [[institution], events, [settings], requestHeaders] = await Promise.all([
    db.select({ name: institutions.name, publicSlug: institutions.publicSlug, publicSiteEnabled: institutions.publicSiteEnabled }).from(institutions).where(eq(institutions.id, institutionId)).limit(1),
    db.select().from(publicEvents).where(eq(publicEvents.institutionId, institutionId)).orderBy(desc(publicEvents.updatedAt)),
    db.select({ publicSiteBaseDomain: systemSettings.publicSiteBaseDomain }).from(systemSettings).limit(1),
    headers(),
  ]);
  if (!institution) redirect('/institution/dashboard');
  const forwardedProtocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const requestProtocol = forwardedProtocol === 'https' ? 'https:' : 'http:';
  const publicBaseUrl = institution.publicSlug ? institutionPublicUrl(institution.publicSlug, requestHeaders.get('host') || '', requestProtocol, settings?.publicSiteBaseDomain) : null;
  return <WebsiteEventsManager institutionName={institution.name} publicBaseUrl={publicBaseUrl} publicSiteEnabled={institution.publicSiteEnabled} initialEvents={events.map((event) => ({ ...event, publishedAt: event.publishedAt?.toISOString() || null, expiresAt: event.expiresAt?.toISOString() || null, createdAt: event.createdAt.toISOString(), updatedAt: event.updatedAt.toISOString() }))} />;
}
