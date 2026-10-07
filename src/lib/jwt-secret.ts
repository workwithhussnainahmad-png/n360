/**
 * Single source of truth for the JWT signing key.
 *
 * Previously `auth.ts` and `auth-edge.ts` each did
 * `process.env.JWT_SECRET || 'fallback-secret-key-12345'`. A missing variable
 * therefore made every token in the system forgeable by anyone who has read
 * this repository — and the app started silently, so the failure was invisible.
 *
 * Now: no hard-coded production fallback. In production a missing secret is a
 * startup error on first use. The dev fallback is kept so `npm run dev` and the
 * Docker `builder` stage (which runs `npm run build` without secrets) keep
 * working — build phase is detected the same way `src/lib/redis.ts` does it.
 *
 * `process.env.JWT_SECRET` is referenced statically and lazily so the value is
 * resolved at runtime in both the Node and Edge runtimes.
 */

/** Below this, HS256 is weaker than its own output length. */
const RECOMMENDED_MIN_LENGTH = 32;

const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

const isBuildPhase =
  process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

let cached: Uint8Array | null = null;
let warned = false;

export function getJwtSecret(): Uint8Array {
  if (cached) return cached;

  const raw = process.env.JWT_SECRET;

  if (!raw) {
    if (process.env.NODE_ENV === 'production' && !isBuildPhase) {
      // Fail fast and loudly: serving traffic with a known key is worse than not serving it.
      throw new Error(
        'JWT_SECRET is not set. Refusing to sign or verify tokens with a fallback key. ' +
          'Set JWT_SECRET (>= 32 random characters) in the environment.',
      );
    }
    if (!warned) {
      warned = true;
      console.warn('[auth] JWT_SECRET is not set — using the development fallback key.');
    }
    cached = new TextEncoder().encode(DEV_FALLBACK_SECRET);
    return cached;
  }

  if (raw.length < RECOMMENDED_MIN_LENGTH && !warned) {
    // Warn rather than throw: a short secret is weak but not public, and refusing
    // to boot over it would take a running deployment down.
    warned = true;
    console.warn(
      `[auth] JWT_SECRET is shorter than ${RECOMMENDED_MIN_LENGTH} characters. ` +
        'Rotate it to a longer random value.',
    );
  }

  cached = new TextEncoder().encode(raw);
  return cached;
}
