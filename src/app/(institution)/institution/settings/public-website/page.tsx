import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowLeft, Globe2 } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { institutionPublicProfiles, institutions, systemSettings } from '@/db/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSession } from '@/lib/auth';
import { institutionPublicUrl } from '@/lib/institution-domain';
import { normalizeWebsiteNotices } from '@/lib/public-website-notices';
import { listPublishedPublicEvents } from '@/lib/public-event-queries';
import { PublicWebsiteEditor } from '../PublicWebsiteEditor';
import { getPublicSiteTheme } from '@/lib/public-site-themes';
import { publicAdmissionsEnabledSql } from '@/lib/public-admissions-availability';

export default async function InstitutionPublicWebsitePage() {
  const session = await getSession();
  if (!session || !['INSTITUTION', 'INSTITUTION_ADMIN'].includes(session.role)) redirect('/institution/dashboard');

  const institutionId = session.institutionId || session.userId;
  const [[institution], [publicProfile], [platformSettings], requestHeaders, publishedEvents] = await Promise.all([
    db.select({
      name: institutions.name,
      type: institutions.type,
      city: institutions.city,
      country: institutions.country,
      logoKey: institutions.logoKey,
      admissionsEnabled: publicAdmissionsEnabledSql,
      parentInstitutionId: institutions.parentInstitutionId,
      publicSlug: institutions.publicSlug,
      publicSiteEnabled: institutions.publicSiteEnabled,
    }).from(institutions).where(eq(institutions.id, institutionId)).limit(1),
    db.select().from(institutionPublicProfiles).where(eq(institutionPublicProfiles.institutionId, institutionId)).limit(1),
    db.select({ publicSiteBaseDomain: systemSettings.publicSiteBaseDomain }).from(systemSettings).limit(1),
    headers(),
    listPublishedPublicEvents(institutionId, 100),
  ]);

  if (!institution) redirect('/login');
  if (institution.parentInstitutionId !== null) redirect('/institution/settings');

  const requestHost = requestHeaders.get('host') || '';
  const requestProtocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() || (requestHost.includes('localhost') ? 'http' : 'https');
  const publicUrl = institution.publicSlug
    ? institutionPublicUrl(institution.publicSlug, requestHost, `${requestProtocol}:`, platformSettings?.publicSiteBaseDomain)
    : null;
  const qrUrl = institution.publicSlug
    ? institutionPublicUrl(institution.publicSlug, undefined, 'https:', platformSettings?.publicSiteBaseDomain)
    : null;

  return (
    <div className="w-full max-w-6xl space-y-6 animate-fade-in">
      <div>
        <Link href="/institution/settings" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-950">
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-stone-50/50">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe2 className="h-5 w-5 text-brand-600" />
            Website information
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 p-4 sm:p-6">
          <PublicWebsiteEditor
            publicSlug={institution.publicSlug}
            publicSiteEnabled={institution.publicSiteEnabled}
            publicUrl={publicUrl}
            qrUrl={qrUrl}
            eventLinks={publishedEvents.map((event) => ({ title: event.title, slug: event.slug }))}
            previewIdentity={{ name: institution.name, type: institution.type, city: institution.city, country: institution.country, logoKey: institution.logoKey, admissionsEnabled: institution.admissionsEnabled }}
            previewEvents={publishedEvents.slice(0, 6)}
            initialProfile={{
              tagline: publicProfile?.tagline || null,
              description: publicProfile?.description || null,
              heroImageUrl: publicProfile?.heroImageUrl || null,
              announcementText: publicProfile?.announcementText || null,
              announcementLink: publicProfile?.announcementLink || null,
              aboutTitle: publicProfile?.aboutTitle || null,
              mission: publicProfile?.mission || null,
              vision: publicProfile?.vision || null,
              principalName: publicProfile?.principalName || null,
              principalTitle: publicProfile?.principalTitle || null,
              principalMessage: publicProfile?.principalMessage || null,
              principalImageUrl: publicProfile?.principalImageUrl || null,
              statistics: publicProfile?.statistics || [],
              programs: publicProfile?.programs || [],
              highlights: publicProfile?.highlights || [],
              galleryImages: publicProfile?.galleryImages || [],
              publicEmail: publicProfile?.publicEmail || null,
              publicPhone: publicProfile?.publicPhone || null,
              publicAddress: publicProfile?.publicAddress || null,
              mapUrl: publicProfile?.mapUrl || null,
              facebookUrl: publicProfile?.facebookUrl || null,
              instagramUrl: publicProfile?.instagramUrl || null,
              youtubeUrl: publicProfile?.youtubeUrl || null,
              websiteNotices: normalizeWebsiteNotices(publicProfile?.websiteNotices),
              theme: getPublicSiteTheme(publicProfile?.theme).id,
              design: publicProfile?.design || {},
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
