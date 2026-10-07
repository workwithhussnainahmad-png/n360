import type { Redis } from 'ioredis';
import { performance } from 'node:perf_hooks';
import { CACHE_ACQUIRE, CACHE_WRITE_SCRIPTS } from './cache-scripts';

const PREFIXES = ['cache:staff:dashboard:', 'cache:student:dashboard:', 'cache:courses:enabled:', 'cache:timetable:', 'cache:dashboard:', 'cache:announcements:visible:', 'cache:student:attendance:', 'cache:student:marks:'];
const ELIGIBLE = /^cache:(?:(?:staff:dashboard:v2|student:dashboard):\d+:\d+|(?:staff:dashboard:web|student:dashboard:web):\d+:\d+:\d+|timetable:(?:staff:v2|student):\d+:(?:\d+|null)|timetable:\d+:(?:\d+|null):\d+|dashboard:\d+:(?:all|\d+)|dashboard:(?:class-dist|exam-perf):\d+:(?:all|\d+)|dashboard:attendance:\d+:\d{4}-\d{2}-\d{2}:(?:all|\d+)|announcements:visible:\d+:(?:STAFF|STUDENT|INSTITUTION):\d+(?::\d+)?|student:(?:attendance|marks):\d+:default|courses:enabled:\d+)$/;
const READ = 'return {redis.call("GET", KEYS[1]), redis.call("PTTL", KEYS[1])}';
const WRITES = new Set(['set', 'setex', 'psetex', 'del', 'unlink', 'expire', 'pexpire', 'expireat', 'pexpireat', 'persist', 'rename', 'renamenx']);
const MAX_ENTRIES = 8192;
// Bound retained key/value strings to 64 MiB at two bytes per code unit.
// Entry overhead is separately bounded by MAX_ENTRIES.
const MAX_CHARACTERS = 32 * 1024 * 1024;
const MAX_VALUE_LENGTH = 16_384;

/** Existing read-data caches only: never sessions, ownership or membership. */
export class TrackedDashboardCache {
  private readonly values = new Map<string, { value: string; expires: number; refreshAfter: number }>();
  private characters = 0;
  private readonly subscriber: Redis;
  private subscriberId: number | undefined;
  private active = false;
  private stopped = false;
  private readonly reads = new Map<string, Set<{ invalidated: boolean }>>();
  private epoch = 0;
  private configuring: Promise<void> | undefined;
  private readonly originalSendCommand: Redis['sendCommand'];

  constructor(private readonly redis: Redis) {
    this.subscriber = redis.duplicate({ lazyConnect: false, enableAutoPipelining: false, enableOfflineQueue: false, autoResubscribe: false });
    this.originalSendCommand = redis.sendCommand.bind(redis);
    // Evict synchronously for this process's writes as well as receiving remote
    // notifications. An invalidation arriving during a read prevents insertion.
    redis.sendCommand = (...args: Parameters<Redis['sendCommand']>) => {
      const command = args[0];
      const knownScript = command.name === 'eval' && CACHE_WRITE_SCRIPTS.has(String(command.args[0]));
      if (command.name === 'flushdb' || command.name === 'flushall' ||
        ((command.name === 'eval' || command.name === 'evalsha') && command.args[0] !== READ && command.args[0] !== CACHE_ACQUIRE && !knownScript)) this.clear();
      else if (WRITES.has(command.name) || knownScript) {
        const keys = knownScript ? command.args.slice(2, 2 + Number(command.args[1])) : command.args;
        for (const key of keys) {
          if (ELIGIBLE.test(String(key))) this.invalidate(String(key));
        }
      }
      return this.originalSendCommand(...args);
    };
    // RESP2 tracking notifications contain an array of keys, or null for a
    // flush. messageBuffer preserves that array in the installed ioredis build.
    this.subscriber.on('messageBuffer', (channel: Buffer, keys: Buffer[] | null) => {
      if (channel.toString() !== '__redis__:invalidate') return;
      if (!Array.isArray(keys)) this.clear();
      else for (const key of keys) this.invalidate(key.toString());
    });
    const unavailable = () => { this.active = false; this.epoch++; this.clear(); };
    this.subscriber.on('close', () => { this.subscriberId = undefined; unavailable(); });
    this.subscriber.on('error', unavailable);
    redis.on('close', unavailable);
    redis.on('end', () => this.stop());
    redis.on('ready', () => { unavailable(); void this.configure(); });
    this.subscriber.on('ready', () => { void this.subscribe(); });
  }

  private async subscribe() {
    if (this.stopped) return;
    try {
      const id = await this.subscriber.client('ID');
      await this.subscriber.subscribe('__redis__:invalidate');
      this.subscriberId = id;
      await this.configure();
    } catch { this.active = false; this.clear(); }
  }

  private configure(): Promise<void> {
    if (this.configuring) return this.configuring;
    if (this.stopped || !this.subscriberId || this.redis.status !== 'ready' || this.subscriber.status !== 'ready') return Promise.resolve();
    const epoch = this.epoch;
    this.active = false;
    this.clear();
    this.configuring = (async () => {
      try {
        await this.redis.client('TRACKING', 'OFF');
        await this.redis.call('CLIENT', 'TRACKING', 'ON', 'REDIRECT', this.subscriberId!, 'BCAST',
          ...PREFIXES.flatMap(prefix => ['PREFIX', prefix]));
        if (epoch === this.epoch && !this.stopped) this.active = true;
      } catch { this.active = false; this.clear(); }
      finally {
        this.configuring = undefined;
        if (epoch !== this.epoch && !this.stopped) void this.configure();
      }
    })();
    return this.configuring;
  }

  /** Returns undefined when tracking is unavailable, the key misses or expires. */
  peek(key: string): string | undefined {
    if (!this.active || this.redis.status !== 'ready' || this.subscriber.status !== 'ready') return undefined;
    const entry = this.values.get(key);
    if (entry && entry.expires > performance.now()) return entry.value;
    if (entry) this.remove(key);
    return undefined;
  }

  claimRefresh(key: string, thresholdMs: number): boolean {
    if (this.peek(key) === undefined) return false;
    const entry = this.values.get(key)!;
    const now = performance.now();
    if (entry.expires - now >= thresholdMs || entry.refreshAfter > now) return false;
    // A sibling holding the fill lock must not cause a SET NX on every hit.
    entry.refreshAfter = now + 1000;
    return true;
  }

  async read(key: string): Promise<string | null> {
    if (!ELIGIBLE.test(key) || !this.active) return this.redis.get(key);
    const local = this.peek(key);
    if (local !== undefined) return local;
    const started = performance.now();
    const read = { invalidated: false };
    let pending = this.reads.get(key);
    if (!pending) { pending = new Set(); this.reads.set(key, pending); }
    pending.add(read);
    try {
      // Atomic value+PTTL avoids pairing an old value with a replacement's TTL.
      const [value, ttl] = await this.redis.eval(READ, 1, key) as [string | null, number];
      if (value !== null && ttl > 0 && value.length <= MAX_VALUE_LENGTH && this.active && !read.invalidated) {
        this.remove(key);
        const characters = key.length + value.length;
        while (this.values.size && (this.values.size >= MAX_ENTRIES || this.characters + characters > MAX_CHARACTERS)) {
          this.remove(this.values.keys().next().value!);
        }
        // Start before the network read: queuing can only shorten local lifetime.
        if (characters <= MAX_CHARACTERS) {
          this.values.set(key, { value, expires: started + Math.min(ttl, 50_000), refreshAfter: 0 });
          this.characters += characters;
        }
      }
      return value;
    } finally {
      pending.delete(read);
      if (!pending.size) this.reads.delete(key);
    }
  }

  private remove(key: string) {
    const entry = this.values.get(key);
    if (entry) this.characters -= key.length + entry.value.length;
    this.values.delete(key);
  }

  private invalidate(key: string) {
    this.remove(key);
    for (const read of this.reads.get(key) ?? []) read.invalidated = true;
  }

  clear() {
    this.values.clear();
    this.characters = 0;
    for (const pending of this.reads.values()) for (const read of pending) read.invalidated = true;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.active = false;
    this.clear();
    this.subscriber.disconnect();
    this.redis.sendCommand = this.originalSendCommand;
  }
}
