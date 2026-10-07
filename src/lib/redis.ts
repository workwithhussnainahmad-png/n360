import { Redis } from 'ioredis';
import { measurePerformancePhase } from './performance';
import { TrackedDashboardCache } from './tracked-dashboard-cache';
import { CACHE_ACQUIRE, CACHE_REFRESH, CACHE_STORE, CACHE_UNLOCK } from './cache-scripts';
import { cacheRefreshContext } from './cache-refresh-context';
import { observeCache } from './cache-observation';
import { cacheTtlForKey, MAX_CACHE_VALUE_BYTES } from './cache-policy';

const redisUrl = process.env.REDIS_URL || 'redis://valkey:6379';
const FETCH_TIMEOUT_MS = 60_000;
const FILL_LOCK_MS = 10_000;

const isBuildPhase = process.env.npm_lifecycle_event === 'build' || process.env.NEXT_PHASE === 'phase-production-build';

export const redis = isBuildPhase 
  ? ({
      status: 'end',
      get: async () => null,
      setex: async () => null,
      del: async () => 0,
      quit: async () => 'OK',
      disconnect: () => undefined,
      on: () => {},
    } as unknown as Redis)
  : new Redis(redisUrl, {
      // Batch concurrent requests' commands into one socket write per loop turn.
      enableAutoPipelining: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableOfflineQueue: true,
      lazyConnect: false,
    });

// Next bundles ioredis in standalone builds; instrument the actual instance here.
if (!isBuildPhase && process.env.PERF_DIAGNOSTICS === '1') {
  const sendCommand = redis.sendCommand.bind(redis);
  redis.sendCommand = (...args: Parameters<typeof redis.sendCommand>) =>
    measurePerformancePhase('redis', () => Promise.resolve(sendCommand(...args)));
}

const dashboardCache = isBuildPhase ? null : new TrackedDashboardCache(redis);

let errorLogged = false;
redis.on('error', (err) => {
  if (!errorLogged) {
    console.warn('Valkey/Redis connection error (fallback to DB):', err.message);
    console.warn('Suppressing further Redis connection errors...');
    errorLogged = true;
  }
});

const inFlightRequests = new Map<string, Promise<unknown>>();
let activeRefreshes = 0;
const MAX_BACKGROUND_REFRESHES = 4;

/** Drop stampede-dedupe entries on shutdown so the process can exit. */
export function clearInFlightCacheFetches() {
  inFlightRequests.clear();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function runDedupedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    observeCache(key.replace(/^(json|refresh):/, ''), 'single-flight-join');
    return existing as Promise<T>;
  }

  const fetchPromise = withTimeout(Promise.resolve().then(fetcher), FETCH_TIMEOUT_MS, `cache fetch ${key}`)
    .finally(() => {
      if (inFlightRequests.get(key) === fetchPromise) inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, fetchPromise);
  return fetchPromise;
}

/** Warm native reads use the same tracking, expiry and background refresh path. */
export function peekCachedOrFetch<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, decode: (json: string) => T = JSON.parse): T | undefined {
  ttlSeconds = cacheTtlForKey(key, ttlSeconds);
  if (!ttlSeconds) return undefined;
  const local = dashboardCache?.peek(key);
  if (local !== undefined) {
    observeCache(key, 'l1-hit');
    // Refresh hot short-TTL data while its existing value is STILL valid. Never
    // serve data after its original deadline, and never refill a deleted key.
    if (ttlSeconds <= 60 && activeRefreshes < MAX_BACKGROUND_REFRESHES && !inFlightRequests.has(`refresh:${key}`) && dashboardCache?.claimRefresh(key, ttlSeconds * 300)) {
      activeRefreshes++;
      observeCache(key, 'refresh-start');
      void runDedupedFetch(`refresh:${key}`, async () => {
        try {
          await cacheRefreshContext.run(true, () => refreshCachedValue(key, ttlSeconds, local, fetcher));
        } finally { activeRefreshes--; observeCache(key, 'refresh-complete'); }
      }).catch(() => {});
    }
    return decode(local);
  }
  return undefined;
}

export async function getCachedOrFetch<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, decode: (json: string) => T = JSON.parse): Promise<T> {
  ttlSeconds = cacheTtlForKey(key, ttlSeconds);
  if (!ttlSeconds) return fetcher();
  const local = peekCachedOrFetch(key, ttlSeconds, fetcher, decode);
  if (local !== undefined) return local;
  observeCache(key, 'l1-miss');
  // Keep read, fetch, and write together so concurrent callers cannot refill a
  // miss or issue duplicate writes while the first SETEX is still pending.
  return runDedupedFetch(`json:${key}`, async () => {
    try {
      if (redis.status === 'ready') {
        const cached = await (dashboardCache ? dashboardCache.read(key) : redis.get(key));
        if (cached) { observeCache(key, 'shared-hit'); return decode(cached); }
      }
    } catch (err) {
      console.warn(`Redis get error for ${key}:`, err);
    }

    observeCache(key, 'fill-start');
    return fillCachedValue(key, ttlSeconds, fetcher, decode);
  });
}

function cacheLifetime(ttlSeconds: number) {
  return ttlSeconds + Math.floor(ttlSeconds * (0.05 + Math.random() * 0.05));
}

async function fillCachedValue<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, decode: (json: string) => T, encode: (value: T) => string = JSON.stringify): Promise<T> {
  const lockKey = `cache:fill-lock:${key}`;
  const owner = crypto.randomUUID();
  let locked = false;
  // Real Redis clients only; isolated build fixtures retain the old fallback.
  if (redis.status === 'ready' && typeof redis.set === 'function') {
    try {
      const deadline = performance.now() + FILL_LOCK_MS;
      const waitStarted = performance.now();
      let waited = false;
      do {
        // One atomic exchange replaces SET NX plus the post-lock GET. A sibling
        // that already filled the key wins without taking/releasing another lock.
        const [cached, acquired] = await redis.eval(CACHE_ACQUIRE, 2, key, lockKey, owner, FILL_LOCK_MS) as [string | null, number];
        locked = acquired === 1;
        if (cached !== null) {
          if (waited) observeCache(key, 'lock-wait-ms', performance.now() - waitStarted);
          return decode(cached);
        }
        if (locked) {
          if (waited) observeCache(key, 'lock-wait-ms', performance.now() - waitStarted);
          break;
        }
        waited = true;
        observeCache(key, 'lock-poll');
        await new Promise(resolve => setTimeout(resolve, 50 + Math.floor(Math.random() * 50)));
      } while (redis.status === 'ready' && performance.now() < deadline);
    } catch { /* Redis outage: use the normal database fallback. */ }
  }
  try {
    const fresh = await fetcher();
    try {
      const serialized = encode(fresh);
      if (redis.status === 'ready' && Buffer.byteLength(serialized, 'utf8') <= MAX_CACHE_VALUE_BYTES) {
        // A successful store already UNLINKs our lock inside the script; only a
        // rejected store (lost lock / existing value) still needs the unlock below.
        if (locked) locked = await redis.eval(CACHE_STORE, 2, key, lockKey, owner, cacheLifetime(ttlSeconds), serialized) !== 1;
        else if (typeof redis.set !== 'function') await redis.setex(key, cacheLifetime(ttlSeconds), serialized);
        // With a real client, an expired/lost lock must not overwrite its owner.
      }
    } catch (err) { console.warn(`Redis cache write error for ${key}:`, err); }
    return fresh;
  } finally {
    if (locked) await redis.eval(CACHE_UNLOCK, 1, lockKey, owner).catch(() => {});
  }
}

async function refreshCachedValue<T>(key: string, ttlSeconds: number, previous: string, fetcher: () => Promise<T>) {
  if (redis.status !== 'ready') return;
  const lockKey = `cache:fill-lock:${key}`;
  const owner = crypto.randomUUID();
  if (await redis.set(lockKey, owner, 'PX', FILL_LOCK_MS, 'NX') !== 'OK') return;
  let locked = true;
  try {
    const fresh = await fetcher();
    // The script UNLINKs the lock when it stores; skip the extra round trip then.
    const serialized = JSON.stringify(fresh);
    if (Buffer.byteLength(serialized, 'utf8') <= MAX_CACHE_VALUE_BYTES) locked = await redis.eval(CACHE_REFRESH, 2, key, lockKey, owner, cacheLifetime(ttlSeconds), serialized, previous) !== 1;
  } finally { if (locked) await redis.eval(CACHE_UNLOCK, 1, lockKey, owner).catch(() => {}); }
}

/** Cancel pending fills too: a read begun before a mutation cannot repopulate a deleted key. */
export async function invalidateReadCacheKeys(keys: string[]) {
  for (const key of keys) {
    inFlightRequests.delete(`json:${key}`);
    inFlightRequests.delete(`raw:${key}`);
  }
  if (redis.status !== 'ready' || keys.length === 0) return;
  for (let offset = 0; offset < keys.length; offset += 250) {
    const batch = keys.slice(offset, offset + 250);
    await redis.unlink(...batch, ...batch.map(key => `cache:fill-lock:${key}`));
  }
}

export async function invalidateReadCachePatterns(patterns: string[]) {
  if (redis.status !== 'ready' || patterns.length === 0) return;
  // One bounded keyspace pass for all families, including cold-fill locks.
  // These internal patterns use only '*' wildcards; escape every literal part.
  const matchers = patterns.map(pattern => new RegExp('^' + pattern.split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'));
  try {
    const stream = redis.scanStream({ match: 'cache:*', count: 250 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      const targets = new Set<string>();
      for (const key of keys) {
        const target = key.startsWith('cache:fill-lock:') ? key.slice('cache:fill-lock:'.length) : key;
        if (matchers.some(matcher => matcher.test(target))) targets.add(target);
      }
      if (targets.size) await invalidateReadCacheKeys([...targets]);
    }
  } catch (err) {
    console.warn('Redis read-cache invalidation failed:', err);
  }
}

async function deleteKeysByPattern(pattern: string) {
  await invalidateReadCachePatterns([pattern]);
}

/** Call after students are created/deleted or tests are created so roster/marks caches don't serve stale data. */
export async function invalidateInstitutionRosterCaches(institutionId: number) {
  if (redis.status !== 'ready') return;
  try {
    await invalidateReadCacheKeys([
      `cache:rosters:${institutionId}`,
      `cache:dashboard:${institutionId}`,
      `cache:dashboard:students:${institutionId}`,
      `cache:dashboard:class-dist:${institutionId}`,
      `cache:academics:${institutionId}`,
    ]);
    await invalidateReadCachePatterns([
      `cache:dashboard:${institutionId}:*`,
      `cache:dashboard:class-dist:${institutionId}:*`,
      `cache:student-picker:${institutionId}:*`,
    ]);
    // Deliberately no `cache:staff:marks:*` SCAN here any more. Nothing writes
    // that key family (the staff marks route is uncached), so the pattern could
    // never match — but SCAN walks the *entire* keyspace regardless of the
    // pattern, in `count: 100` steps, on Valkey's single command thread. That
    // was a full keyspace walk on every student create/update/delete and every
    // staff assessment creation, in front of every concurrent cache lookup.
  } catch (err) {
    console.warn(`Cache invalidation error for institution ${institutionId}:`, err);
  }
}

export async function invalidateStaffReadCaches(institutionId: number) {
  try {
    await invalidateReadCacheKeys([`cache:academics:${institutionId}`, `cache:dashboard:staff:${institutionId}`]);
    await invalidateReadCachePatterns([`cache:staff-options:${institutionId}:*`, `cache:dashboard:${institutionId}:*`]);
  } catch (error) { console.warn('Staff cache invalidation failed:', error); }
}

/** Section timetable edits affect daily previews and whole dashboard payloads too. */
export async function invalidateTimetableReadCaches(institutionId: number, sectionId: number, staffId: number | null) {
  try {
    await invalidateReadCacheKeys([
      `cache:timetable:student:${institutionId}:${sectionId}`,
      ...Array.from({ length: 7 }, (_, day) => `cache:timetable:${institutionId}:${sectionId}:${day}`),
      ...(staffId ? [
        `cache:timetable:staff:${institutionId}:${staffId}`,
        `cache:timetable:staff:v2:${institutionId}:${staffId}`,
        `cache:staff:dashboard:v2:${institutionId}:${staffId}`,
        ...Array.from({ length: 7 }, (_, day) => `cache:staff:dashboard:web:${institutionId}:${staffId}:${day}`),
      ] : []),
    ]);
    // Student IDs are not stored in the assignment. Clear this campus's previews.
    await invalidateReadCachePatterns([
      `cache:student:dashboard:*:${institutionId}`,
      `cache:student:dashboard:web:*:${institutionId}:*`,
      `cache:announcements:visible:${institutionId}:STAFF:*`,
    ]);
  } catch (error) { console.warn('Timetable cache invalidation failed:', error); }
}

export async function invalidateAnnouncementReadCaches(institutionId: number) {
  await invalidateReadCachePatterns([
    `cache:announcements:visible:${institutionId}:*`,
    `cache:student:dashboard:*:${institutionId}`,
    `cache:student:dashboard:web:*:${institutionId}:*`,
    `cache:staff:dashboard:v2:${institutionId}:*`,
    `cache:staff:dashboard:web:${institutionId}:*`,
  ]);
}

export async function invalidateStudentAttendanceCaches(institutionId: number, studentIds: number[]) {
  if (redis.status !== 'ready') return;
  try {
    const unique = [...new Set(studentIds)];
    for (let offset = 0; offset < unique.length; offset += 100) {
      const batch = unique.slice(offset, offset + 100);
      const pipeline = redis.pipeline();
      for (const id of batch) {
        pipeline.incr(`cache:student:attendance:version:${id}`);
        pipeline.expire(`cache:student:attendance:version:${id}`, 604800);
      }
      await pipeline.exec();
      await invalidateReadCacheKeys(batch.flatMap(id => [
        `cache:student:attendance:${id}:default`,
        `cache:student:dashboard:${id}:${institutionId}`,
        ...Array.from({ length: 7 }, (_, day) => `cache:student:dashboard:web:${id}:${institutionId}:${day}`),
      ]));
    }
    await invalidateReadCachePatterns([
      `cache:staff:attendance:mark:${institutionId}:*`,
      `cache:staff:attendance:history:${institutionId}:*`,
      `cache:dashboard:attendance:${institutionId}:*`,
      `cache:dashboard:today-attendance:${institutionId}:*`,
    ]);
  } catch (error) { console.warn('Attendance cache invalidation failed:', error); }
}

/** Invalidate individual student dashboard cache when assignment/mark changes occur. */
export async function invalidateStudentDashboardCache(institutionId: number, studentId: number) {
  if (redis.status !== 'ready') return;
  try {
    // The web dashboard key is suffixed with `new Date().getDay()`, so the key
    // set is exactly seven — enumerate them instead of SCANning the keyspace.
    const webKeys = Array.from({ length: 7 }, (_, day) => `cache:student:dashboard:web:${studentId}:${institutionId}:${day}`);
    await invalidateReadCacheKeys([`cache:student:dashboard:${studentId}:${institutionId}`, ...webKeys]);
  } catch (err) {
    console.warn(`Cache invalidation error for student dashboard ${studentId}:${institutionId}:`, err);
  }
}

/** Invalidate bounded marks responses and dashboards after results change or publish. */
export async function invalidateStudentMarksCaches(institutionId: number, studentIds: number[]) {
  if (redis.status !== 'ready' || studentIds.length === 0) return;
  try {
    const uniqueStudentIds = Array.from(new Set(studentIds));
    for (let offset = 0; offset < uniqueStudentIds.length; offset += 100) {
      const pipeline = redis.pipeline();
      const batch = uniqueStudentIds.slice(offset, offset + 100);
      for (const studentId of batch) {
        pipeline.incr(`cache:student:marks:version:${studentId}`);
        pipeline.expire(`cache:student:marks:version:${studentId}`, 604800);
      }
      await pipeline.exec();
      await invalidateReadCacheKeys(batch.flatMap(id => [
        `cache:student:marks:${id}:default`,
        `cache:student:dashboard:${id}:${institutionId}`,
        ...Array.from({ length: 7 }, (_, day) => `cache:student:dashboard:web:${id}:${institutionId}:${day}`),
      ]));
    }
  } catch (err) {
    console.warn(`Marks cache invalidation error for institution ${institutionId}:`, err);
  }
}

export function studentEnrichCacheKey(institutionId: number, studentId: number) {
  return `cache:student:enrich:${institutionId}:${studentId}`;
}

/**
 * Drop the cached academic-status enrichment (see `enrichSession` in lib/auth.ts).
 *
 * Call with `studentIds` when specific students change academic status, and
 * without it when an institution-wide setting changes — the latter SCANs, but it
 * only ever runs on an admin toggle, not on request traffic.
 */
export async function invalidateStudentEnrichCache(institutionId: number, studentIds?: number[]) {
  if (redis.status !== 'ready') return;
  try {
    if (studentIds && studentIds.length > 0) {
      const keys = studentIds.map((id) => studentEnrichCacheKey(institutionId, id));
      // Chunked: a whole-batch promotion can pass thousands of ids, and one
      // enormous DEL would block the single Valkey thread.
      for (let i = 0; i < keys.length; i += 500) {
        await redis.unlink(...keys.slice(i, i + 500));
      }
      return;
    }
    await deleteKeysByPattern(`cache:student:enrich:${institutionId}:*`);
  } catch (err) {
    console.warn(`Cache invalidation error for student enrichment ${institutionId}:`, err);
  }
}

export async function getRawCachedOrFetch(key: string, ttlSeconds: number, fetcher: () => Promise<string>): Promise<string> {
  ttlSeconds = cacheTtlForKey(key, ttlSeconds);
  if (!ttlSeconds) return fetcher();
  return runDedupedFetch(`raw:${key}`, async () => {
    try {
      if (redis.status === 'ready') {
        const cached = await redis.get(key);
        if (cached !== null) return cached;
      }
    } catch (err) {
      console.warn(`Redis get error for ${key}:`, err);
    }
    // Keep the original wire format while sharing cross-process locks and bounds.
    return fillCachedValue(key, ttlSeconds, fetcher, value => value, value => value);
  });
}
