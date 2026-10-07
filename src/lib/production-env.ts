const PLACEHOLDER_VALUES = new Set(['change-me', 'changeme', 'secret', 'password', 'myapp.pk']);

function required(name: string, minimumLength = 1) {
  const value = process.env[name]?.trim();
  if (!value) return `${name} is required`;
  if (value.length < minimumLength) return `${name} must contain at least ${minimumLength} characters`;
  if (PLACEHOLDER_VALUES.has(value.toLowerCase()) || /^(your-|replace-with-)/i.test(value)) return `${name} still contains a placeholder value`;
  return null;
}

function requireUrl(name: string, protocols: string[]) {
  const missing = required(name);
  if (missing) return missing;
  try {
    const url = new URL(process.env[name]!);
    if (!protocols.includes(url.protocol)) return `${name} must use ${protocols.join(' or ')}`;
    if (!url.hostname) return `${name} must include a hostname`;
    return null;
  } catch {
    return `${name} must be a valid URL`;
  }
}

export function validateProductionEnvironment() {
  // A standalone Next server also runs with NODE_ENV=production during local
  // testing. Strict checks are enabled explicitly by the deployment stack.
  if (process.env.DEPLOYMENT_ENV !== 'production') return;
  const errors = [
    requireUrl('DATABASE_URL', ['postgres:', 'postgresql:']),
    requireUrl('DIRECT_URL', ['postgres:', 'postgresql:']),
    requireUrl('REDIS_URL', ['redis:', 'rediss:']),
    required('JWT_SECRET', 32),
    required('CRON_SECRET', 32),
    required('NEXT_PUBLIC_APP_DOMAIN'),
    required('PUBLIC_SITE_BASE_DOMAIN'),
    required('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'),
    required('CLOUDINARY_API_KEY'),
    required('CLOUDINARY_API_SECRET', 16),
    required('GMAIL_USER'),
    required('GMAIL_APP_PASSWORD', 16),
  ].filter((error): error is string => Boolean(error));

  const streamingSecret = process.env.STREAMING_CREDENTIALS_SECRET?.trim();
  if (streamingSecret) {
    if (streamingSecret.length < 32) {
      errors.push('STREAMING_CREDENTIALS_SECRET must contain at least 32 characters');
    } else if (
      PLACEHOLDER_VALUES.has(streamingSecret.toLowerCase())
      || /^(your-|replace-with-)/i.test(streamingSecret)
    ) {
      errors.push('STREAMING_CREDENTIALS_SECRET still contains a placeholder value');
    }
  }

  const directUrl = process.env.DIRECT_URL || '';
  if (/(:6432\b|pgbouncer=true)/i.test(directUrl)) errors.push('DIRECT_URL must connect directly to PostgreSQL, not PgBouncer');
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN?.trim().toLowerCase();
  const publicDomain = process.env.PUBLIC_SITE_BASE_DOMAIN?.trim().toLowerCase();
  if (domain && publicDomain && domain !== publicDomain) errors.push('NEXT_PUBLIC_APP_DOMAIN and PUBLIC_SITE_BASE_DOMAIN must match');
  if (process.env.API_ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).includes('*')) errors.push('API_ALLOWED_ORIGINS must not contain * in production');

  if (errors.length) throw new Error(`Production environment validation failed:\n- ${errors.join('\n- ')}`);
}
