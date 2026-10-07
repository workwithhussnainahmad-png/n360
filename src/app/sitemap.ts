export const dynamic = 'force-dynamic';
import { MetadataRoute } from 'next'
import { headers } from 'next/headers';
import { db } from "@/db";
import { platformPages, blogs } from "@/db/schema";
import { institutionPublicUrl, parseInstitutionHostname } from "@/lib/institution-domain";
import { resolveInstitutionTenant } from "@/lib/institution-tenant";
import { getPublicSiteBaseDomain } from "@/lib/public-site-domain";

const privateRoutePrefixes = [
  'admin',
  'sa',
  'employee',
  'student',
  'institution',
  'staff',
  'api',
  'employee-login',
  'institution-login',
  'login/super-admin',
];

function isPublicRouteSlug(slug: string): boolean {
  const normalizedSlug = slug.trim().replace(/^\/+|\/+$/g, '').toLowerCase();

  return normalizedSlug.length > 0 && !privateRoutePrefixes.some(
    (prefix) => normalizedSlug === prefix || normalizedSlug.startsWith(`${prefix}/`),
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const baseDomain = await getPublicSiteBaseDomain();
  const parsedHostname = parseInstitutionHostname(requestHeaders.get('host') || '', baseDomain);

  if (parsedHostname.kind === 'institution') {
    const resolution = await resolveInstitutionTenant(parsedHostname.slug);
    if (resolution.kind !== 'active') return [];

    const routes: MetadataRoute.Sitemap = [{
      url: institutionPublicUrl(resolution.tenant.publicSlug, undefined, 'https:', baseDomain),
      changeFrequency: 'weekly',
      priority: 1,
    }];
    if (resolution.tenant.admissionsEnabled) {
      routes.push({
        url: `${institutionPublicUrl(resolution.tenant.publicSlug, undefined, 'https:', baseDomain)}/admissions`,
        changeFrequency: 'daily',
        priority: 0.9,
      });
    }
    return routes;
  }

  const [pages, allBlogs] = await Promise.all([
    db.select({ slug: platformPages.slug, updatedAt: platformPages.updatedAt }).from(platformPages),
    db.select({ slug: blogs.slug, updatedAt: blogs.updatedAt }).from(blogs),
  ]);
  
  const dynamicRoutes = pages.filter((page) => isPublicRouteSlug(page.slug)).map((page) => ({
    url: `https://nisaab360.app/${page.slug}`,
    lastModified: page.updatedAt || new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const blogRoutes = allBlogs.map((blog) => ({
    url: `https://nisaab360.app/blog/${blog.slug}`,
    lastModified: blog.updatedAt || new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    {
      url: 'https://nisaab360.app',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://nisaab360.app/blog',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: 'https://nisaab360.app/login',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: 'https://nisaab360.app/register',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: 'https://nisaab360.app/pricing',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: 'https://nisaab360.app/lms-pakistan',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...dynamicRoutes,
    ...blogRoutes,
  ]
}
