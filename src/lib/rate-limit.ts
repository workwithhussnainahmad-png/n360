import { NextRequest } from 'next/server';
import { redis } from './redis';
import { getClientIp } from './client-ip';

export type PlatformLoginKind = 'super-admin' | 'mini-admin' | 'employee';

export type RateLimitBucket =
  | 'auth'
  | 'api'
  | 'refresh'
  | 'export'
  | 'import'
  | 'heartbeat'
  | 'unread'
  | 'marks_write'
  | 'admissions'
  | 'admission_auth'
  | 'upload';

const BUCKET_LIMITS: Record<RateLimitBucket, { limit: number; windowSeconds: number }> = {
  auth: { limit: 5, windowSeconds: 60 },
  api: { limit: 100, windowSeconds: 60 },
  refresh: { limit: 30, windowSeconds: 60 },
  export: { limit: 3, windowSeconds: 60 },
  import: { limit: 5, windowSeconds: 60 },
  heartbeat: { limit: 20, windowSeconds: 60 },
  unread: { limit: 60, windowSeconds: 60 },
  marks_write: { limit: 30, windowSeconds: 60 },
  admissions: { limit: 5, windowSeconds: 60 },
  admission_auth: { limit: 5, windowSeconds: 60 },
  // A signature is an upload capability and each one costs Cloudinary quota.
  // 20/min is far above any real flow (one signature per file picked by hand)
  // and is keyed per account, not per IP.
  upload: { limit: 20, windowSeconds: 60 },
};

const FALLBACK_MAX_KEYS = 10_000;
const fallbackWindows = new Map<string, { count: number; resetAt: number }>();

function checkFallbackRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  let record = fallbackWindows.get(key);
  if (!record || record.resetAt <= now) {
    record = { count: 0, resetAt: now + windowSeconds * 1000 };
    fallbackWindows.set(key, record);
  }
  record.count += 1;

  if (fallbackWindows.size > FALLBACK_MAX_KEYS) {
    for (const [candidate, value] of fallbackWindows) {
      if (value.resetAt <= now || fallbackWindows.size > FALLBACK_MAX_KEYS) fallbackWindows.delete(candidate);
      if (fallbackWindows.size <= FALLBACK_MAX_KEYS) break;
    }
  }

  return {
    success: record.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
  };
}

/**
 * One round trip, atomic. The previous GET → compare → MULTI(INCR[, EXPIRE])
 * sequence had two defects: concurrent requests all read the same pre-limit value
 * and all passed, and a skipped EXPIRE could leave the key with no TTL at all —
 * a permanent lockout for that IP. `EXPIRE … NX` sets the window exactly once and
 * the decision is made from INCR's own return value.
 */
async function checkRateLimit(key: string, limit: number, windowSeconds: number) {
  if (redis.status !== 'ready') return checkFallbackRateLimit(key, limit, windowSeconds);

  try {
    const result = await redis.multi().incr(key).expire(key, windowSeconds, 'NX').exec();
    if (!result || !result[0]) return checkFallbackRateLimit(key, limit, windowSeconds);

    const [incrErr, count] = result[0];
    if (incrErr || typeof count !== 'number') return checkFallbackRateLimit(key, limit, windowSeconds);

    return { success: count <= limit, retryAfterSeconds: windowSeconds };
  } catch (err) {
    console.error('Rate limit error:', err);
    return checkFallbackRateLimit(key, limit, windowSeconds);
  }
}

function clientIp(req: NextRequest) {
  return getClientIp(req);
}

export async function withRateLimit(
  req: NextRequest,
  type: RateLimitBucket = 'api',
  identity?: string | number,
) {
  const { limit, windowSeconds } = BUCKET_LIMITS[type] ?? BUCKET_LIMITS.api;
  const ip = clientIp(req);
  const suffix = identity !== undefined ? `:${identity}` : '';
  return checkRateLimit(`ratelimit:${type}:${ip}${suffix}`, limit, windowSeconds);
}

export async function withPlatformLoginRateLimit(
  req: NextRequest,
  kind: PlatformLoginKind,
  loginIdentifier: string,
) {
  const ip = clientIp(req);
  const key = `ratelimit:login:${kind}:${ip}:${loginIdentifier}`;

  let limit = 5;
  if (kind === 'super-admin') limit = 2;
  else if (kind === 'employee') limit = 10;

  return checkRateLimit(key, limit, 60);
}
