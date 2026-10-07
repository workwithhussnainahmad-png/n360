import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { SQL, eq, sql } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../src/db/schema';
import { academicCacheKey, cacheTtlForKey, MAX_CACHE_VALUE_BYTES } from '../src/lib/cache-policy';
import { admissionCalendarDate, admissionCalendarDateSql } from '../src/lib/admission-calendar';

// PGlite rows and reserved Valkey DB15 keys only. No application server or live SQL writes.
async function main() {
  process.env.REDIS_URL = 'redis://127.0.0.1:6379/15';
  const cache = await import('../src/lib/redis');
  await cache.redis.ping();
  const memory = await PGlite.create();
  let selects = 0;
  const db = drizzle(memory, { logger: { logQuery(query) { if (/^select\b/i.test(query)) selects++; } } });
  const globalState = globalThis as typeof globalThis & { __cachePolicyFixture?: { db: typeof db; cache: typeof cache } };
  globalState.__cachePolicyFixture = { db, cache };
  const tenantId = 1_800_000_001;
  const prefix = `codex:cache-policy:${crypto.randomUUID()}`;
  const exact = new Set<string>();
  const remember = (key: string) => { exact.add(key); exact.add(`cache:fill-lock:${key}`); return key; };
  async function load(entry: string) {
    const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent', plugins: [{ name: 'isolated-cache-db', setup(builder) {
      builder.onResolve({ filter: /^(@\/|\.\/|\.\.\/)/ }, args => {
        if (args.kind === 'entry-point') return;
        const absolute = args.path.startsWith('@/') ? path.resolve('src', args.path.slice(2)) : path.resolve(args.resolveDir, args.path);
        if (absolute === path.resolve('src/db')) return { path: 'db', namespace: 'fixture' };
        if (absolute.replace(/\.ts$/, '') === path.resolve('src/lib/redis')) return { path: 'redis', namespace: 'fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'db'
        ? 'export const db=globalThis.__cachePolicyFixture.db;'
        : 'const cache=globalThis.__cachePolicyFixture.cache;export const redis=cache.redis;export const getCachedOrFetch=cache.getCachedOrFetch;export const invalidateReadCacheKeys=cache.invalidateReadCacheKeys;export const invalidateReadCachePatterns=cache.invalidateReadCachePatterns;', loader: 'js', resolveDir: process.cwd() }));
    } }] });
    const loaded = { exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>> };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(path.resolve('package.json')), loaded, loaded.exports);
    return loaded.exports;
  }
  try {
    for (const key of ['auth:role:1', 'cache:permissions:1', 'cache:student:enrich:1:1', 'cache:institution:owner-exists:1', 'cache:payment:1']) assert.equal(cacheTtlForKey(key, 600), 0);
    assert.equal(cacheTtlForKey('cache:dashboard:1:all', 600), 30);
    assert.equal(cacheTtlForKey('cache:academics:1', 600), 600);
    assert.equal(cacheTtlForKey('cache:timetable:student:1:1', 900), 300);
    assert.equal(cacheTtlForKey('cache:notifications:STUDENT:1:1', 30), 15);
    await cache.redis.setex(remember('cache:permissions:' + tenantId), 30, '"stale"');
    assert.equal(await cache.getCachedOrFetch('cache:permissions:' + tenantId, 600, async () => 'fresh'), 'fresh');
    console.log('PASS: policy caps and prohibited data bypass existing cache entries');

    const key = remember(prefix + ':fill');
    let fetches = 0;
    const fetcher = async () => { fetches++; return { value: 1 }; };
    await Promise.all(Array.from({ length: 25 }, () => cache.getCachedOrFetch(key, 30, fetcher)));
    assert.equal(fetches, 1);
    await cache.getCachedOrFetch(key, 30, fetcher); assert.equal(fetches, 1);
    await cache.invalidateReadCacheKeys([key]);
    assert.deepEqual(await cache.getCachedOrFetch(key, 30, async () => ({ value: 2 })), { value: 2 });
    const large = remember(prefix + ':large');
    const body = 'x'.repeat(MAX_CACHE_VALUE_BYTES + 1);
    assert.equal(await cache.getCachedOrFetch(large, 30, async () => body), body);
    assert.equal(await cache.redis.get(large), null);
    assert.equal(await cache.redis.get(`cache:fill-lock:${large}`), null);
    console.log('PASS: automatic fill, concurrent deduplication, invalidation and oversized-entry bypass');

    const race = remember(prefix + ':race');
    let started!: () => void, release!: () => void;
    const startedPromise = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const pending = cache.getCachedOrFetch(race, 30, async () => { started(); await held; return 'old'; });
    await startedPromise;
    await cache.invalidateReadCachePatterns([prefix + ':race']);
    assert.equal(await cache.getCachedOrFetch(race, 30, async () => 'new'), 'new');
    release(); await pending;
    assert.equal(await cache.getCachedOrFetch(race, 30, async () => 'unexpected'), 'new');
    const raw = remember(prefix + ':raw');
    assert.equal(await cache.getRawCachedOrFetch(raw, 30, async () => '{"count":2}'), '{"count":2}');
    assert.equal(await cache.redis.get(raw), '{"count":2}');
    assert.equal(await cache.getRawCachedOrFetch(raw, 30, async () => 'wrong'), '{"count":2}');
    console.log('PASS: a mutation during a cold fill cannot resurrect old data; raw wire format preserved');

    const dialect = new PgDialect();
    for (const table of [schema.institutions, schema.institutionPublicProfiles, schema.admissionCycles, schema.campuses, schema.admissionCycleCampuses, schema.classes, schema.sections, schema.subjects, schema.staff]) {
      const config = getTableConfig(table);
      const columns = config.columns.map(column => {
        const type = column.columnType === 'PgEnumColumn' ? 'text' : column.getSQLType();
        const value = column.default;
        const defaultValue = value === undefined ? '' : ' DEFAULT ' + (value instanceof SQL ? dialect.sqlToQuery(value).sql : typeof value === 'string' ? `'${value.replaceAll("'", "''")}'` : typeof value === 'object' ? `'${JSON.stringify(value)}'::jsonb` : String(value));
        return `"${column.name}" ${type}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}${defaultValue}`;
      });
      await memory.exec(`CREATE TABLE "${config.name}" (${columns.join(',')});`);
    }
    for (const [id, slug] of [[tenantId, 'cachemain'], [tenantId + 1, 'cachegreen']] as const) {
      await db.insert(schema.institutions).values({ id, name: slug, type: 'SCHOOL', username: slug, country: 'Pakistan', city: 'Lahore', address: 'Sample', contactEmail: slug + '@example.test', contactPhone: '1234', registrationNumber: slug, pricingPlan: 'BASIC', logoKey: 'sample', proofDocumentKey: 'sample', adminPasswordHash: 'fixture', status: 'APPROVED', publicSlug: slug, publicSiteEnabled: true });
      await db.insert(schema.institutionPublicProfiles).values({ institutionId: id, theme: 'mosaic', mission: slug, updatedAt: new Date('2026-10-06T00:00:00Z') });
      await db.insert(schema.campuses).values({ id, institutionId: id, name: 'Main' });
      await db.insert(schema.classes).values({ institutionId: id, name: 'Class 9', level: 9 });
    }
    const academics = await load('src/lib/institution-academics-data.ts');
    remember(academicCacheKey(tenantId)); remember(academicCacheKey(tenantId + 1));
    const before = selects;
    const first = await academics.getInstitutionAcademicsData(tenantId);
    assert.deepEqual(await academics.getInstitutionAcademicsData(tenantId), first);
    assert.equal(selects - before, 1, 'Warm academics skip the aggregate SQL query');
    await db.insert(schema.subjects).values({ institutionId: tenantId, name: 'Math' });
    await academics.invalidateInstitutionAcademicsCache(tenantId);
    const changed = await academics.getInstitutionAcademicsData(tenantId) as { subjects: { name: string }[] };
    assert.equal(changed.subjects[0].name, 'Math');
    assert.equal((await academics.getInstitutionAcademicsData(tenantId + 1) as typeof changed).subjects.length, 0);
    console.log('PASS: actual academic SQL caches reads, invalidates changes and isolates identical campus classes');

    const publicSite = await load('src/lib/institution-tenant.ts');
    type Resolution = { kind: string; tenant: { theme: string; mission: string; admissionsEnabled: boolean } };
    const resolve = async (slug: string) => await publicSite.resolveInstitutionTenant(slug) as Resolution;
    const websiteBefore = selects;
    const oldDocument = await resolve('cachemain');
    const warm = await resolve('cachemain');
    assert.equal(selects - websiteBefore, 3, 'Two visits share one profile body fetch but each checks fresh publication state');
    assert.equal(warm.tenant.theme, 'mosaic');
    await db.update(schema.institutionPublicProfiles).set({ theme: 'heritage', updatedAt: new Date('2026-10-06T00:00:01Z') }).where(eq(schema.institutionPublicProfiles.institutionId, tenantId));
    assert.equal((await resolve('cachemain')).tenant.theme, 'heritage', 'Revision changes bypass old content even without Redis invalidation');
    assert.equal(oldDocument.tenant.theme, 'mosaic', 'Existing document retains its theme');
    assert.equal((await resolve('cachegreen')).tenant.mission, 'cachegreen');

    for (const zone of ['UTC', 'America/New_York']) {
      await memory.exec(`SET TIME ZONE '${zone}'`);
      for (const [instant, expected, active] of [
        ['2026-10-06T18:59:59Z', '2026-10-06', false],
        ['2026-10-06T19:00:00Z', '2026-10-07', true],
        ['2026-10-07T18:59:59Z', '2026-10-07', true],
        ['2026-10-07T19:00:00Z', '2026-10-08', false],
      ] as const) {
        const today = admissionCalendarDateSql(sql`${instant}::timestamptz`);
        const query = dialect.sqlToQuery(sql`SELECT ${today}::text AS day,
          (${today} BETWEEN ${'2026-10-07'}::date AND ${'2026-10-07'}::date) AS active`);
        const row = (await memory.query<{ day: string; active: boolean }>(query.sql, query.params)).rows[0];
        assert.deepEqual(row, { day: expected, active });
        assert.equal(admissionCalendarDate(new Date(instant)), expected);
      }
    }
    await memory.exec("SET TIME ZONE 'UTC'");
    const today = admissionCalendarDate();
    const [cycle] = await db.insert(schema.admissionCycles).values({
      institutionId: tenantId, name: 'Calendar fixture', academicYear: '2026-2027',
      status: 'OPEN', opensOn: today, closesOn: today,
    }).returning({ id: schema.admissionCycles.id });
    await db.insert(schema.admissionCycleCampuses).values({ cycleId: cycle.id, campusId: tenantId, institutionId: tenantId, isOpen: true });
    await db.update(schema.institutions).set({ admissionsEnabled: true }).where(eq(schema.institutions.id, tenantId));
    assert.equal((await resolve('cachemain')).tenant.admissionsEnabled, true, 'Opening/closing today is visible under the Pakistan calendar');
    await db.update(schema.admissionCycleCampuses).set({ isOpen: false });
    assert.equal((await resolve('cachemain')).tenant.admissionsEnabled, false, 'Closing the last campus hides public admissions even with a warm profile cache');
    await db.update(schema.admissionCycleCampuses).set({ isOpen: true });
    assert.equal((await resolve('cachemain')).tenant.admissionsEnabled, true, 'Reopening a campus is immediately visible on refresh');
    assert.equal((await resolve('cachegreen')).tenant.admissionsEnabled, false, 'An open cycle never leaks to another campus');
    await db.update(schema.admissionCycles).set({ opensOn: '9999-12-31', closesOn: null }).where(eq(schema.admissionCycles.id, cycle.id));
    assert.equal((await resolve('cachemain')).tenant.admissionsEnabled, false, 'Future windows remain hidden');
    await db.update(schema.admissionCycles).set({ opensOn: null, closesOn: '1900-01-01' }).where(eq(schema.admissionCycles.id, cycle.id));
    assert.equal((await resolve('cachemain')).tenant.admissionsEnabled, false, 'Expired windows remain hidden');
    await db.update(schema.admissionCycles).set({ opensOn: null, closesOn: null, status: 'CLOSED' }).where(eq(schema.admissionCycles.id, cycle.id));
    assert.equal((await resolve('cachemain')).tenant.admissionsEnabled, false, 'Closed cycles remain hidden even if the institution flag is true');
    await db.update(schema.admissionCycles).set({ status: 'OPEN' }).where(eq(schema.admissionCycles.id, cycle.id));
    await db.update(schema.institutions).set({ admissionsEnabled: false }).where(eq(schema.institutions.id, tenantId));
    assert.equal((await resolve('cachemain')).tenant.admissionsEnabled, false, 'The institution switch remains authoritative');
    console.log('PASS: Pakistan midnight/opening/closing boundaries ignore DB timezone; actual tenant admission reads remain fresh and scoped');

    await db.update(schema.institutions).set({ publicSiteEnabled: false }).where(eq(schema.institutions.id, tenantId));
    assert.equal((await resolve('cachemain')).kind, 'unavailable');
    await db.update(schema.institutions).set({ publicSiteEnabled: true, status: 'REJECTED' }).where(eq(schema.institutions.id, tenantId));
    assert.equal((await resolve('cachemain')).kind, 'unavailable');
    console.log('PASS: actual public-site refresh sees a new theme; publication revocation stays fresh; campus content isolated');

    const scoped = remember(`cache:dashboard:${tenantId}:all`);
    const sibling = remember(`cache:dashboard:${tenantId + 1}:all`);
    await cache.redis.setex(scoped, 30, '{}'); await cache.redis.setex(sibling, 30, '{}');
    await cache.invalidateInstitutionRosterCaches(tenantId);
    assert.equal(await cache.redis.get(scoped), null); assert.equal(await cache.redis.get(sibling), '{}');
    for (const family of ['attendance', 'marks']) {
      const record = remember(`cache:student:${family}:${tenantId}:default`);
      await cache.redis.setex(record, 30, '[]');
      if (family === 'attendance') await cache.invalidateStudentAttendanceCaches(tenantId, [tenantId]);
      else await cache.invalidateStudentMarksCaches(tenantId, [tenantId]);
      assert.equal(await cache.redis.get(record), null);
      remember(`cache:student:${family}:version:${tenantId}`);
    }
    console.log('PASS: roster invalidation matches actual dashboard keys and preserves siblings; attendance/marks clear default reads');

    const daily = remember(`cache:timetable:${tenantId}:9:2`);
    const studentDashboard = remember(`cache:student:dashboard:web:10:${tenantId}:2`);
    const staffDashboard = remember(`cache:staff:dashboard:web:${tenantId}:20:2`);
    for (const target of [daily, studentDashboard, staffDashboard]) await cache.redis.setex(target, 30, '{}');
    await cache.invalidateTimetableReadCaches(tenantId, 9, 20);
    for (const target of [daily, studentDashboard, staffDashboard]) assert.equal(await cache.redis.get(target), null);
    const announcement = remember(`cache:announcements:visible:${tenantId}:STUDENT:10:4`);
    await cache.redis.setex(announcement, 30, '[]');
    await cache.invalidateAnnouncementReadCaches(tenantId);
    assert.equal(await cache.redis.get(announcement), null);
    await cache.getCachedOrFetch(scoped, 600, async () => ({ count: 1 }));
    assert.ok(await cache.redis.ttl(scoped) <= 33, 'Central policy caps caller TTL plus bounded jitter');
    console.log('PASS: timetable daily/web previews and announcement lists invalidate; actual shared TTL follows policy');
  } finally {
    for (const id of [tenantId, tenantId + 1]) {
      const keys = await cache.redis.keys(`cache:public-profile:${id}:*`);
      keys.forEach(key => remember(key));
    }
    await cache.redis.unlink(...exact);
    cache.clearInFlightCacheFetches();
    await cache.redis.quit();
    if (cache.redis.status !== 'end') await new Promise<void>(resolve => cache.redis.once('end', () => resolve()));
    assert.deepEqual(await cache.getCachedOrFetch(prefix + ':offline', 30, async () => ({ fresh: true })), { fresh: true }, 'Cache outage falls back to the fetcher');
    console.log('PASS: cache outage falls back to fresh reads');
    await memory.close();
    delete globalState.__cachePolicyFixture;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
