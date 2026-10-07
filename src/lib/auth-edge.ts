import { jwtVerify } from 'jose';
import { UserRole, JWTPayload, requiresPasswordChange } from './auth-types';
import { getJwtSecret } from './jwt-secret';

// Imported lazily: getJwtSecret() throws when the secret is missing in production,
// and that must surface as a request error, not as a module-load failure.
let jwtKeyPromise: Promise<CryptoKey> | null = null;

function getJwtKey(): Promise<CryptoKey> {
  if (!jwtKeyPromise) {
    const secret = new Uint8Array(getJwtSecret()).buffer;
    jwtKeyPromise = crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
  }
  return jwtKeyPromise;
}

/**
 * Verified-token memo (signature already checked for this exact token string).
 *
 * Cache key: token string (not logged)
 * Scope: process-local only; never shared across tenants via key alone
 * TTL: remaining JWT lifetime; 30s fallback for tokens without exp
 * Max entries: 4096 (evict oldest insertion; bounded independently of token TTL)
 * Expiry and not-before are checked on every hit. Account validity is separate.
 * Fallback: on miss, full jwtVerify
 *
 * Does NOT replace verifyUserExists — callers that need deactivation checks
 * must still call getSession / getSessionFromRequest.
 */
const VERIFIED_TOKEN_TTL_MS = 30_000;
const VERIFIED_TOKEN_MAX = 4096;
const verifiedTokenCache = new Map<string, { payload: JWTPayload; expMs: number; nbf?: number }>();

function rememberVerifiedToken(token: string, payload: JWTPayload) {
  const now = Date.now();
  const { exp: expClaim, nbf } = payload as unknown as { exp?: number; nbf?: number };
  const jwtExpMs = typeof expClaim === 'number' ? expClaim * 1000 : now + VERIFIED_TOKEN_TTL_MS;
  const expMs = jwtExpMs;
  if (expMs <= now) return;

  if (verifiedTokenCache.size >= VERIFIED_TOKEN_MAX) {
    const oldest = verifiedTokenCache.keys().next().value;
    if (oldest !== undefined) verifiedTokenCache.delete(oldest);
  }
  verifiedTokenCache.set(token, { payload, expMs, nbf });
}

/** Exact same exp/nbf checks as async verification; misses still require jwtVerify. */
export function peekVerifiedAccessToken(token: string): JWTPayload | null {
  const cached = verifiedTokenCache.get(token);
  if (cached) {
    const now = Date.now();
    if (cached.expMs > now) {
      if (cached.nbf !== undefined && cached.nbf > Math.floor(now / 1000)) return null;
      return cached.payload;
    }
    verifiedTokenCache.delete(token);
  }
  return null;
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  const warm = peekVerifiedAccessToken(token);
  if (warm) return warm;

  try {
    const key = await getJwtKey();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      currentDate: new Date(Date.now()),
    });
    const typed = payload as unknown as JWTPayload;
    typed.mustChangePassword = requiresPasswordChange(typed.role, typed.mustChangePassword);
    rememberVerifiedToken(token, typed);
    return typed;
  } catch {
    return null;
  }
}

export async function getSessionEdge(requestCookies: { get: (name: string) => { value: string } | undefined }): Promise<JWTPayload | null> {
  const token = requestCookies.get('access_token')?.value;
  if (!token) return null;
  return await verifyAccessToken(token);
}

export type { UserRole, JWTPayload };
