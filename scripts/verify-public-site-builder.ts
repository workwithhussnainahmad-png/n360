import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { SQL, eq } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import * as schema from '../src/db/schema';
import { makePublicBlock, pageDesignStyle, safePublicLink, videoEmbedUrl, websiteSections } from '../src/lib/public-site-builder';
import { publicEventContentSchema } from '../src/lib/validators/public-event';
import { websiteDesignSchema } from '../src/lib/validators/public-site-builder';
import type { JWTPayload } from '../src/lib/auth-types';
type GuardedRoute = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;
type FixtureExports = { GET: GuardedRoute; POST: GuardedRoute; PATCH: GuardedRoute; DELETE: GuardedRoute; getPublishedPublicEvent: (id: number, slug: string) => Promise<typeof schema.publicEvents.$inferSelect | null>; listPublicEventEditorEntries: (id: number) => Promise<Array<{ id: number; blockCount: number }>> };

// Actual routes, role guards, publication queries and migration in disposable PostgreSQL.
async function main() {
  const memory = await PGlite.create();
  const db = drizzle(memory);
  const state = { db, session: null as JWTPayload | null };
  (globalThis as typeof globalThis & { __websiteBuilder: typeof state }).__websiteBuilder = state;
  const mocks: Record<string, string> = {
    db: 'export const db=globalThis.__websiteBuilder.db;',
    auth: 'export const getSessionFromRequest=async()=>globalThis.__websiteBuilder.session;export const getLightSessionFromRequest=getSessionFromRequest;export const getWarmSessionFromRequest=()=>null;',
    'api-policy': 'export const withApiPolicy=fn=>fn;',
    'rate-limit': 'export const withRateLimit=async()=>({success:true});',
    performance: 'export const measurePerformancePhase=async(_name,fn)=>fn();',
    audit: 'export const logAudit=async()=>{};',
    redis: 'export const redis={status:"ready",del:async()=>{}};export const getCachedOrFetch=async(_key,_ttl,fn)=>fn();',
  };
  async function load(entry: string) {
    const output = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent', plugins: [{ name: 'isolated-website', setup(builder) {
      builder.onResolve({ filter: /^(@\/db$|@\/lib\/|\.\/|\.\.\/)/ }, (args) => {
        if (args.kind === 'entry-point') return;
        const absolute = args.path.startsWith('@/') ? path.resolve('src', args.path.slice(2)) : path.resolve(args.resolveDir, args.path);
        const key = absolute === path.resolve('src/db') ? 'db' : path.dirname(absolute) === path.resolve('src/lib') ? path.basename(absolute).replace(/\.ts$/, '') : '';
        if (mocks[key]) return { path: key, namespace: 'fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: mocks[args.path], loader: 'js', resolveDir: process.cwd() }));
    } }] });
    const compiledModule = { exports: {} as FixtureExports };
    new Function('require', 'module', 'exports', output.outputFiles[0].text)(createRequire(path.resolve('package.json')), compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  try {
    const dialect = new PgDialect();
    for (const table of [schema.institutions, schema.institutionPublicProfiles, schema.publicEvents]) {
      const config = getTableConfig(table);
      const columns = config.columns.filter((column) => column.name !== 'design').map((column) => {
        const type = column.columnType === 'PgEnumColumn' ? 'text' : column.getSQLType();
        const value = column.default;
        const defaultValue = value === undefined ? '' : ' DEFAULT ' + (value instanceof SQL ? dialect.sqlToQuery(value).sql : typeof value === 'string' ? "'" + value.replaceAll("'", "''") + "'" : typeof value === 'object' ? "'" + JSON.stringify(value) + "'::jsonb" : String(value));
        return '"' + column.name + '" ' + type + (column.primary ? ' PRIMARY KEY' : '') + (column.notNull ? ' NOT NULL' : '') + defaultValue;
      });
      await memory.exec('CREATE TABLE "' + config.name + '" (' + columns.join(',') + ');');
    }
    await memory.exec('CREATE UNIQUE INDEX public_event_fixture_slug ON public_events(institution_id,slug)');
    await memory.exec("INSERT INTO institution_public_profiles(institution_id,tagline,theme) VALUES(99,'Preserve this content','mosaic'); INSERT INTO public_events(institution_id,title,slug) VALUES(99,'Preserve event','original')");
    const migration = await readFile('drizzle/0075_public_site_builder.sql', 'utf8');
    await memory.exec(migration); await memory.exec(migration);
    assert.equal((await memory.query<{ tagline: string }>('SELECT tagline FROM institution_public_profiles WHERE institution_id=99')).rows[0].tagline, 'Preserve this content');
    assert.deepEqual((await memory.query<{ design: object }>('SELECT design FROM public_events WHERE institution_id=99')).rows[0].design, {});
    console.log('PASS: additive migration, replay, existing content and empty design defaults');
    const root = { name: 'Fixture Academy', type: 'SCHOOL' as const, country: 'Pakistan', city: 'Lahore', address: 'Fixture', contactPhone: '123', registrationNumber: 'test', pricingPlan: 'BASIC' as const, logoKey: 'fixture', proofDocumentKey: 'fixture', adminPasswordHash: 'fixture', status: 'APPROVED' as const, publicSiteEnabled: true };
    for (const id of [1, 2, 3]) await db.insert(schema.institutions).values({ ...root, id, username: 'test' + id, publicSlug: 'test' + id, contactEmail: 'test' + id + '@example.test', parentInstitutionId: id === 3 ? 1 : null });
    const collection = await load('src/app/api/institution/public-events/route.ts');
    const detail = await load('src/app/api/institution/public-events/[id]/route.ts');
    const profile = await load('src/app/api/institution/public-site/route.ts');
    const published = await load('src/lib/public-event-queries.ts');
    const content = { title: 'Open day', slug: 'open-day', summary: '', coverImageUrl: '', eventDate: '', venue: '', blocks: [makePublicBlock('faq'), makePublicBlock('split')], visibilityDuration: 'FOREVER', design: { hero: 'banner', accent: '#184862' } };
    function session(role = 'INSTITUTION', institutionId = 1) { state.session = { userId: 100, institutionId, role } as JWTPayload; }
    async function request(handler: GuardedRoute, method: string, body?: unknown, id = 1) {
      return handler(new NextRequest('http://localhost/api/institution/public-events', { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }), { params: Promise.resolve({ id: String(id) }) });
    }
    session('STAFF'); assert.equal((await request(collection.POST, 'POST', { ...content, action: 'SAVE_DRAFT' })).status, 403);
    state.session = null; assert.equal((await request(collection.GET, 'GET')).status, 401);
    session('INSTITUTION', 3); assert.equal((await request(collection.POST, 'POST', { ...content, action: 'PUBLISH' })).status, 403);
    session(); state.session!.campusReadOnly = true; assert.equal((await request(profile.PATCH, 'PATCH', { design: {} })).status, 403);
    session(); const created = await request(collection.POST, 'POST', { ...content, action: 'SAVE_DRAFT' }); assert.equal(created.status, 201); const event = (await created.json()).event;
    const editor = await load('src/lib/public-event-editor.ts');
    const library = await editor.listPublicEventEditorEntries(1);
    assert.equal(library.length, 1); assert.equal(library[0].blockCount, 2);
    assert.equal(Object.hasOwn(library[0], 'blocks'), false); assert.equal(Object.hasOwn(library[0], 'design'), false);
    assert.deepEqual(await editor.listPublicEventEditorEntries(2), []);
    const opened = await request(detail.GET, 'GET', undefined, event.id);
    assert.equal(opened.status, 200); assert.deepEqual((await opened.json()).event.blocks, content.blocks);
    session('INSTITUTION_ADMIN'); assert.equal((await request(detail.GET, 'GET', undefined, event.id)).status, 200);
    session('INSTITUTION', 2); assert.equal((await request(detail.GET, 'GET', undefined, event.id)).status, 404);
    session('INSTITUTION', 3); assert.equal((await request(detail.GET, 'GET', undefined, event.id)).status, 403);
    session('STAFF'); assert.equal((await request(detail.GET, 'GET', undefined, event.id)).status, 403);
    session();
    console.log('PASS: event library transfers metadata and block counts only; lazy detail reads enforce owner/admin/tenant/campus boundaries');
    assert.equal(await published.getPublishedPublicEvent(1, content.slug), null);
    session('INSTITUTION_ADMIN'); const live = await request(detail.PATCH, 'PATCH', { ...content, action: 'PUBLISH' }, event.id); assert.equal(live.status, 200);
    assert.deepEqual((await published.getPublishedPublicEvent(1, content.slug))!.design, content.design);
    assert.equal(await published.getPublishedPublicEvent(2, content.slug), null);
    session('INSTITUTION', 2); assert.equal((await request(detail.PATCH, 'PATCH', { ...content, action: 'SAVE' }, event.id)).status, 404); assert.equal((await request(detail.DELETE, 'DELETE', undefined, event.id)).status, 404);
    session(); assert.equal((await request(collection.POST, 'POST', { ...content, action: 'SAVE_DRAFT' })).status, 409);
    const legacyContent = { ...content, design: undefined };
    assert.equal((await request(detail.PATCH, 'PATCH', { ...legacyContent, action: 'SAVE' }, event.id)).status, 200);
    assert.deepEqual((await published.getPublishedPublicEvent(1, content.slug))!.design, content.design);
    await db.update(schema.publicEvents).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.publicEvents.id, event.id));
    assert.equal(await published.getPublishedPublicEvent(1, content.slug), null);
    console.log('PASS: role/owner/admin/campus boundaries, drafts, publishing, expiry, slug conflicts and legacy saves');
    await db.insert(schema.institutionPublicProfiles).values({ institutionId: 1, tagline: 'Keep our headline', theme: 'mosaic' });
    const design = { sections: [{ id: 'about', visible: false, title: 'Our story' }, { id: 'custom', visible: true, title: 'Frequently asked questions' }], customBlocks: [makePublicBlock('faq')] };
    assert.equal((await request(profile.PATCH, 'PATCH', { design })).status, 200);
    assert.equal((await request(profile.PATCH, 'PATCH', { theme: 'heritage' })).status, 200);
    const [saved] = await db.select().from(schema.institutionPublicProfiles).where(eq(schema.institutionPublicProfiles.institutionId, 1));
    assert.equal(saved.tagline, 'Keep our headline'); assert.equal(saved.theme, 'heritage'); assert.deepEqual(saved.design, design);
    assert.equal((await request(profile.PATCH, 'PATCH', { theme: 'mosaic', design })).status, 400);
    assert.equal((await request(profile.PATCH, 'PATCH', { design: { customBlocks: [{ id: 'bad', type: 'button', label: 'Unsafe', url: 'javascript:alert(1)' }] } })).status, 400);
    assert.equal((await request(profile.PATCH, 'PATCH', { design: { heroButtonUrl: '//example.test' } })).status, 400);
    assert.equal((await request(profile.PATCH, 'PATCH', { design: { sections: [design.sections[0], design.sections[0]] } })).status, 400);
    for (const type of ['heading', 'paragraph', 'image', 'callout', 'schedule', 'button', 'gallery', 'split', 'faq', 'list', 'video', 'divider', 'spacer'] as const) assert.equal(publicEventContentSchema.safeParse({ ...content, blocks: [makePublicBlock(type)] }).success, true, type);
    assert.equal(publicEventContentSchema.safeParse({ ...content, blocks: [content.blocks[0], content.blocks[0]] }).success, false);
    assert.equal(websiteDesignSchema.safeParse({ customBlocks: Array.from({ length: 41 }, () => makePublicBlock('paragraph')) }).success, false);
    assert.equal(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    assert.equal(videoEmbedUrl('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'), null);
    assert.equal(videoEmbedUrl('https://vimeo.com/1234'), 'https://player.vimeo.com/video/1234');
    for (const url of ['javascript:alert(1)', '//evil.test', '/\\evil.test', 'data:text/html,hi']) assert.equal(safePublicLink(url), false, url);
    assert.equal(pageDesignStyle({ accent: '#ffffff' })['--site-on-accent' as keyof ReturnType<typeof pageDesignStyle>], '#171c1a');
    assert.equal(websiteSections(design as Parameters<typeof websiteSections>[0]).length, 11);
    console.log('PASS: partial website/theme saves preserve content; bounded blocks, safe links/video providers, unique section IDs and contrast');
  } finally { await memory.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
