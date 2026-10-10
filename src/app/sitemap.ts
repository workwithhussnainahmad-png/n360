export const dynamic = 'force-dynamic';
import { MetadataRoute } from 'next'
import { headers } from 'next/headers';
import { db } from "@/db";
import { platformPages, blogs } from "@/db/schema";
import { eq } from 'drizzle-orm';
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
  'parent',
  'api',
  'sites',
  'login',
  'admin-login',
  'super-admin',
  'superadmin',
  'employee-login',
  'institution-login',
  'parent-login',
  'force-password-change',
  'payments',
  'verify',
  'batch-results',
  'announcements',
  'agreement-nisaab360',
  'thanks',
  'bye',
];

// Both content routes accept one slug segment. Reject URL separators, encoded
// paths and dot segments so saved content cannot introduce a private URL.
function isValidContentSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i.test(slug);
}

function isPublicRouteSlug(slug: string): boolean {
  const normalizedSlug = slug.toLowerCase();

  return isValidContentSlug(slug) && !privateRoutePrefixes.some(
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
    db.select({ slug: blogs.slug, updatedAt: blogs.updatedAt })
      .from(blogs).where(eq(blogs.status, 'PUBLISHED')),
  ]);
  
  const dynamicRoutes = pages.filter((page) => isPublicRouteSlug(page.slug)).map((page) => ({
    url: `https://nisaab360.app/${page.slug}`,
    lastModified: page.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const blogRoutes = allBlogs.filter((blog) => isValidContentSlug(blog.slug)).map((blog) => ({
    url: `https://nisaab360.app/blog/${blog.slug}`,
    lastModified: blog.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const routes: MetadataRoute.Sitemap = [
    {
      url: 'https://nisaab360.app',
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://nisaab360.app/blog',
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: 'https://nisaab360.app/register',
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: 'https://nisaab360.app/pricing',
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: 'https://nisaab360.app/lms-pakistan',
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://nisaab360.app/faq',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://nisaab360.app/download-app',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://nisaab360.app/download-software',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...dynamicRoutes,
    ...blogRoutes,
  ];

  // A managed page may share a slug with a built-in public page.
  return Array.from(new Map(routes.map((route) => [route.url, route])).values());
}
