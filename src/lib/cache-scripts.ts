// Known scripts mutate only the supplied keys. Tracking can invalidate those
// keys without flushing every unrelated local cache entry.
export const CACHE_UNLOCK = 'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("UNLINK", KEYS[1]) else return 0 end';
export const CACHE_STORE = 'if redis.call("GET", KEYS[2]) == ARGV[1] and not redis.call("GET", KEYS[1]) then redis.call("SETEX", KEYS[1], ARGV[2], ARGV[3]); redis.call("UNLINK", KEYS[2]); return 1 else return 0 end';
export const CACHE_REFRESH = 'if redis.call("GET", KEYS[2]) == ARGV[1] and redis.call("GET", KEYS[1]) == ARGV[4] then redis.call("SETEX", KEYS[1], ARGV[2], ARGV[3]); redis.call("UNLINK", KEYS[2]); return 1 else return 0 end';
export const CACHE_WRITE_SCRIPTS = new Set([CACHE_UNLOCK, CACHE_STORE, CACHE_REFRESH]);
// Reads the payload and acquires only its separate fill lock atomically. This
// script never changes read-data keys, so it must not flush their tracked cache.
export const CACHE_ACQUIRE = 'local value = redis.call("GET", KEYS[1]); if value then return {value, 0} end; local locked = redis.call("SET", KEYS[2], ARGV[1], "PX", ARGV[2], "NX"); return {false, locked and 1 or 0}';
