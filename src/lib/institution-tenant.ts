import { and, eq, isNull, sql } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/db';
import { institutionPublicProfiles, institutions } from '@/db/schema';
import {
  institutionTenantCacheKey,
  parseInstitutionHostname,
  validateInstitutionSlug,
} from '@/lib/institution-domain';
import { redis, getCachedOrFetch } from '@/lib/redis';
import { CACHE_POLICY, publicProfileCacheKey } from '@/lib/cache-policy';
import { getPublicSiteTheme, type PublicSiteThemeId } from '@/lib/public-site-themes';
import { getPublicSiteBaseDomain } from '@/lib/public-site-domain';
import { normalizeWebsiteNotices, type WebsiteNotices } from '@/lib/public-website-notices';
import { publicAdmissionsEnabledSql } from '@/lib/public-admissions-availability';
import type { WebsiteDesign } from '@/lib/public-site-builder';


export type PublicInstitutionTenant = {
  id: number;
  name: string;
  type: 'SCHOOL' | 'COLLEGE' | 'UNIVERSITY';
  publicSlug: string;
  logoKey: string;
  city: string;
  country: string;
  admissionsEnabled: boolean;
  tagline: string | null;
  description: string | null;
  heroImageUrl: string | null;
  announcementText: string | null;
  announcementLink: string | null;
  aboutTitle: string | null;
  mission: string | null;
  vision: string | null;
  principalName: string | null;
  principalTitle: string | null;
  principalMessage: string | null;
  principalImageUrl: string | null;
  statistics: Array<{ value: string; label: string }>;
  programs: Array<{ title: string; description: string }>;
  highlights: Array<{ title: string; description: string }>;
  galleryImages: Array<{ url: string; caption: string }>;
  publicEmail: string | null;
  publicPhone: string | null;
  publicAddress: string | null;
  mapUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  websiteNotices: WebsiteNotices;
  accentColor: string;
  theme: PublicSiteThemeId;
  design?: WebsiteDesign;
};

type CachedInstitutionTenant = PublicInstitutionTenant & {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  publicSiteEnabled: boolean;
};

export type InstitutionTenantResolution =
  | { kind: 'active'; tenant: PublicInstitutionTenant }
  | { kind: 'unavailable' }
  | { kind: 'not_found' };

// Deduplicate metadata/page reads within a render, never across requests.
// A completed settings save is visible on the next refresh, even without Redis.
export const resolveInstitutionTenant = cache(async (slugInput: string): Promise<InstitutionTenantResolution> => {
  const validation = validateInstitutionSlug(slugInput);
  if (!validation.ok) return { kind: 'not_found' };

  const slug = validation.slug;
  const tenant: CachedInstitutionTenant | null = await (async () => {
      const [row] = await db
        .select({
          id: institutions.id,
          name: institutions.name,
          type: institutions.type,
          publicSlug: institutions.publicSlug,
          logoKey: institutions.logoKey,
          city: institutions.city,
          country: institutions.country,
          admissionsEnabled: publicAdmissionsEnabledSql,
          profileRevision: sql<string | null>`${institutionPublicProfiles.updatedAt}::text || ':' || ${institutionPublicProfiles}.xmin::text`,
          status: institutions.status,
          publicSiteEnabled: institutions.publicSiteEnabled,
        })
        .from(institutions)
        .leftJoin(
          institutionPublicProfiles,
          eq(institutionPublicProfiles.institutionId, institutions.id),
        )
        .where(
          and(
            sql`lower(${institutions.publicSlug}) = ${slug}`,
            isNull(institutions.deletedAt),
            isNull(institutions.parentInstitutionId),
          ),
        )
        .limit(1);

      if (!row || !row.publicSlug) return null;
      // Read publication/access state and the exact database revision on every request.
      // Only the public content body is reused; no cached status can keep a suspended site live.
      const profile = row.status === 'APPROVED' && row.publicSiteEnabled && row.profileRevision ? await getCachedOrFetch(
        publicProfileCacheKey(row.id, row.profileRevision), CACHE_POLICY.publicContent.ttlSeconds,
        async () => {
          const [saved] = await db.select().from(institutionPublicProfiles)
            .where(eq(institutionPublicProfiles.institutionId, row.id)).limit(1);
          return saved ?? null;
        },
      ) : null;
      return {
        ...profile,
        ...row,
        publicSlug: row.publicSlug,
        tagline: profile?.tagline ?? null,
        description: profile?.description ?? null,
        heroImageUrl: profile?.heroImageUrl ?? null,
        announcementText: profile?.announcementText ?? null,
        announcementLink: profile?.announcementLink ?? null,
        aboutTitle: profile?.aboutTitle ?? null,
        mission: profile?.mission ?? null,
        vision: profile?.vision ?? null,
        principalName: profile?.principalName ?? null,
        principalTitle: profile?.principalTitle ?? null,
        principalMessage: profile?.principalMessage ?? null,
        principalImageUrl: profile?.principalImageUrl ?? null,
        publicEmail: profile?.publicEmail ?? null,
        publicPhone: profile?.publicPhone ?? null,
        publicAddress: profile?.publicAddress ?? null,
        mapUrl: profile?.mapUrl ?? null,
        facebookUrl: profile?.facebookUrl ?? null,
        instagramUrl: profile?.instagramUrl ?? null,
        youtubeUrl: profile?.youtubeUrl ?? null,
        theme: getPublicSiteTheme(profile?.theme).id,
        design: profile?.design || {},
        accentColor: getPublicSiteTheme(profile?.theme).accent,
        statistics: profile?.statistics || [],
        programs: profile?.programs || [],
        highlights: profile?.highlights || [],
        galleryImages: profile?.galleryImages || [],
        websiteNotices: normalizeWebsiteNotices(profile?.websiteNotices),
      };
    })();

  if (!tenant) return { kind: 'not_found' };
  if (tenant.status !== 'APPROVED' || !tenant.publicSiteEnabled) return { kind: 'unavailable' };

  return {
    kind: 'active',
    tenant: {
      id: tenant.id,
      name: tenant.name,
      type: tenant.type,
      publicSlug: tenant.publicSlug,
      logoKey: tenant.logoKey,
      city: tenant.city,
      country: tenant.country,
      admissionsEnabled: tenant.admissionsEnabled,
      tagline: tenant.tagline,
      description: tenant.description,
      heroImageUrl: tenant.heroImageUrl,
      announcementText: tenant.announcementText,
      announcementLink: tenant.announcementLink,
      aboutTitle: tenant.aboutTitle,
      mission: tenant.mission,
      vision: tenant.vision,
      principalName: tenant.principalName,
      principalTitle: tenant.principalTitle,
      principalMessage: tenant.principalMessage,
      principalImageUrl: tenant.principalImageUrl,
      statistics: tenant.statistics,
      programs: tenant.programs,
      highlights: tenant.highlights,
      galleryImages: tenant.galleryImages,
      publicEmail: tenant.publicEmail,
      publicPhone: tenant.publicPhone,
      publicAddress: tenant.publicAddress,
      mapUrl: tenant.mapUrl,
      facebookUrl: tenant.facebookUrl,
      instagramUrl: tenant.instagramUrl,
      youtubeUrl: tenant.youtubeUrl,
      websiteNotices: normalizeWebsiteNotices(tenant.websiteNotices),
      accentColor: tenant.accentColor,
      theme: tenant.theme,
      design: tenant.design || {},
    },
  };
});

export async function resolveInstitutionTenantFromHost(host: string): Promise<InstitutionTenantResolution> {
  const parsed = parseInstitutionHostname(host, await getPublicSiteBaseDomain());
  if (parsed.kind !== 'institution') return { kind: 'not_found' };
  return resolveInstitutionTenant(parsed.slug);
}

export async function invalidateInstitutionTenantCache(slug: string): Promise<void> {
  const validation = validateInstitutionSlug(slug);
  if (!validation.ok || redis.status !== 'ready') return;

  try {
    await redis.del(institutionTenantCacheKey(validation.slug));
  } catch (error) {
    console.warn(`Tenant cache invalidation error for ${validation.slug}:`, error);
  }
}
