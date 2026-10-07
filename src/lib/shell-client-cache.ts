/**
 * Safe client-only shell metadata cache (branding / prefs).
 *
 * Cache key: shell:v1:{role}:{userId}:{institutionId|none}:{key}
 * TTL: 5 minutes
 * Max entries: 20 (LRU-ish via overwrite on write of new keys)
 * Scope: user + role + institution
 * Never stores tokens, academic records, or authorization decisions.
 * Invalidation: clearShellClientCache() on logout.
 * Fallback: miss → network fetch; Valkey not involved (browser only).
 */

const SHELL_CACHE_VERSION = "v1";
const SHELL_CACHE_TTL_MS = 5 * 60 * 1000;
const SHELL_CACHE_PREFIX = "shell:";
const SHELL_CACHE_MAX_KEYS = 20;

type ShellCacheEnvelope<T> = {
  v: typeof SHELL_CACHE_VERSION;
  exp: number;
  data: T;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function shellCacheKey(parts: {
  role: string;
  userId: number | string;
  institutionId?: number | string | null;
  key: string;
}) {
  const inst = parts.institutionId ?? "none";
  return `${SHELL_CACHE_PREFIX}${SHELL_CACHE_VERSION}:${parts.role}:${parts.userId}:${inst}:${parts.key}`;
}

function pruneShellCacheKeys() {
  if (!isBrowser()) return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(SHELL_CACHE_PREFIX)) keys.push(k);
  }
  if (keys.length <= SHELL_CACHE_MAX_KEYS) return;
  // Drop oldest by parsing exp when possible; otherwise drop from the front.
  const ranked = keys
    .map((k) => {
      try {
        const raw = localStorage.getItem(k);
        const parsed = raw ? (JSON.parse(raw) as ShellCacheEnvelope<unknown>) : null;
        return { k, exp: parsed?.exp ?? 0 };
      } catch {
        return { k, exp: 0 };
      }
    })
    .sort((a, b) => a.exp - b.exp);
  for (const entry of ranked.slice(0, keys.length - SHELL_CACHE_MAX_KEYS)) {
    localStorage.removeItem(entry.k);
  }
}

export function readShellClientCache<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShellCacheEnvelope<T>;
    if (!parsed || parsed.v !== SHELL_CACHE_VERSION || typeof parsed.exp !== "number") {
      localStorage.removeItem(key);
      return null;
    }
    if (Date.now() > parsed.exp) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return null;
  }
}

export function writeShellClientCache<T>(key: string, data: T, ttlMs = SHELL_CACHE_TTL_MS) {
  if (!isBrowser()) return;
  try {
    const envelope: ShellCacheEnvelope<T> = {
      v: SHELL_CACHE_VERSION,
      exp: Date.now() + ttlMs,
      data,
    };
    localStorage.setItem(key, JSON.stringify(envelope));
    pruneShellCacheKeys();
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearShellClientCache() {
  if (!isBrowser()) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(SHELL_CACHE_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}
