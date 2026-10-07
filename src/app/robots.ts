import { MetadataRoute } from 'next'
import { headers } from 'next/headers';
import { institutionPublicUrl, parseInstitutionHostname } from '@/lib/institution-domain';
import { resolveInstitutionTenant } from '@/lib/institution-tenant';
import { getPublicSiteBaseDomain } from '@/lib/public-site-domain';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const baseDomain = await getPublicSiteBaseDomain();
  const parsedHostname = parseInstitutionHostname(requestHeaders.get('host') || '', baseDomain);

  if (parsedHostname.kind === 'institution') {
    const resolution = await resolveInstitutionTenant(parsedHostname.slug);
    if (resolution.kind !== 'active') {
      return { rules: { userAgent: '*', disallow: '/' } };
    }

    const origin = institutionPublicUrl(resolution.tenant.publicSlug, undefined, 'https:', baseDomain);
    return {
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/api', '/sites'],
      },
      sitemap: `${origin}/sitemap.xml`,
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/register', '/lms-pakistan', '/blog'],
      disallow: ['/admin', '/sa', '/employee', '/student', '/institution', '/staff', '/employee-login', '/institution-login', '/login/super-admin'],
    },
    sitemap: 'https://nisaab360.app/sitemap.xml',
  }
}
