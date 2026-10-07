export const INSTITUTION_SLUG_MIN_LENGTH = 2;
export const INSTITUTION_SLUG_MAX_LENGTH = 30;

export const RESERVED_INSTITUTION_SUBDOMAINS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'apply',
  'assets',
  'auth',
  'blog',
  'cdn',
  'docs',
  'employee',
  'help',
  'institution',
  'mail',
  'portal',
  'sa',
  'static',
  'status',
  'staff',
  'student',
  'superadmin',
  'support',
  'www',
] as const);

const INSTITUTION_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type InstitutionSlugErrorCode =
  | 'EMPTY'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'INVALID_FORMAT'
  | 'RESERVED';

export type InstitutionSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; code: InstitutionSlugErrorCode; slug: string };

export function normalizeInstitutionSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function validateInstitutionSlug(value: string): InstitutionSlugValidation {
  const slug = normalizeInstitutionSlug(value);

  if (!slug) return { ok: false, code: 'EMPTY', slug };
  if (slug.length < INSTITUTION_SLUG_MIN_LENGTH) return { ok: false, code: 'TOO_SHORT', slug };
  if (slug.length > INSTITUTION_SLUG_MAX_LENGTH) return { ok: false, code: 'TOO_LONG', slug };
  if (!INSTITUTION_SLUG_PATTERN.test(slug) || slug.includes('--')) {
    return { ok: false, code: 'INVALID_FORMAT', slug };
  }
  if (RESERVED_INSTITUTION_SUBDOMAINS.has(slug)) {
    return { ok: false, code: 'RESERVED', slug };
  }

  return { ok: true, slug };
}

export type ParsedInstitutionHostname =
  | { kind: 'apex'; hostname: string }
  | { kind: 'system'; hostname: string; subdomain: string }
  | { kind: 'institution'; hostname: string; slug: string }
  | { kind: 'unknown'; hostname: string };

function normalizeHostname(host: string): string {
  const firstHost = host.split(',')[0]?.trim().toLowerCase() ?? '';
  if (!firstHost || firstHost.startsWith('[')) return firstHost;
  return firstHost.replace(/:\d+$/, '').replace(/\.$/, '');
}

export function parseInstitutionHostname(
  host: string,
  baseDomain = process.env.PUBLIC_SITE_BASE_DOMAIN || 'nisaab360.app',
): ParsedInstitutionHostname {
  const hostname = normalizeHostname(host);
  const normalizedBaseDomain = normalizeHostname(baseDomain);

  if (!hostname || !normalizedBaseDomain) return { kind: 'unknown', hostname };
  if (hostname === normalizedBaseDomain || hostname === 'localhost') {
    return { kind: 'apex', hostname };
  }

  const suffix = hostname.endsWith('.localhost')
    ? '.localhost'
    : hostname.endsWith(`.${normalizedBaseDomain}`)
      ? `.${normalizedBaseDomain}`
      : null;

  if (!suffix) return { kind: 'unknown', hostname };

  const subdomain = hostname.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes('.')) return { kind: 'unknown', hostname };
  if (RESERVED_INSTITUTION_SUBDOMAINS.has(subdomain)) {
    return { kind: 'system', hostname, subdomain };
  }

  const validation = validateInstitutionSlug(subdomain);
  if (!validation.ok) return { kind: 'unknown', hostname };

  return { kind: 'institution', hostname, slug: validation.slug };
}

export function institutionTenantCacheKey(slug: string): string {
  return `cache:institution-tenant:v2:${normalizeInstitutionSlug(slug)}`;
}

export function institutionPublicUrl(slug: string, requestHost?: string, requestProtocol = 'https:', configuredBaseDomain?: string): string {
  const hostname = normalizeHostname(requestHost || '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1') {
    const rawHost = (requestHost || '').split(',')[0]?.trim() || '';
    const port = rawHost.match(/:(\d+)$/)?.[1];
    const protocol = requestProtocol === 'http:' ? 'http:' : 'https:';
    return `${protocol}//${normalizeInstitutionSlug(slug)}.localhost${port ? `:${port}` : ''}`;
  }
  const baseDomain = normalizeHostname(configuredBaseDomain || process.env.PUBLIC_SITE_BASE_DOMAIN || 'nisaab360.app');
  return `https://${normalizeInstitutionSlug(slug)}.${baseDomain}`;
}
