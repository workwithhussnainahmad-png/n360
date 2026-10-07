# Full first-party source evidence

Exact source snapshots for both dashboard handlers and their first-party helper paths, including fallback auth, transport, cache, database and serialization functions. Functions for other methods in these files are not necessarily called by dashboards. Third-party framework internals are not reproduced. No environment files or tokens are included.

## src/app/api/student/dashboard/route.ts

SHA256: 5a9d278244a85be081e0044d63ef1c4c7cfe57b0ab75db6b86db491212bbb8bc

```typescript
import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  staff,
  staffAssignments,
  subjects,
} from "@/db/schema";
import { requireRole, getTenantContext } from "@/lib/rbac";
import { getCachedOrFetch } from "@/lib/redis";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { and, eq } from "drizzle-orm";
import { fetchStudentDashboardData } from "@/lib/dashboard-data";
import { getInstitutionCourseStreamingHint } from "@/lib/course-streaming";
import { decodeDashboardPayload, dashboardResponse } from "@/lib/dashboard-response";
export { corsPreflight as OPTIONS } from "@/lib/cors";

const DASHBOARD_CACHE_TTL_SECONDS = 45;
const TIMETABLE_CACHE_TTL_SECONDS = 300;

type DashboardPayload = {
  firstName: string;
  latestScore: string;
  /** Kept for mobile client shape; unread is loaded when the notification UI opens. */
  unreadNotificationsCount: number;
  hasPushToken: boolean;
  /** Static nav hints — not probed from DB on home load. */
  hasExams: boolean;
  hasTests: boolean;
  hasTranscripts: boolean;
  hasFeeVouchers: boolean;
  timetable: Array<{ dayOfWeek: number; startTime: string; endTime: string; subjectName: string | null; teacherName: string | null }>;
  assignments: Array<{ id: number; title: string; dueAt: string; submission: null }>;
  announcements: Array<{ id: number; title: string; content?: string; createdAtIso?: string; senderRole?: string }>;
};

export const GET = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  const startTime = performance.now();
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const tenantId = getTenantContext(session);
  const cacheKey = `cache:student:dashboard:${session.userId}:${tenantId}`;

  let isCacheHit = true;

  const [payload, coursesEnabled] = await Promise.all([
    getCachedOrFetch(cacheKey, DASHBOARD_CACHE_TTL_SECONDS, async (): Promise<DashboardPayload | { error: string }> => {
      isCacheHit = false;

      const student = await fetchStudentDashboardData(tenantId, session.userId);

      if (!student) {
        return { error: "Student not found" };
      }

      const firstName = student.name.trim().split(" ")[0] || "Student";

      // Graduated students only get the profile/transcripts/attendance surface —
      // keep the payload minimal (no timetable/assignments/marks history).
      if (student.academicStatus === "GRADUATED") {
        return {
          firstName,
          latestScore: "N/A",
          unreadNotificationsCount: 0,
          hasPushToken: Boolean(student.expoPushToken),
          hasExams: false,
          hasTests: false,
          hasTranscripts: true,
          hasFeeVouchers: false,
          timetable: [],
          assignments: [],
          announcements: [],
        };
      }

      const sectionId = student.sectionId;
      const todayDayOfWeek = new Date().getDay();
      const timetableCacheKey = `cache:timetable:${tenantId}:${sectionId}:${todayDayOfWeek}`;

      const [timetableRows, visibleAnnouncements] = await Promise.all([
        getCachedOrFetch(timetableCacheKey, TIMETABLE_CACHE_TTL_SECONDS, async () => {
          return db.select({
            dayOfWeek: staffAssignments.dayOfWeek,
            startTime: staffAssignments.startTime,
            endTime: staffAssignments.endTime,
            subjectName: subjects.name,
            teacherName: staff.name,
          })
            .from(staffAssignments)
            .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
            .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
            .where(and(
              eq(staffAssignments.sectionId, sectionId),
              eq(staffAssignments.institutionId, tenantId),
              eq(staffAssignments.dayOfWeek, todayDayOfWeek),
            ));
        }),
        getVisibleAnnouncements(
          session,
          2,
          {
            campusId: student.campusId,
            classId: student.classId,
            sectionId: student.sectionId,
            createdAt: student.createdAt,
          },
          { includeReadStatus: false }
        ),
      ]);

      const latestMarkRow = student.latestMark;
      const latestScore = latestMarkRow && latestMarkRow.totalMarks
        ? `${Math.round((latestMarkRow.marksObtained / latestMarkRow.totalMarks) * 100)}%`
        : "N/A";

      return {
        firstName,
        latestScore,
        unreadNotificationsCount: 0,
        hasPushToken: Boolean(student.expoPushToken),
        // Nav availability is static for active students; section pages load their own data.
        hasExams: true,
        hasTests: true,
        hasTranscripts: true,
        hasFeeVouchers: true,
        timetable: timetableRows,
        assignments: student.assignments.map((a) => ({
          id: a.id,
          title: a.title,
          dueAt: new Date(a.dueAt).toISOString(),
          submission: null,
        })),
        announcements: visibleAnnouncements.slice(0, 2).map((a) => ({
          id: a.id,
          title: a.title,
          content: a.content,
          createdAtIso: a.createdAtIso,
          senderRole: a.senderRole,
        })),
      };
    }, decodeDashboardPayload),
    getInstitutionCourseStreamingHint(tenantId),
  ]);

  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
  const headers = new Headers({
    "x-request-id": requestId,
    "x-cache": isCacheHit ? "HIT" : "MISS",
    "x-dashboard-duration-ms": durationMs.toString(),
    "server-timing": `total;dur=${durationMs}`,
  });

  return dashboardResponse(payload, coursesEnabled, headers);
});

```

## src/app/api/staff/dashboard/route.ts

SHA256: 894c7f94208fb9b66583c7674c5c6d9e386abccfecdcff75dc7fbc0f3eb043ab

```typescript
import { NextRequest } from "next/server";
import { fetchStaffDashboardData } from '@/lib/dashboard-data';
import { requireRole, getTenantContext } from "@/lib/rbac";
import { getCachedOrFetch } from "@/lib/redis";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { getInstitutionCourseStreamingHint } from "@/lib/course-streaming";
import { decodeDashboardPayload, dashboardResponse } from "@/lib/dashboard-response";
export { corsPreflight as OPTIONS } from "@/lib/cors";

const DASHBOARD_CACHE_TTL_SECONDS = 45;

type DashboardPayload = {
  firstName: string;
  /** Kept for mobile client shape; unread is loaded when the notification UI opens. */
  unreadNotificationsCount: number;
  timetable: Array<{ dayOfWeek: number; startTime: string; endTime: string; subjectName: string | null; className: string | null; sectionName: string | null }>;
  assignments: Array<{ id: number; title: string; dueAt: string; className: string | null; sectionName: string | null; subjectName: string | null }>;
  announcements: Array<{ id: number; title: string; content: string; createdAtIso: string; senderRole?: string; isRead: boolean }>;
};

export const GET = requireRole(["STAFF"], async (_req: NextRequest, { session }) => {
  const tenantId = getTenantContext(session);
  const staffId = session.userId;
  const cacheKey = `cache:staff:dashboard:v2:${tenantId}:${staffId}`;

  const [payload, coursesEnabled] = await Promise.all([
    getCachedOrFetch(cacheKey, DASHBOARD_CACHE_TTL_SECONDS, async (): Promise<DashboardPayload | { error: string }> => {
      const todayDayOfWeek = new Date().getDay();

      const [staffRow, visibleAnnouncements] = await Promise.all([
        fetchStaffDashboardData(tenantId, staffId, todayDayOfWeek),
        getVisibleAnnouncements(session, 3),
      ]);
      if (!staffRow) return { error: "Staff not found" };
      const firstName = staffRow.name.trim().split(" ")[0] || "Staff";

      return {
        firstName,
        unreadNotificationsCount: 0,
        timetable: staffRow.timetable,
        assignments: staffRow.assignments.map((a) => ({
          id: a.id,
          title: a.title,
          dueAt: new Date(a.dueAt).toISOString(),
          className: a.className,
          sectionName: a.sectionName,
          subjectName: a.subjectName,
        })),
        announcements: visibleAnnouncements.slice(0, 3).map((a) => ({
          id: a.id,
          title: a.title,
          content: a.content,
          createdAtIso: a.createdAtIso,
          senderRole: a.senderRole,
          isRead: a.isRead,
        })),
      };
    }, decodeDashboardPayload),
    getInstitutionCourseStreamingHint(tenantId),
  ]);

  return dashboardResponse(payload, coursesEnabled);
});

```

## scripts/standalone-server.cjs

SHA256: f2d20457ea38ed9dcb3b809f4ebc65a9f6e0483662bea626bd062ba1819826a9

```javascript
'use strict';
/**
 * Production standalone entry point with a hot-path lane for guarded JSON APIs.
 *
 * Why: a CPU profile of a replica serving only warm, in-memory dashboard hits
 * showed ~4 ms of CPU per request, almost entirely Next's per-request router
 * pipeline (route matching over every route, base-server handleRequest,
 * app-route prepare/manifests/IncrementalCache/tracer, request adaptation and a
 * web-stream→node pipe). The route handlers themselves were not visible.
 *
 * What: every request still goes to Next's own request handler EXCEPT plain GET
 * requests whose exact pathname is in LANE_ROUTES. Those call the compiled route
 * module's GET directly with a NextRequest and write the Response with a
 * Content-Length. The handlers are the same compiled modules Next would load
 * (same Node module instance, so pools, caches and tracking are shared), and all
 * of them are wrapped by requireRole/withApiPolicy, which already performs the
 * transport policy the Proxy applies to other API routes (session-header
 * stripping, CORS). Authentication, tenant/ownership and cache behaviour are
 * unchanged because the handler code is unchanged.
 *
 * Safety: the lane refuses non-GET methods, query-less path mismatches, routes
 * missing from the build manifest, modules that fail to load, and handlers that
 * throw or return something other than a Response (those fall back to Next or a
 * plain 500). HOT_PATH_LANE=0 disables it without a rebuild.
 */
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { createRequire } = require('node:module');

const dir = resolveStandaloneDir();
process.chdir(dir);
process.env.NODE_ENV = 'production';
const standaloneRequire = createRequire(path.join(dir, 'package.json'));

const port = Number.parseInt(process.env.PORT || '', 10) || 3000;
const hostname = process.env.HOSTNAME || '0.0.0.0';
let keepAliveTimeout = Number.parseInt(process.env.KEEP_ALIVE_TIMEOUT || '', 10);
if (!Number.isFinite(keepAliveTimeout) || keepAliveTimeout < 0) keepAliveTimeout = undefined;

// Same configuration the generated server.js embeds (required-server-files is
// the source of that object; server.js only rewrites distDir to a relative path).
const requiredServerFiles = JSON.parse(fs.readFileSync(path.join(dir, '.next', 'required-server-files.json'), 'utf8'));
const nextConfig = { ...requiredServerFiles.config, distDir: './.next' };
process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);
standaloneRequire('next');
const { getRequestHandlers } = standaloneRequire('next/dist/server/lib/start-server');

const LANE_ENABLED = process.env.HOT_PATH_LANE !== '0';
const DEFAULT_LANE_ROUTES = [
  '/api/student/dashboard', '/api/student/timetable', '/api/student/profile',
  '/api/staff/dashboard', '/api/staff/timetable', '/api/staff/profile',
  '/api/institution/dashboard', '/api/institution/dashboard/charts', '/api/institution/academics', '/api/institution/timetable',
  '/api/parent/portal',
];
const laneRoutePaths = (process.env.HOT_PATH_LANE_ROUTES
  ? process.env.HOT_PATH_LANE_ROUTES.split(',').map((route) => route.trim()).filter(Boolean)
  : DEFAULT_LANE_ROUTES);

/** pathname -> { handler, headers } once loaded; entries are added only after a successful load. */
const lane = new Map();
let NextRequest;

let handlersReady;
const handlersPromise = new Promise((resolve) => { handlersReady = resolve; });
let nextRequestHandler = async (req, res) => { await handlersPromise; return nextRequestHandler(req, res); };
let nextUpgradeHandler = async (req, socket, head) => { await handlersPromise; return nextUpgradeHandler(req, socket, head); };
let nextServer;

async function requestListener(req, res) {
  try {
    if (lane.size && req.method === 'GET') {
      const url = req.url || '';
      const query = url.indexOf('?');
      const entry = lane.get(query === -1 ? url : url.slice(0, query));
      if (entry) return await handleLane(req, res, entry);
    }
    await nextRequestHandler(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    } else if (!res.writableEnded) {
      res.end();
    }
    console.error(`Failed to handle request for ${req.url}`);
    console.error(err);
  }
}

async function handleLane(req, res, entry) {
  let response;
  try {
    const host = req.headers.host || 'localhost';
    const request = new NextRequest(`http://${host}${req.url}`, { method: 'GET', headers: new Headers(req.headers) });
    response = await entry.handler(request, { params: Promise.resolve({}) });
  } catch (err) {
    // requireRole converts handler failures into JSON 500s; this covers request
    // construction (malformed URL/header) and anything the wrapper did not catch.
    console.error(`Hot-path lane error for ${req.url}:`, err);
    if (res.destroyed) return;
    res.writeHead(500, { 'content-type': 'application/json', 'content-length': '33' });
    res.end('{"error":"Internal Server Error"}');
    return;
  }
  if (!(response instanceof Response)) {
    console.error(`Hot-path lane handler for ${req.url} returned a non-Response value`);
    res.writeHead(500, { 'content-type': 'application/json', 'content-length': '33' });
    res.end('{"error":"Internal Server Error"}');
    return;
  }
  const serialized = response[Symbol.for('nisaab360.serialized-json')];
  // Only our immutable serialized responses opt in. Arbitrary or consumed bodies
  // still use normal stream handling; HOT_PATH_JSON_BODY=0 restores that path.
  const body = process.env.HOT_PATH_JSON_BODY !== '0' && typeof serialized === 'string' && !response.bodyUsed && !response.body?.locked
    ? serialized
    : response.body ? Buffer.from(await response.arrayBuffer()) : null;
  if (res.destroyed) return;
  const headers = { ...entry.headers };
  const setCookie = response.headers.getSetCookie();
  response.headers.forEach((value, name) => {
    if (name === 'set-cookie' || name === 'x-middleware-set-cookie') return;
    headers[name] = value;
  });
  if (setCookie.length) headers['set-cookie'] = setCookie;
  headers['content-length'] = String(typeof body === 'string' ? Buffer.byteLength(body) : body?.length || 0);
  res.writeHead(response.status, headers);
  res.end(body);
}

async function loadLane() {
  if (!LANE_ENABLED) {
    console.log('Hot-path lane disabled (HOT_PATH_LANE=0); every request uses the Next request handler.');
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.next', 'app-path-routes-manifest.json'), 'utf8'));
  const routesManifest = JSON.parse(fs.readFileSync(path.join(dir, '.next', 'routes-manifest.json'), 'utf8'));
  const routeFiles = new Map(Object.entries(manifest).map(([page, pathname]) => [pathname, page]));
  ({ NextRequest } = standaloneRequire('next/dist/server/web/spec-extension/request'));
  const loaded = [];
  for (const pathname of laneRoutePaths) {
    const page = routeFiles.get(pathname);
    if (!page || !page.endsWith('/route') || /[[\]]/.test(pathname)) {
      console.warn(`Hot-path lane skipped ${pathname}: not a static app route in this build`);
      continue;
    }
    try {
      const routeModule = standaloneRequire(path.join(dir, '.next', 'server', 'app', `${page}.js`)).routeModule;
      await routeModule.ensureUserland();
      const handler = routeModule.userland.GET;
      if (typeof handler !== 'function') throw new Error('route exports no GET handler');
      lane.set(pathname, { handler, headers: staticHeadersFor(routesManifest, pathname) });
      loaded.push(pathname);
    } catch (err) {
      console.warn(`Hot-path lane skipped ${pathname}: ${err && err.message ? err.message : err}`);
    }
  }
  console.log(`Hot-path lane active for ${loaded.length} route(s): ${loaded.join(', ')}`);
}

/** Static next.config `headers()` entries that match this path (no has/missing conditions are used). */
function staticHeadersFor(routesManifest, pathname) {
  const headers = {};
  for (const rule of routesManifest.headers || []) {
    if (rule.has || rule.missing || !rule.regex) continue;
    if (!new RegExp(rule.regex).test(pathname)) continue;
    for (const header of rule.headers || []) headers[header.key.toLowerCase()] = header.value;
  }
  return headers;
}

function resolveStandaloneDir() {
  if (process.env.NEXT_STANDALONE_DIR) return path.resolve(process.env.NEXT_STANDALONE_DIR);
  const sibling = path.join(__dirname, '..');
  if (fs.existsSync(path.join(sibling, 'server.js')) && fs.existsSync(path.join(sibling, '.next', 'required-server-files.json'))) return sibling;
  return path.resolve('.next', 'standalone');
}

process.title = 'next-server (hot-path lane)';
const server = http.createServer(requestListener);
if (keepAliveTimeout) server.keepAliveTimeout = keepAliveTimeout;
server.on('upgrade', async (req, socket, head) => {
  try { await nextUpgradeHandler(req, socket, head); } catch (err) { socket.destroy(); console.error(err); }
});
server.on('error', (err) => { console.error('Failed to start server', err); process.exit(1); });
server.on('listening', async () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  process.env.PORT = String(actualPort);
  process.env.__NEXT_PRIVATE_ORIGIN = `http://localhost:${actualPort}`;
  try {
    const init = await getRequestHandlers({ dir, port: actualPort, isDev: false, server, hostname, keepAliveTimeout, quiet: false });
    nextRequestHandler = init.requestHandler;
    nextUpgradeHandler = init.upgradeHandler;
    nextServer = init.server;
    await loadLane();
    handlersReady();
    console.log(`Ready on http://${hostname}:${actualPort}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    try { if (nextServer) await nextServer.close(); } catch (err) { console.error(err); }
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
  // Idle keep-alive sockets must not delay shutdown past Docker's stop timeout.
  server.closeIdleConnections();
  setTimeout(() => process.exit(signal === 'SIGINT' ? 130 : 143), 8000).unref();
}
if (!process.env.NEXT_MANUAL_SIG_HANDLE) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
server.listen(port, hostname);

```

## src/lib/rbac.ts

SHA256: 93a5b9f272181ac43800346c28b36e556ff5c7c830738fcb4ae244743f6da072

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, getLightSessionFromRequest, UserRole, JWTPayload } from './auth';
import { DEFAULT_MAX_BODY_BYTES, bodyTooLargeResponse, exceedsDeclaredBodyLimit } from './http';
import { withRateLimit } from './rate-limit';
import { measurePerformancePhase } from './performance';
import { withApiPolicy } from './api-policy';

type RouteHandler = (
  req: NextRequest,
  context: { params: any; session: JWTPayload },
) => Promise<Response> | Response;

type RequireRoleOptions = {
  allowPasswordChangeRequired?: boolean;
  /** Skip Redis/DB user validity + student enrich — for heartbeat/unread only. */
  light?: boolean;
  /** Override the request-body ceiling for routes with genuinely larger payloads. */
  maxBodyBytes?: number;
};

function enforceSessionGuards(
  req: NextRequest,
  session: JWTPayload,
  allowedRoles: UserRole[],
  options?: RequireRoleOptions,
): NextResponse | null {
  if (!allowedRoles.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (session.mustChangePassword && !options?.allowPasswordChangeRequired) {
    return NextResponse.json(
      { error: 'PASSWORD_CHANGE_REQUIRED' },
      { status: 403 }
    );
  }

  if (session.role === 'STUDENT' && session.studentAcademicStatus === 'GRADUATED') {
    const allowedGraduateApiPaths = [
      '/api/student/profile',
      '/api/student/transcripts',
      '/api/student/attendance',
      '/api/student/dashboard',
      '/api/student/promotion-result',
    ];
    const isAllowedGraduateApi = allowedGraduateApiPaths.some((path) => (
      req.nextUrl.pathname === path || req.nextUrl.pathname.startsWith(`${path}/`)
    ));
    if (!isAllowedGraduateApi) {
      return NextResponse.json({ error: 'Graduate access is limited to profile, transcripts, and attendance.' }, { status: 403 });
    }
  }

  return null;
}

export function requireRole(
  allowedRoles: UserRole[],
  handler: RouteHandler,
  options?: RequireRoleOptions
) {
  return withApiPolicy(async (req: NextRequest, context: any) => {
    try {
      // Cheapest possible rejection: refuse an oversized body before spending any
      // work on it. Covers every requireRole-wrapped handler without touching them.
      if (exceedsDeclaredBodyLimit(req, options?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES)) {
        return bodyTooLargeResponse();
      }

      const session = await measurePerformancePhase('auth', () => options?.light
        ? getLightSessionFromRequest(req)
        : getSessionFromRequest(req));
      if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const guard = enforceSessionGuards(req, session, allowedRoles, options);
      if (guard) return guard;

      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const limited = await withRateLimit(req, 'api', `${session.role}:${session.userId}`);
        if (!limited.success) {
          return NextResponse.json(
            { error: 'Too many requests. Please wait and try again.' },
            { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } },
          );
        }
      }

      const enhancedContext = { ...context, session };
      return await measurePerformancePhase('handler', async () => handler(req, enhancedContext as any));
    } catch (err) {
      console.error('RBAC Error:', err);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  });
}

export function getTenantContext(session: JWTPayload): number {
  if (!session.institutionId) {
    throw new Error('Tenant context missing. This route requires an institution ID.');
  }
  return session.institutionId;
}

```

## src/lib/api-policy.ts

SHA256: 26b50ed063b42598d973b0527d5e2534e34196fec15b455b20c6fa7739890fae

```typescript
import type { NextRequest } from 'next/server';
import { applyCorsHeaders } from './cors';
import { stripSessionHeaders } from './session-header';

/** Keep API transport policy in guarded routes so hot endpoints can skip Proxy. */
export function withApiPolicy<TContext>(handler: (req: NextRequest, context: TContext) => Promise<Response>) {
  return async (req: NextRequest, context: TContext) => {
    stripSessionHeaders(req.headers);
    return applyCorsHeaders(req, await handler(req, context));
  };
}

```

## src/lib/auth.ts

SHA256: e40ef8886a3c59ec22723d017c2863e236dbea88d84191d607fab37f515eafc8

```typescript
import { SignJWT } from 'jose';
import { cookies, headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { cache } from 'react';
import { db } from '@/db';
import { institutions, refreshTokens, students } from '@/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { UserRole, JWTPayload, requiresPasswordChange } from './auth-types';
import { verifyAccessToken, getSessionEdge } from './auth-edge';
import { getJwtSecret } from './jwt-secret';
import { SESSION_HEADER, SESSION_SIG_HEADER, verifySessionPayload } from './session-header';
import { getCachedOrFetch, studentEnrichCacheKey } from './redis';
import { verifyUserExists } from './user';

export { verifyAccessToken };
export type { UserRole, JWTPayload };

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const WEB_SESSION_EXPIRY_DAYS = 5;
const ACCESS_TOKEN_EXPIRY = `${WEB_SESSION_EXPIRY_DAYS}d`;
const REFRESH_TOKEN_PATTERN = /^[a-f0-9]{80}$/i;

function createRefreshTokenMaterial() {
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return { refreshToken, tokenHash, expiresAt };
}

async function getCookieScope() {
  const requestHeaders = await headers();
  const host = (requestHeaders.get('host') || '').split(':')[0].toLowerCase();
  const domain = host === 'nisaab360.app' || host.endsWith('.nisaab360.app') ? '.nisaab360.app' : undefined;
  const secure = domain !== undefined && (requestHeaders.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production');
  return { domain, secure };
}

export async function createAccessToken(payload: JWTPayload) {
  return await new SignJWT({ ...payload, mustChangePassword: requiresPasswordChange(payload.role, payload.mustChangePassword) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function createTokens(payload: JWTPayload) {
  const accessToken = await createAccessToken(payload);
  const { refreshToken, tokenHash, expiresAt } = createRefreshTokenMaterial();

  await db.insert(refreshTokens).values({
    userRole: payload.role,
    userId: payload.userId,
    tokenHash,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

type RefreshRotationResult =
  | { status: 'ROTATED'; refreshToken: string; userRole: UserRole; userId: number }
  | { status: 'INVALID' | 'EXPIRED' | 'REUSED' };

/**
 * Atomically consumes one refresh token and creates its replacement.
 *
 * The row lock makes a token single-use even when two requests reach different
 * app replicas. If an already-replaced token appears again, every still-active
 * refresh token for that account is revoked: the old token may have been copied.
 */
export async function rotateRefreshToken(presentedToken: string): Promise<RefreshRotationResult> {
  if (!REFRESH_TOKEN_PATTERN.test(presentedToken)) return { status: 'INVALID' };
  const presentedHash = crypto.createHash('sha256').update(presentedToken).digest('hex');

  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT ${refreshTokens.id}
      FROM ${refreshTokens}
      WHERE ${refreshTokens.tokenHash} = ${presentedHash}
      FOR UPDATE
    `);
    const [record] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, presentedHash))
      .limit(1);
    if (!record) return { status: 'INVALID' } as const;

    const now = new Date();
    if (record.revokedAt) {
      if (!record.replacedByHash) return { status: 'INVALID' } as const;
      await tx
        .update(refreshTokens)
        .set({ reuseDetectedAt: record.reuseDetectedAt ?? now })
        .where(eq(refreshTokens.id, record.id));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(
          eq(refreshTokens.userRole, record.userRole),
          eq(refreshTokens.userId, record.userId),
          isNull(refreshTokens.revokedAt),
        ));
      return { status: 'REUSED' } as const;
    }

    if (record.expiresAt <= now) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(eq(refreshTokens.id, record.id));
      return { status: 'EXPIRED' } as const;
    }

    const next = createRefreshTokenMaterial();
    await tx.insert(refreshTokens).values({
      userRole: record.userRole,
      userId: record.userId,
      tokenHash: next.tokenHash,
      expiresAt: next.expiresAt,
    });
    await tx
      .update(refreshTokens)
      .set({ revokedAt: now, replacedByHash: next.tokenHash })
      .where(eq(refreshTokens.id, record.id));

    return {
      status: 'ROTATED',
      refreshToken: next.refreshToken,
      userRole: record.userRole,
      userId: record.userId,
    } as const;
  });
}

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const cookieStore = await cookies();
  const { domain, secure } = await getCookieScope();
  
  cookieStore.set('access_token', accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: WEB_SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    domain,
  });

  cookieStore.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: WEB_SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    domain,
  });

  // Non-HttpOnly cookie for client-side session expiration tracking
  cookieStore.set('session_exp', (Date.now() + WEB_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toString(), {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: WEB_SESSION_EXPIRY_DAYS * 24 * 60 * 60,
    domain,
  });
}

export async function clearAuthCookies() {
  const cookieStore = await cookies();
  const { domain } = await getCookieScope();
  const cookieNames = ['access_token', 'refresh_token', 'session_exp'];
  
  for (const name of cookieNames) {
    // Delete without domain (covers cookies set before subdomain changes)
    cookieStore.delete(name);
    // Delete with domain (covers cookies set with domain: '.nisaab360.app')
    if (domain) {
      cookieStore.set(name, '', { path: '/', domain, maxAge: 0 });
    }
  }
}

/**
 * Request-scoped session for RSC pages/layouts.
 *
 * When middleware already verified the JWT it forwards the payload as
 * `x-user-session` plus an HMAC in `x-user-session-sig`. A payload whose
 * signature does not verify is discarded and the cookie is checked instead, so a
 * forged header can neither authenticate nor pick its own role/tenant.
 *
 * For a middleware-signed payload the JWT is not re-verified and the Valkey/DB
 * liveness round-trip is skipped for read-only page renders. API mutations still
 * go through getSessionFromRequest → verifyUserExists.
 *
 * Deactivation is enforced within JWT lifetime (5d) plus every mutating API call.
 * Validity cache invalidation still applies to API traffic immediately.
 */
export const getSession = cache(async (): Promise<JWTPayload | null> => {
  let session: JWTPayload | null = null;
  let fromMiddleware = false;
  const headersList = await headers();
  const sessionHeader = headersList.get(SESSION_HEADER);

  if (sessionHeader) {
    const signed = await verifySessionPayload(sessionHeader, headersList.get(SESSION_SIG_HEADER));
    if (signed) {
      try {
        session = JSON.parse(sessionHeader) as JWTPayload;
        fromMiddleware = true;
      } catch {
        // fallback
      }
    }
  }

  if (!session) {
    const cookieStore = await cookies();
    session = await getSessionEdge(cookieStore);
  }

  if (!session) return null;

  if (!fromMiddleware) {
    const exists = await verifyUserExists(session.role, session.userId);
    if (!exists) return null;
  }

  return enrichSession(session);
});

export async function getSessionFromRequest(req: NextRequest): Promise<JWTPayload | null> {
  let session: JWTPayload | null = null;
  const authorization = req.headers.get('authorization');
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  
  if (bearerToken) {
    session = await verifyAccessToken(bearerToken);
  } else {
    session = await getSessionEdge(req.cookies);
  }

  if (session) {
    const exists = await verifyUserExists(session.role, session.userId);
    if (!exists) return null;
    session = await enrichSession(session);
  }

  return session;
}

/**
 * Backfills the academic-status claims for STUDENT tokens issued before those
 * claims existed. Tokens live 5 days (web) to 30 days (refreshed native), so this
 * is a long tail, not a one-off: without a cache it is an extra `students ⋈
 * institutions` round trip on *every* request from those clients.
 *
 * Cached for 2 minutes and invalidated explicitly by the only two writers of the
 * underlying values — batch promotion (`lib/batch-promotion.ts`) and the
 * institution graduate-access toggle. Freshly minted tokens already carry these
 * claims for their full 5-day lifetime, so a 120s ceiling is strictly tighter
 * than the staleness the current design already accepts.
 */
const ENRICH_CACHE_TTL_SECONDS = 120;

async function enrichSession(session: JWTPayload): Promise<JWTPayload> {
  if (session.role !== 'STUDENT') return session;
  // Login/refresh already embed these claims — skip the join when present.
  if (session.studentAcademicStatus !== undefined && session.graduatedStudentAccessAllowed !== undefined) {
    return session;
  }

  const fetchEnrichment = async () => {
    const [student] = await db.select({
      academicStatus: students.academicStatus,
      graduatedAccessAllowed: institutions.allowGraduatedStudentAccess,
    })
      .from(students)
      .innerJoin(institutions, eq(students.institutionId, institutions.id))
      .where(eq(students.id, session.userId))
      .limit(1);
    return student ?? null;
  };

  // A token without an institutionId claim cannot form the invalidatable key, so
  // it falls through to the uncached query rather than to a key nothing clears.
  const student = session.institutionId
    ? await getCachedOrFetch(
        studentEnrichCacheKey(session.institutionId, session.userId),
        ENRICH_CACHE_TTL_SECONDS,
        fetchEnrichment,
      )
    : await fetchEnrichment();

  if (!student) return session;
  return {
    ...session,
    studentAcademicStatus: student.academicStatus,
    graduatedStudentAccessAllowed: student.graduatedAccessAllowed,
  };
}

/** JWT-only session for high-frequency chatty endpoints (heartbeat, unread-count). */
export async function getLightSessionFromRequest(req: NextRequest): Promise<JWTPayload | null> {
  const authorization = req.headers.get('authorization');
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearerToken) return verifyAccessToken(bearerToken);
  return getSessionEdge(req.cookies);
}

export async function revokeAllSessions(role: UserRole, userId: number) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(refreshTokens.userRole, role),
      eq(refreshTokens.userId, userId),
      isNull(refreshTokens.revokedAt),
    ));
}

export async function revokeRefreshToken(refreshToken: string) {
  if (!REFRESH_TOKEN_PATTERN.test(refreshToken)) return;
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

```

## src/lib/auth-edge.ts

SHA256: 5ef448b8b2a850fbce7b8b0b0d5cb9dae9e86baa8b4b10f2ac48b2c85d65fa52

```typescript
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

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  const cached = verifiedTokenCache.get(token);
  if (cached) {
    const now = Date.now();
    if (cached.expMs > now) {
      if (cached.nbf !== undefined && cached.nbf > Math.floor(now / 1000)) return null;
      return cached.payload;
    }
    verifiedTokenCache.delete(token);
  }

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

```

## src/lib/auth-types.ts

SHA256: df8f86a8e4b0dbdb234abb804c4f76c28040a1bbc2a21d4a7b03a7bb07e99b3d

```typescript
export type UserRole = 'SUPER_ADMIN' | 'EMPLOYEE' | 'INSTITUTION' | 'INSTITUTION_ADMIN' | 'STAFF' | 'STUDENT' | 'PARENT';

export function requiresPasswordChange(role: string, mustChangePassword?: boolean): boolean {
  return Boolean(mustChangePassword) && !['STUDENT', 'STAFF', 'PARENT'].includes(role);
}

export interface JWTPayload {
  userId: number;
  role: UserRole;
  institutionId?: number;
  campusId?: number | null;
  mustChangePassword?: boolean;
  isSuperAdmin?: boolean;
  studentAcademicStatus?: 'ACTIVE' | 'GRADUATED';
  graduatedStudentAccessAllowed?: boolean;
  /** ISO timestamp of when the user account was created — used to scope notifications. */
  createdAt?: string;
}

```

## src/lib/jwt-secret.ts

SHA256: a67c26763b87cdd2255e7a4d4a36cf0a425e8b5f3cdfc70a424f34bc080bf155

```typescript
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

```

## src/lib/user.ts

SHA256: ef5fc921676754d76c8b34570c276ef4595bc968e409d778b6bafacce2741d15

```typescript
import { db } from "@/db";
import { students, staff, institutions, employees, superAdmins, institutionAdmins, parentAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { redis } from "./redis";
import type { JWTPayload, UserRole } from "./auth-types";

/**
 * Prefer createdAt embedded in the JWT (set at login/refresh). Falls back to a
 * DB lookup for older tokens that predate the claim.
 */
export async function resolveUserCreatedAt(session: JWTPayload): Promise<Date> {
  if (session.createdAt) {
    const parsed = new Date(session.createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return getUserCreatedAt(session);
}

export async function getUserCreatedAt(session: JWTPayload): Promise<Date> {
  const defaultDate = new Date(0);
  switch (session.role) {
    case "STUDENT": {
      if (!session.institutionId) return defaultDate;
      const [u] = await db.select({ createdAt: students.createdAt }).from(students).where(and(
        eq(students.id, session.userId),
        eq(students.institutionId, session.institutionId),
      )).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "STAFF": {
      if (!session.institutionId) return defaultDate;
      const [u] = await db.select({ createdAt: staff.createdAt }).from(staff).where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, session.institutionId),
      )).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "PARENT": {
      if (!session.institutionId) return defaultDate;
      const [u] = await db.select({ createdAt: parentAccounts.createdAt }).from(parentAccounts).where(and(
        eq(parentAccounts.id, session.userId),
        eq(parentAccounts.institutionId, session.institutionId),
      )).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "INSTITUTION": {
      const [u] = await db.select({ createdAt: institutions.createdAt }).from(institutions).where(eq(institutions.id, session.userId)).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "INSTITUTION_ADMIN": {
      const [u] = await db.select({ createdAt: institutionAdmins.createdAt }).from(institutionAdmins).where(eq(institutionAdmins.id, session.userId)).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "EMPLOYEE": {
      const [u] = await db.select({ createdAt: employees.createdAt }).from(employees).where(eq(employees.id, session.userId)).limit(1);
      return u?.createdAt || defaultDate;
    }
    case "SUPER_ADMIN": {
      const [u] = await db.select({ createdAt: superAdmins.createdAt }).from(superAdmins).where(eq(superAdmins.id, session.userId)).limit(1);
      return u?.createdAt || defaultDate;
    }
    default:
      return defaultDate;
  }
}

const USER_VALIDITY_CACHE_TTL_SECONDS = 600;

function userValidityCacheKey(role: UserRole, userId: number) {
  return `auth:user-validity:${role}:${userId}`;
}

/**
 * Process-local memo in front of the Valkey validity cache, same shape as
 * `verifiedTokenCache` in `auth-edge.ts`.
 *
 * Cache key: `role:userId`
 * Scope: process-local; one entry per authenticated identity, never shared
 * TTL: 30s — 20x tighter than the 600s Valkey TTL it fronts, so this can only
 *      ever *reduce* the existing staleness window, never widen it
 * Max entries: 4096 (evict oldest insertion)
 * Fallback: on miss, Valkey then Postgres exactly as before
 *
 * Valkey stays the cross-replica source of truth; `invalidateUserValidity`
 * clears the local map too, so a revocation issued by this process takes effect
 * immediately here and within 30s on the sibling replica.
 */
const LOCAL_VALIDITY_TTL_MS = 30_000;
const LOCAL_VALIDITY_MAX = 4096;
const localValidityCache = new Map<string, { valid: boolean; expMs: number }>();
const pendingValidity = new Map<string, { promise: Promise<boolean>; invalidated: boolean }>();

function readLocalValidity(key: string): boolean | undefined {
  const hit = localValidityCache.get(key);
  if (!hit) return undefined;
  if (hit.expMs <= Date.now()) {
    localValidityCache.delete(key);
    return undefined;
  }
  return hit.valid;
}

function rememberLocalValidity(key: string, valid: boolean) {
  if (localValidityCache.size >= LOCAL_VALIDITY_MAX) {
    const oldest = localValidityCache.keys().next().value;
    if (oldest !== undefined) localValidityCache.delete(oldest);
  }
  localValidityCache.set(key, { valid, expMs: Date.now() + LOCAL_VALIDITY_TTL_MS });
}

async function verifyUserExistsInDatabase(role: UserRole, userId: number): Promise<boolean> {
  switch (role) {
    case 'SUPER_ADMIN': {
      const [u] = await db.select({ id: superAdmins.id }).from(superAdmins).where(eq(superAdmins.id, userId)).limit(1);
      return !!u;
    }
    case 'EMPLOYEE': {
      const [u] = await db.select({ deletedAt: employees.deletedAt }).from(employees).where(eq(employees.id, userId)).limit(1);
      return !!u && u.deletedAt === null;
    }
    case 'INSTITUTION': {
      const [u] = await db.select({ status: institutions.status }).from(institutions).where(eq(institutions.id, userId)).limit(1);
      return u?.status === 'APPROVED';
    }
    case 'INSTITUTION_ADMIN': {
      const [u] = await db.select({ id: institutionAdmins.id }).from(institutionAdmins).where(eq(institutionAdmins.id, userId)).limit(1);
      return !!u;
    }
    case 'STAFF': {
      const [u] = await db.select({ isActive: staff.isActive }).from(staff).where(eq(staff.id, userId)).limit(1);
      return !!u?.isActive;
    }
    case 'STUDENT': {
      const [u] = await db.select({
        isActive: students.isActive,
        academicStatus: students.academicStatus,
        graduatedAccessAllowed: institutions.allowGraduatedStudentAccess,
      })
        .from(students)
        .innerJoin(institutions, eq(students.institutionId, institutions.id))
        .where(and(eq(students.id, userId), eq(students.isActive, true)))
        .limit(1);
      return !!u && (u.academicStatus !== 'GRADUATED' || u.graduatedAccessAllowed);
    }
    case 'PARENT': {
      const [u] = await db.select({
        status: parentAccounts.status,
        passwordHash: parentAccounts.passwordHash,
        deletedAt: parentAccounts.deletedAt,
        institutionStatus: institutions.status,
      })
        .from(parentAccounts)
        .innerJoin(institutions, eq(parentAccounts.institutionId, institutions.id))
        .where(eq(parentAccounts.id, userId))
        .limit(1);
      return !!u && u.deletedAt === null && u.status !== 'DISABLED' && !!u.passwordHash && u.institutionStatus === 'APPROVED';
    }
    default:
      return false;
  }
}

/**
 * Shared, short-lived validity cache for authenticated requests. Valkey errors
 * deliberately fall through to Postgres so an outage cannot grant or deny access.
 */
export async function verifyUserExists(role: UserRole, userId: number): Promise<boolean> {
  const key = userValidityCacheKey(role, userId);

  // Hot path: no syscall, no round trip. Most authenticated requests land here.
  const local = readLocalValidity(key);
  if (local !== undefined) return local;
  const pending = pendingValidity.get(key);
  if (pending) return pending.promise;
  const request = { promise: Promise.resolve(false), invalidated: false };
  request.promise = fetchUserValidity(role, userId, key, request).finally(() => {
    if (pendingValidity.get(key) === request) pendingValidity.delete(key);
  });
  pendingValidity.set(key, request);
  return request.promise;
}

async function fetchUserValidity(role: UserRole, userId: number, key: string, request: { invalidated: boolean }) {

  try {
    if (redis.status === "ready") {
      const cached = await redis.get(key);
      if (cached === "1") {
        if (!request.invalidated) rememberLocalValidity(key, true);
        return true;
      }
      if (cached === "0") {
        if (!request.invalidated) rememberLocalValidity(key, false);
        return false;
      }
    }
  } catch (error) {
    console.warn("User validity cache read failed; checking Postgres", error);
  }

  const valid = await verifyUserExistsInDatabase(role, userId);

  try {
    if (redis.status === "ready" && !request.invalidated) {
      // Exact TTL: do not use cache TTL jitter for an authorization decision.
      await redis.setex(key, USER_VALIDITY_CACHE_TTL_SECONDS, valid ? "1" : "0");
      if (request.invalidated) await redis.del(key);
    }
  } catch (error) {
    console.warn("User validity cache write failed; continuing without cache", error);
  }

  if (!request.invalidated) rememberLocalValidity(key, valid);
  return valid;
}

function invalidateLocalValidity(key: string) {
  localValidityCache.delete(key);
  const pending = pendingValidity.get(key);
  if (pending) { pending.invalidated = true; pendingValidity.delete(key); }
}

export async function invalidateUserValidity(role: UserRole, userId: number) {
  const key = userValidityCacheKey(role, userId);
  invalidateLocalValidity(key);
  try {
    if (redis.status === "ready") {
      await redis.del(key);
    }
  } catch (error) {
    console.warn("User validity cache invalidation failed", error);
  }
}

export async function invalidateUserValidityBatch(users: Array<{ role: UserRole; userId: number }>) {
  const keys = [...new Set(users.map(({ role, userId }) => userValidityCacheKey(role, userId)))];
  if (keys.length === 0) return;

  for (const key of keys) invalidateLocalValidity(key);

  try {
    if (redis.status === "ready") {
      await redis.del(...keys);
    }
  } catch (error) {
    console.warn("User validity cache batch invalidation failed", error);
  }
}

```

## src/lib/http.ts

SHA256: c5b8fc1c7120863e0eee447afa27a15fcbe89d121671ee89e88053ac559edf08

```typescript
import { NextResponse } from 'next/server';

/**
 * Request-body size limits.
 *
 * App Router route handlers have no built-in body cap: `await req.json()`
 * buffers whatever the client sends into the V8 heap. On a 4 vCPU / 8 GB box
 * that also runs Postgres and Valkey, a handful of concurrent multi-hundred-MB
 * posts is the cheapest available way to OOM the process — no authentication and
 * no rate-limit bucket needed if the route is unauthenticated.
 *
 * `DEFAULT_MAX_BODY_BYTES` sits far above every legitimate payload in this app
 * (the largest is a 500-row student CSV import), so the cap is invisible to
 * clients while removing the exhaustion vector.
 */
export const DEFAULT_MAX_BODY_BYTES = 6 * 1024 * 1024;

/** Auth payloads are a handful of short fields; nothing legitimate comes close. */
export const AUTH_MAX_BODY_BYTES = 16 * 1024;

export type JsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; error: string };

const TOO_LARGE = { ok: false, status: 413, error: 'Request body too large' } satisfies JsonBodyResult<never>;
const INVALID_JSON = { ok: false, status: 400, error: 'Invalid JSON body' } satisfies JsonBodyResult<never>;

/** True when Content-Length alone already exceeds the cap. O(1), no body read. */
export function exceedsDeclaredBodyLimit(req: Request, maxBytes = DEFAULT_MAX_BODY_BYTES): boolean {
  const declared = req.headers.get('content-length');
  if (!declared) return false;
  const length = Number(declared);
  return Number.isFinite(length) && length > maxBytes;
}

export function bodyTooLargeResponse() {
  return NextResponse.json({ error: TOO_LARGE.error }, { status: 413 });
}

/**
 * Bounded replacement for `await req.json()`. Rejects on the declared length when
 * present, and otherwise stops reading (and cancels the stream) the moment the
 * received bytes pass `maxBytes`, so a chunked body cannot get around the check.
 */
export async function readJsonBody<T = unknown>(
  req: Request,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
): Promise<JsonBodyResult<T>> {
  if (exceedsDeclaredBodyLimit(req, maxBytes)) return TOO_LARGE;

  const body = req.body;
  if (!body) return INVALID_JSON;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return TOO_LARGE;
      }
      chunks.push(value);
    }
  } catch {
    return INVALID_JSON;
  }

  if (total === 0) return INVALID_JSON;

  let text: string;
  if (chunks.length === 1) {
    text = new TextDecoder().decode(chunks[0]);
  } else {
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(merged);
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    return INVALID_JSON;
  }
}

```

## src/lib/session-header.ts

SHA256: 7ec55426a77dc8b8b707b7da353117ef32f823a4e5d7bc004ec20b6b562ca147

```typescript
/**
 * Trust boundary for the middleware → server-component session hand-off.
 *
 * `middleware.ts` verifies the JWT once per HTML navigation and forwards the
 * decoded payload to the render as `x-user-session` so `getSession()` does not
 * have to verify it again. That is a genuine optimisation, but the header is
 * indistinguishable from one a client sent: previously any request carrying
 * `x-user-session: {"userId":1,"role":"SUPER_ADMIN",...}` was accepted as that
 * user (and skipped the `verifyUserExists` liveness check with it).
 *
 * Two independent defences:
 *   1. `stripSessionHeaders()` removes both headers from every inbound request
 *      in middleware, so a client-supplied value never reaches a handler.
 *   2. Middleware signs the payload it forwards (`x-user-session-sig`) and
 *      `getSession()` refuses an unsigned or mis-signed header, falling back to
 *      full cookie verification. This keeps the hole closed even if a path ever
 *      slips out of the middleware matcher.
 *
 * WebCrypto is used because this module is imported from both the Edge runtime
 * (middleware) and the Node runtime (route handlers / RSC).
 */

import { getJwtSecret } from './jwt-secret';

export const SESSION_HEADER = 'x-user-session';
export const SESSION_SIG_HEADER = 'x-user-session-sig';

const encoder = new TextEncoder();

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    const secret = new Uint8Array(getJwtSecret()).buffer;
    keyPromise = crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
  }
  return keyPromise;
}

/** Drop any client-supplied session headers. Must run for every inbound request. */
export function stripSessionHeaders(headers: Headers) {
  headers.delete(SESSION_HEADER);
  headers.delete(SESSION_SIG_HEADER);
}

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** HMAC of the exact serialised payload middleware is about to forward. */
export async function signSessionPayload(serialized: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await getKey(), encoder.encode(serialized));
  return toBase64Url(signature);
}

/** True only when `signature` was produced by this deployment's key over `serialized`. */
export async function verifySessionPayload(serialized: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const raw = fromBase64Url(signature);
  if (!raw || raw.length !== 32) return false;
  try {
    return await crypto.subtle.verify(
      'HMAC',
      await getKey(),
      new Uint8Array(raw).buffer,
      encoder.encode(serialized),
    );
  } catch {
    return false;
  }
}

```

## src/lib/cors.ts

SHA256: 7601b48ee07674684ceb9036bdd4bb31bc322f7d9486ba1e7ad403125343d6ad

```typescript
import { NextRequest, NextResponse } from "next/server";

/**
 * Development convenience only: Expo web and the local Next server.
 *
 * These are *not* applied in production. A credentialed grant to
 * `http://localhost:*` on the live API means any page a user happens to be
 * serving locally — an unrelated dev server, a malicious tool they ran, a
 * compromised npm dev dependency — can read authenticated API responses as that
 * user. SameSite=lax blocks the cookie transport for most of those, but the app's
 * native clients authenticate with Bearer tokens, which SameSite does not govern
 * at all, so the grant is worth removing rather than reasoning around.
 *
 * Nothing legitimate depends on it in production: the web portals are same-origin
 * (CORS never applies), and Expo/the desktop panel send no Origin header, which
 * the `!origin` branch below already handles. If a production origin really is
 * needed, list it explicitly in API_ALLOWED_ORIGINS.
 */
const DEV_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:19006",
  "http://localhost:8081",
  "http://127.0.0.1:19006",
  "http://127.0.0.1:8081",
];

function getAllowedOrigins() {
  const configured = process.env.API_ALLOWED_ORIGINS || process.env.MOBILE_APP_ORIGINS;
  if (!configured) return process.env.NODE_ENV === "production" ? [] : DEV_ALLOWED_ORIGINS;
  return configured.split(",").map((origin) => origin.trim()).filter(Boolean);
}

let warnedAboutWildcard = false;

export function applyCorsHeaders<T extends Response>(req: NextRequest, res: T): T {
  const origin = req.headers.get("origin");
  const allowedOrigins = origin ? getAllowedOrigins() : [];
  const allowsAny = allowedOrigins.includes("*");

  // Always advertise that the response varies by Origin. Without this, a shared
  // cache (or Caddy, or a mobile HTTP cache) can serve one origin's credentialed
  // CORS headers — or the `*` no-origin response — to a different origin.
  res.headers.set("Vary", "Origin");

  if (origin && allowedOrigins.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
  } else if (origin && allowsAny) {
    // A wildcard allow-list must never be combined with credentials: reflecting
    // an arbitrary origin while allowing cookies lets any website on the
    // internet read authenticated API responses as the logged-in user.
    // Anonymous cross-origin access still works, exactly as `*` asks for.
    if (!warnedAboutWildcard) {
      warnedAboutWildcard = true;
      console.warn(
        '[cors] API_ALLOWED_ORIGINS contains "*". Serving anonymous cross-origin requests only; ' +
        'credentialed requests need the origins listed explicitly.',
      );
    }
    res.headers.set("Access-Control-Allow-Origin", "*");
  } else if (!origin) {
    // Native clients (Expo, the desktop panel) send no Origin at all. They carry
    // Bearer tokens rather than cookies, so no credentialed grant is needed.
    res.headers.set("Access-Control-Allow-Origin", "*");
  }

  res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Type");
  res.headers.set("Access-Control-Max-Age", "86400");
  return res;
}

export function corsPreflight(req: NextRequest) {
  return applyCorsHeaders(req, new NextResponse(null, { status: 204 }));
}

```

## src/lib/performance.ts

SHA256: 963cf67b1aabbdf766aabc0572d9e3c129526ae8af097336fa512d77a61572b9

```typescript
/** Optional local diagnostics bridge installed by performance-preload.cjs. */
type PerformanceBridge = {
  measure<T>(phase: string, operation: () => Promise<T>): Promise<T>;
};

export function measurePerformancePhase<T>(phase: string, operation: () => Promise<T>): Promise<T> {
  const bridge = (globalThis as typeof globalThis & { __lmsPerformance?: PerformanceBridge }).__lmsPerformance;
  return bridge ? bridge.measure(phase, operation) : operation();
}

```

## src/lib/dashboard-data.ts

SHA256: c06628a915ecb5d717a4214465fccc5d178262b8c383f0ebdd7343d356c27779

```typescript
import { and, asc, desc, eq, gt, isNotNull, isNull, or, sql, type SQLWrapper } from 'drizzle-orm';
import { db } from '@/db';
import { assignments, classes, marks, sections, staff, staffAssignments, students, subjects, submissions, tests } from '@/db/schema';

// Aggregate bounded child queries in Postgres rather than acquiring a client
// for each query. Field aliases preserve the existing API's camelCase JSON.
export function jsonRows<T>(query: SQLWrapper) {
  return sql<T[]>`coalesce((select json_agg(row_to_json(child)) from (${query}) child), '[]'::json)`;
}

type StaffPeriod = { dayOfWeek: number; startTime: string; endTime: string; subjectName: string | null; className: string | null; sectionName: string | null };
type AssignmentPreview = { id: number; title: string; dueAt: string };
type StaffAssignmentPreview = AssignmentPreview & { className: string | null; sectionName: string | null; subjectName: string | null };

function prepareStaffDashboard() {
  const tenantId = sql.placeholder('tenantId');
  const staffId = sql.placeholder('staffId');
  const dayOfWeek = sql.placeholder('dayOfWeek');
  const now = sql.placeholder('now');
  const timetable = db.select({
    dayOfWeek: sql`${staffAssignments.dayOfWeek}`.as('dayOfWeek'),
    startTime: sql`${staffAssignments.startTime}`.as('startTime'),
    endTime: sql`${staffAssignments.endTime}`.as('endTime'),
    subjectName: sql`${subjects.name}`.as('subjectName'),
    className: sql`${classes.name}`.as('className'),
    sectionName: sql`${sections.name}`.as('sectionName'),
  }).from(staffAssignments)
    .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
    .leftJoin(sections, eq(staffAssignments.sectionId, sections.id))
    .leftJoin(classes, eq(sections.classId, classes.id))
    .where(and(eq(staffAssignments.staffId, staffId), eq(staffAssignments.institutionId, tenantId), eq(staffAssignments.dayOfWeek, dayOfWeek)));
  const previewSection = db.select({ sectionId: staffAssignments.sectionId }).from(staffAssignments)
    .where(and(eq(staffAssignments.staffId, staffId), eq(staffAssignments.institutionId, tenantId)))
    .orderBy(asc(staffAssignments.sectionId)).limit(1);
  const upcoming = db.select({
    id: assignments.id, title: assignments.title,
    dueAt: sql`to_char(${assignments.dueAt}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.as('dueAt'),
    className: sql`${classes.name}`.as('className'),
    sectionName: sql`${sections.name}`.as('sectionName'),
    subjectName: sql`${subjects.name}`.as('subjectName'),
  }).from(assignments)
    .innerJoin(classes, eq(assignments.classId, classes.id))
    .leftJoin(sections, eq(assignments.sectionId, sections.id))
    .leftJoin(subjects, eq(assignments.subjectId, subjects.id))
    .where(and(eq(assignments.institutionId, tenantId), eq(assignments.staffId, staffId),
      sql`${assignments.sectionId} = (${previewSection})`, gt(assignments.dueAt, now)))
    .orderBy(assignments.dueAt).limit(3);
  return db.select({ name: staff.name,
    timetable: jsonRows<StaffPeriod>(timetable),
    assignments: jsonRows<StaffAssignmentPreview>(upcoming),
  }).from(staff).where(and(eq(staff.id, staffId), eq(staff.institutionId, tenantId))).limit(1).prepare('');
}

let staffDashboard: ReturnType<typeof prepareStaffDashboard> | undefined;
export async function fetchStaffDashboardData(tenantId: number, staffId: number, dayOfWeek: number, now = new Date()) {
  const [row] = await (staffDashboard ??= prepareStaffDashboard()).execute({ tenantId, staffId, dayOfWeek, now });
  return row;
}

function prepareStudentDashboard() {
  const tenantId = sql.placeholder('tenantId');
  const studentId = sql.placeholder('studentId');
  const pending = db.select({ id: assignments.id, title: assignments.title,
    dueAt: sql`to_char(${assignments.dueAt}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.as('dueAt') })
    .from(assignments)
    .leftJoin(submissions, and(eq(submissions.assignmentId, assignments.id), eq(submissions.studentId, studentId), eq(submissions.institutionId, tenantId)))
    .where(and(eq(assignments.institutionId, tenantId), eq(assignments.classId, students.classId),
      or(eq(assignments.sectionId, students.sectionId), isNull(assignments.sectionId)), isNull(submissions.id)))
    .orderBy(assignments.dueAt).limit(5);
  const latest = db.select({ marksObtained: sql`${marks.marksObtained}`.as('marksObtained'), totalMarks: sql`${marks.totalMarks}`.as('totalMarks') })
    .from(marks).innerJoin(tests, eq(marks.testId, tests.id))
    .where(and(eq(marks.studentId, studentId), eq(marks.institutionId, tenantId), isNotNull(tests.resultsPublishedAt)))
    .orderBy(desc(tests.date), desc(marks.id)).limit(1);
  return db.select({
    name: students.name, classId: students.classId, sectionId: students.sectionId,
    campusId: students.campusId, createdAt: students.createdAt,
    academicStatus: students.academicStatus, expoPushToken: students.expoPushToken,
    assignments: sql<AssignmentPreview[]>`case when ${students.academicStatus} = 'GRADUATED' then '[]'::json else ${jsonRows<AssignmentPreview>(pending)} end`,
    latestMark: sql<{ marksObtained: number; totalMarks: number } | null>`case when ${students.academicStatus} = 'GRADUATED' then null else (select row_to_json(child) from (${latest}) child) end`,
  }).from(students).where(and(eq(students.id, studentId), eq(students.institutionId, tenantId))).limit(1).prepare('');
}

let studentDashboard: ReturnType<typeof prepareStudentDashboard> | undefined;
export async function fetchStudentDashboardData(tenantId: number, studentId: number) {
  const [row] = await (studentDashboard ??= prepareStudentDashboard()).execute({ tenantId, studentId });
  return row;
}

```

## src/lib/announcements.ts

SHA256: a732f7b3f04328e3c62cc3edaffeea27f8dfb7a3050141da8b6946f000d86615

```typescript
import { db } from "@/db";
import { announcementReads, announcements, staff, staffAssignments, students, sections } from "@/db/schema";
import type { JWTPayload } from "@/lib/auth-types";
import { and, desc, eq, inArray, gte, isNull, or, sql } from "drizzle-orm";
import { getUserCreatedAt } from "@/lib/user";
import { getCachedOrFetch } from "@/lib/redis";

export type AnnouncementRecipientRole = "STUDENT" | "STAFF";

export type AnnouncementRecipient = {
  userRole: AnnouncementRecipientRole;
  userId: number;
};

export type VisibleAnnouncement = {
  id: number;
  title: string;
  content: string;
  targetType: "ALL" | "CAMPUS" | "CLASS" | "SECTION" | "USER";
  senderRole: JWTPayload["role"];
  createdAtIso: string;
  isRead: boolean;
};

type AnnouncementRow = typeof announcements.$inferSelect;

function getSessionInstitutionId(session: JWTPayload) {
  return session.role === "INSTITUTION" ? session.userId : session.institutionId;
}

function addRecipient(
  recipients: Map<string, AnnouncementRecipient>,
  announcement: AnnouncementRow,
  userRole: AnnouncementRecipientRole,
  userId: number | null
) {
  if (!userId) return;
  if (announcement.senderRole === userRole && announcement.senderId === userId) return;
  recipients.set(`${userRole}:${userId}`, { userRole, userId });
}

export async function resolveAnnouncementRecipients(announcement: AnnouncementRow): Promise<AnnouncementRecipient[]> {
  const recipients = new Map<string, AnnouncementRecipient>();
  const includeStaffAudience = announcement.senderRole === "INSTITUTION";

  if (announcement.targetType === "ALL") {
    const allStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.institutionId, announcement.institutionId));

    allStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));

    if (includeStaffAudience) {
      const allStaff = await db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.institutionId, announcement.institutionId));

      allStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
    }
  } else if (announcement.targetType === "CAMPUS" && announcement.targetCampusId) {
    const campusStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.institutionId, announcement.institutionId),
        eq(students.campusId, announcement.targetCampusId)
      ));

    campusStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));

    if (includeStaffAudience) {
      const campusStaff = await db
        .select({ id: staff.id })
        .from(staff)
        .where(and(
          eq(staff.institutionId, announcement.institutionId),
          eq(staff.campusId, announcement.targetCampusId)
        ));

      campusStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
    }
  } else if (announcement.targetType === "CLASS" && announcement.targetClassId) {
    const classStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.institutionId, announcement.institutionId),
        eq(students.classId, announcement.targetClassId)
      ));

    classStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));

    if (includeStaffAudience) {
      const classStaff = await db
        .select({ id: staffAssignments.staffId })
        .from(staffAssignments)
        .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
        .where(and(
          eq(staffAssignments.institutionId, announcement.institutionId),
          eq(sections.institutionId, announcement.institutionId),
          eq(sections.classId, announcement.targetClassId)
        ));

      classStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
    }
  } else if (announcement.targetType === "SECTION" && announcement.targetSectionId) {
    const sectionStudents = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.institutionId, announcement.institutionId),
        eq(students.sectionId, announcement.targetSectionId)
      ));

    sectionStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));

    if (includeStaffAudience) {
      const sectionStaff = await db
        .select({ id: staffAssignments.staffId })
        .from(staffAssignments)
        .where(and(
          eq(staffAssignments.institutionId, announcement.institutionId),
          eq(staffAssignments.sectionId, announcement.targetSectionId)
        ));

      sectionStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
    }
  } else if (announcement.targetType === "USER" && announcement.targetUserRole) {
    if (announcement.targetUserRole === "STUDENT") {
      if (announcement.targetUserId) {
        addRecipient(recipients, announcement, "STUDENT", announcement.targetUserId);
      } else {
        const roleStudents = await db
          .select({ id: students.id })
          .from(students)
          .where(eq(students.institutionId, announcement.institutionId));

        roleStudents.forEach((student) => addRecipient(recipients, announcement, "STUDENT", student.id));
      }
    } else if (announcement.targetUserRole === "STAFF") {
      if (announcement.targetUserId) {
        addRecipient(recipients, announcement, "STAFF", announcement.targetUserId);
      } else {
        const roleStaff = await db
          .select({ id: staff.id })
          .from(staff)
          .where(eq(staff.institutionId, announcement.institutionId));

        roleStaff.forEach((staffMember) => addRecipient(recipients, announcement, "STAFF", staffMember.id));
      }
    }
  }

  return Array.from(recipients.values());
}

async function isAnnouncementRecipient(announcement: AnnouncementRow, session: JWTPayload) {
  if (session.role !== "STUDENT" && session.role !== "STAFF") {
    return false;
  }

  // Matches addRecipient(): an author is never a recipient of their own announcement.
  if (
    announcement.senderRole === session.role &&
    announcement.senderId === session.userId
  ) {
    return false;
  }

  if (session.role === "STUDENT") {
    const baseConditions = [
      eq(students.id, session.userId),
      eq(students.institutionId, announcement.institutionId),
    ];

    switch (announcement.targetType) {
      case "ALL":
        break;

      case "CAMPUS":
        if (!announcement.targetCampusId) return false;
        baseConditions.push(
          eq(students.campusId, announcement.targetCampusId)
        );
        break;

      case "CLASS":
        if (!announcement.targetClassId) return false;
        baseConditions.push(
          eq(students.classId, announcement.targetClassId)
        );
        break;

      case "SECTION":
        if (!announcement.targetSectionId) return false;
        baseConditions.push(
          eq(students.sectionId, announcement.targetSectionId)
        );
        break;

      case "USER":
        if (announcement.targetUserRole !== "STUDENT") return false;
        if (
          announcement.targetUserId !== null &&
          announcement.targetUserId !== session.userId
        ) {
          return false;
        }
        break;

      default:
        return false;
    }

    const [recipient] = await db
      .select({ id: students.id })
      .from(students)
      .where(and(
        eq(students.institutionId, announcement.institutionId),
        ...baseConditions,
      ))
      .limit(1);

    return Boolean(recipient);
  }

  // USER-targeted staff announcements do not require an institution sender;
  // this exactly matches resolveAnnouncementRecipients().
  if (announcement.targetType === "USER") {
    if (announcement.targetUserRole !== "STAFF") return false;
    if (
      announcement.targetUserId !== null &&
      announcement.targetUserId !== session.userId
    ) {
      return false;
    }

    const [recipient] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, announcement.institutionId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  // Current code includes staff for ALL/CAMPUS/CLASS/SECTION only when
  // the sender is the institution.
  if (announcement.senderRole !== "INSTITUTION") {
    return false;
  }

  if (announcement.targetType === "ALL") {
    const [recipient] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, announcement.institutionId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  if (announcement.targetType === "CAMPUS") {
    if (!announcement.targetCampusId) return false;

    const [recipient] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(
        eq(staff.id, session.userId),
        eq(staff.institutionId, announcement.institutionId),
        eq(staff.campusId, announcement.targetCampusId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  if (announcement.targetType === "CLASS") {
    if (!announcement.targetClassId) return false;

    const [recipient] = await db
      .select({ id: staffAssignments.id })
      .from(staffAssignments)
      .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
      .where(and(
        eq(staffAssignments.staffId, session.userId),
        eq(staffAssignments.institutionId, announcement.institutionId),
        eq(sections.institutionId, announcement.institutionId),
        eq(sections.classId, announcement.targetClassId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  if (announcement.targetType === "SECTION") {
    if (!announcement.targetSectionId) return false;

    const [recipient] = await db
      .select({ id: staffAssignments.id })
      .from(staffAssignments)
      .where(and(
        eq(staffAssignments.staffId, session.userId),
        eq(staffAssignments.institutionId, announcement.institutionId),
        eq(staffAssignments.sectionId, announcement.targetSectionId)
      ))
      .limit(1);

    return Boolean(recipient);
  }

  return false;
}

function canViewSentOrManagedAnnouncement(announcement: AnnouncementRow, session: JWTPayload) {
  if (announcement.senderRole === session.role && announcement.senderId === session.userId) return true;
  return session.role === "INSTITUTION" && announcement.institutionId === session.userId;
}

function toVisibleAnnouncement(announcement: AnnouncementRow, isRead: boolean): VisibleAnnouncement {
  return {
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    targetType: announcement.targetType,
    senderRole: announcement.senderRole,
    createdAtIso: announcement.createdAt.toISOString(),
    isRead,
  };
}

export async function getVisibleAnnouncements(
  session: JWTPayload,
  limit = 4,
  studentInfo?: { campusId: number | null; classId: number; sectionId: number; createdAt: Date },
  options?: { includeReadStatus?: boolean }
) {
  const institutionId = getSessionInstitutionId(session);
  if (!institutionId) return [];

  let visibleRows: AnnouncementRow[] = [];
  // A dashboard preview and a notices page have different result limits.
  const cacheKey = `cache:announcements:visible:${institutionId}:${session.role}:${session.userId}:${limit}`;

  visibleRows = await getCachedOrFetch(cacheKey, 180, async () => {
    let rows: AnnouncementRow[] = [];
    if (session.role === "INSTITUTION") {
      rows = await db.select()
        .from(announcements)
        .where(eq(announcements.institutionId, institutionId))
        .orderBy(desc(announcements.createdAt))
        .limit(limit);
    } else if (session.role === "STUDENT") {
      const student = studentInfo ?? (await db.select({
        campusId: students.campusId,
        classId: students.classId,
        sectionId: students.sectionId,
        createdAt: students.createdAt,
      }).from(students).where(and(eq(students.id, session.userId), eq(students.institutionId, institutionId))).limit(1))[0];

      if (!student) return [];

      rows = await db.select()
        .from(announcements)
        .where(and(
          eq(announcements.institutionId, institutionId),
          gte(announcements.createdAt, student.createdAt),
          or(
            eq(announcements.targetType, "ALL"),
            student.campusId ? and(eq(announcements.targetType, "CAMPUS"), eq(announcements.targetCampusId, student.campusId)) : undefined,
            and(eq(announcements.targetType, "CLASS"), eq(announcements.targetClassId, student.classId)),
            and(eq(announcements.targetType, "SECTION"), eq(announcements.targetSectionId, student.sectionId)),
            and(
              eq(announcements.targetType, "USER"),
              eq(announcements.targetUserRole, "STUDENT"),
              or(eq(announcements.targetUserId, session.userId), isNull(announcements.targetUserId))
            )
          )
        ))
        .orderBy(desc(announcements.createdAt))
        .limit(limit);
    } else if (session.role === "STAFF") {
      // Keep recipient membership fresh in the same SQL statement instead of
      // acquiring three pool clients to build an in-memory scope list.
      rows = await db.select()
        .from(announcements)
        .where(and(
          eq(announcements.institutionId, institutionId),
          sql`exists (select 1 from ${staff} where ${staff.id} = ${session.userId}
            and ${staff.institutionId} = ${institutionId} and ${announcements.createdAt} >= ${staff.createdAt})`,
          eq(announcements.senderRole, "INSTITUTION"),
          or(
            eq(announcements.targetType, "ALL"),
            and(eq(announcements.targetType, "CAMPUS"), sql`exists (select 1 from ${staff}
              where ${staff.id} = ${session.userId} and ${staff.institutionId} = ${institutionId}
              and ${staff.campusId} = ${announcements.targetCampusId})`),
            and(eq(announcements.targetType, "CLASS"), sql`exists (select 1 from ${staffAssignments}
              inner join ${sections} on ${staffAssignments.sectionId} = ${sections.id}
              where ${staffAssignments.staffId} = ${session.userId} and ${staffAssignments.institutionId} = ${institutionId}
              and ${sections.classId} = ${announcements.targetClassId})`),
            and(eq(announcements.targetType, "SECTION"), sql`exists (select 1 from ${staffAssignments}
              where ${staffAssignments.staffId} = ${session.userId} and ${staffAssignments.institutionId} = ${institutionId}
              and ${staffAssignments.sectionId} = ${announcements.targetSectionId})`),
            and(
              eq(announcements.targetType, "USER"),
              eq(announcements.targetUserRole, "STAFF"),
              or(eq(announcements.targetUserId, session.userId), isNull(announcements.targetUserId))
            )
          )
        ))
        .orderBy(desc(announcements.createdAt))
        .limit(limit);
    }
    return rows;
  });

  // Re-parse createdAt to Date objects since JSON stringifies them
  visibleRows = visibleRows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt),
  }));

  if (visibleRows.length === 0) return [];

  if (options?.includeReadStatus === false) {
    return visibleRows.map((announcement) => toVisibleAnnouncement(announcement, false));
  }

  const readRows = await db.select()
    .from(announcementReads)
    .where(
      and(
        eq(announcementReads.userRole, session.role),
        eq(announcementReads.userId, session.userId),
        inArray(announcementReads.announcementId, visibleRows.map((announcement) => announcement.id))
      )
    );

  const readIds = new Set(readRows.map((row) => row.announcementId));
  return visibleRows.map((announcement) => toVisibleAnnouncement(announcement, readIds.has(announcement.id)));
}

export async function getVisibleAnnouncementById(session: JWTPayload, id: number) {
  const institutionId = getSessionInstitutionId(session);
  if (!institutionId) return null;

  const userCreatedAt = await getUserCreatedAt(session);

  const [announcement] = await db
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.id, id), 
        eq(announcements.institutionId, institutionId),
        gte(announcements.createdAt, userCreatedAt)
      )
    )
    .limit(1);

  if (!announcement) return null;

  const isRecipient = await isAnnouncementRecipient(announcement, session);
  const canViewSent = canViewSentOrManagedAnnouncement(announcement, session);
  if (!isRecipient && !canViewSent) return null;

  if (!isRecipient) return toVisibleAnnouncement(announcement, true);

  const [read] = await db.select()
    .from(announcementReads)
    .where(and(eq(announcementReads.announcementId, id), eq(announcementReads.userRole, session.role), eq(announcementReads.userId, session.userId)))
    .limit(1);

  return toVisibleAnnouncement(announcement, Boolean(read));
}

export async function markAnnouncementRead(session: JWTPayload, id: number) {
  const institutionId = getSessionInstitutionId(session);
  if (!institutionId) throw new Error("Announcement not found");

  const [announcement] = await db
    .select()
    .from(announcements)
    .where(and(eq(announcements.id, id), eq(announcements.institutionId, institutionId)))
    .limit(1);

  if (!announcement) throw new Error("Announcement not found");

  const isRecipient = await isAnnouncementRecipient(announcement, session);
  if (!isRecipient) {
    if (canViewSentOrManagedAnnouncement(announcement, session)) return;
    throw new Error("Announcement not found");
  }

  await db.insert(announcementReads).values({
    announcementId: id,
    userRole: session.role,
    userId: session.userId,
  }).onConflictDoNothing();
}

```

## src/lib/course-streaming.ts

SHA256: b8c13f6257fc064c0419d38fab318614524abfc0244e7cf06644ede6bc6b2eac

```typescript
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { institutions, staff } from "@/db/schema";
import { decryptStreamingCredentials, hasStreamingCredentials } from "@/lib/streaming-credentials";
import { getCachedOrFetch, redis } from "@/lib/redis";

export type CourseStreamingProvider = "BUNNY" | "MUX";

export type CourseStreamingSettings = {
  provider: CourseStreamingProvider;
  credentials: Record<string, string>;
  scope: "INSTITUTION" | "STAFF";
};

export async function getEffectiveCourseStreamingSettings(
  institutionId: number,
  staffId?: number | null,
): Promise<CourseStreamingSettings | null> {
  const [institution] = await db
    .select({
      provider: institutions.courseStreamingProvider,
      credentials: institutions.courseStreamingCredentials,
    })
    .from(institutions)
    .where(eq(institutions.id, institutionId))
    .limit(1);

  const institutionCredentials = decryptStreamingCredentials(institution?.credentials);
  if (institution?.provider && institutionCredentials) {
    return {
      provider: institution.provider,
      credentials: institutionCredentials,
      scope: "INSTITUTION",
    };
  }

  if (!staffId) return null;
  const [teacher] = await db
    .select({
      provider: staff.courseStreamingProvider,
      credentials: staff.courseStreamingCredentials,
    })
    .from(staff)
    .where(and(eq(staff.id, staffId), eq(staff.institutionId, institutionId)))
    .limit(1);
  const teacherCredentials = decryptStreamingCredentials(teacher?.credentials);
  return teacher?.provider && teacherCredentials
    ? { provider: teacher.provider, credentials: teacherCredentials, scope: "STAFF" }
    : null;
}

export async function isInstitutionCourseStreamingConfigured(
  institutionId: number,
) {
  const [institution] = await db
    .select({
      provider: institutions.courseStreamingProvider,
      credentials: institutions.courseStreamingCredentials,
    })
    .from(institutions)
    .where(eq(institutions.id, institutionId))
    .limit(1);

  return Boolean(
    institution?.provider && hasStreamingCredentials(institution.credentials),
  );
}

/** Cached navigation hint only; course authorization uses the fresh check above. */
export function getInstitutionCourseStreamingHint(institutionId: number) {
  return getCachedOrFetch(`cache:courses:enabled:${institutionId}`, 45,
    () => isInstitutionCourseStreamingConfigured(institutionId));
}

export async function invalidateInstitutionCourseStreamingHint(institutionId: number) {
  try {
    if (redis.status === 'ready') await redis.del(`cache:courses:enabled:${institutionId}`);
  } catch (error) {
    console.warn('Course navigation cache invalidation failed', error);
  }
}

```

## src/lib/streaming-credentials.ts

SHA256: d377855be3c770684e2409c3950dd7725173f2023e132c1eff257148290ff68c

```typescript
import crypto from "node:crypto";

function key() {
  // Prefer a dedicated encryption key so streaming-provider credentials can be
  // rotated independently. JWT_SECRET is the safe compatibility fallback: it is
  // already mandatory in every production app container and is validated to be
  // at least 32 characters during startup.
  const secret = process.env.STREAMING_CREDENTIALS_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "STREAMING_CREDENTIALS_SECRET or JWT_SECRET must be at least 32 characters",
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptStreamingCredentials(value: Record<string, string>) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function hasStreamingCredentials(value: string | null | undefined) {
  return Boolean(value?.startsWith("v1."));
}

export function decryptStreamingCredentials(
  value: string | null | undefined,
): Record<string, string> | null {
  if (!value?.startsWith("v1.")) return null;
  const [, encodedIv, encodedTag, encodedValue] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedValue) return null;

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encodedValue, "base64url")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return null;
  }
}

```

## src/lib/redis.ts

SHA256: 2e7a40828d2570c4ef522de855a0dc3b980ff43a0c6e10f32d7ade86c2866775

```typescript
import { Redis } from 'ioredis';
import { measurePerformancePhase } from './performance';
import { TrackedDashboardCache } from './tracked-dashboard-cache';
import { CACHE_ACQUIRE, CACHE_REFRESH, CACHE_STORE, CACHE_UNLOCK } from './cache-scripts';
import { cacheRefreshContext } from './cache-refresh-context';

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
  if (existing) return existing as Promise<T>;

  const fetchPromise = withTimeout(Promise.resolve().then(fetcher), FETCH_TIMEOUT_MS, `cache fetch ${key}`)
    .finally(() => {
      if (inFlightRequests.get(key) === fetchPromise) inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, fetchPromise);
  return fetchPromise;
}

export async function getCachedOrFetch<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, decode: (json: string) => T = JSON.parse): Promise<T> {
  const local = dashboardCache?.peek(key);
  if (local !== undefined) {
    // Refresh hot short-TTL data while its existing value is STILL valid. Never
    // serve data after its original deadline, and never refill a deleted key.
    if (ttlSeconds <= 60 && activeRefreshes < MAX_BACKGROUND_REFRESHES && !inFlightRequests.has(`refresh:${key}`) && dashboardCache?.claimRefresh(key, ttlSeconds * 300)) {
      activeRefreshes++;
      void runDedupedFetch(`refresh:${key}`, async () => {
        try {
          await cacheRefreshContext.run(true, () => refreshCachedValue(key, ttlSeconds, local, fetcher));
        } finally { activeRefreshes--; }
      }).catch(() => {});
    }
    return decode(local);
  }
  // Keep read, fetch, and write together so concurrent callers cannot refill a
  // miss or issue duplicate writes while the first SETEX is still pending.
  return runDedupedFetch(`json:${key}`, async () => {
    try {
      if (redis.status === 'ready') {
        const cached = await (dashboardCache ? dashboardCache.read(key) : redis.get(key));
        if (cached) return decode(cached);
      }
    } catch (err) {
      console.warn(`Redis get error for ${key}:`, err);
    }

    return fillCachedValue(key, ttlSeconds, fetcher, decode);
  });
}

function cacheLifetime(ttlSeconds: number) {
  return ttlSeconds + Math.floor(ttlSeconds * (0.05 + Math.random() * 0.05));
}

async function fillCachedValue<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>, decode: (json: string) => T): Promise<T> {
  const lockKey = `cache:fill-lock:${key}`;
  const owner = crypto.randomUUID();
  let locked = false;
  // Real Redis clients only; isolated build fixtures retain the old fallback.
  if (redis.status === 'ready' && typeof redis.set === 'function') {
    try {
      const deadline = performance.now() + FILL_LOCK_MS;
      do {
        // One atomic exchange replaces SET NX plus the post-lock GET. A sibling
        // that already filled the key wins without taking/releasing another lock.
        const [cached, acquired] = await redis.eval(CACHE_ACQUIRE, 2, key, lockKey, owner, FILL_LOCK_MS) as [string | null, number];
        locked = acquired === 1;
        if (cached !== null) {
          return decode(cached);
        }
        if (locked) break;
        await new Promise(resolve => setTimeout(resolve, 50 + Math.floor(Math.random() * 50)));
      } while (redis.status === 'ready' && performance.now() < deadline);
    } catch { /* Redis outage: use the normal database fallback. */ }
  }
  try {
    const fresh = await fetcher();
    try {
      if (redis.status === 'ready') {
        // A successful store already UNLINKs our lock inside the script; only a
        // rejected store (lost lock / existing value) still needs the unlock below.
        if (locked) locked = await redis.eval(CACHE_STORE, 2, key, lockKey, owner, cacheLifetime(ttlSeconds), JSON.stringify(fresh)) !== 1;
        else if (typeof redis.set !== 'function') await redis.setex(key, cacheLifetime(ttlSeconds), JSON.stringify(fresh));
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
    locked = await redis.eval(CACHE_REFRESH, 2, key, lockKey, owner, cacheLifetime(ttlSeconds), JSON.stringify(fresh), previous) !== 1;
  } finally { if (locked) await redis.eval(CACHE_UNLOCK, 1, lockKey, owner).catch(() => {}); }
}

async function deleteKeysByPattern(pattern: string) {
  if (redis.status !== 'ready') return;
  try {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const keysToDelete: string[] = [];
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) keysToDelete.push(...keys);
    }
    // UNLINK, not DEL: reclaiming memory happens on a background thread, so a
    // large invalidation never stalls the single Valkey command loop that every
    // request's cache lookup is queued behind.
    if (keysToDelete.length) {
      for (let i = 0; i < keysToDelete.length; i += 500) {
        await redis.unlink(...keysToDelete.slice(i, i + 500));
      }
    }
  } catch (err) {
    console.warn(`Redis SCAN/delete error for pattern ${pattern}:`, err);
  }
}

/** Call after students are created/deleted or tests are created so roster/marks caches don't serve stale data. */
export async function invalidateInstitutionRosterCaches(institutionId: number) {
  if (redis.status !== 'ready') return;
  try {
    await redis.del(
      `cache:rosters:${institutionId}`,
      `cache:dashboard:${institutionId}`,
      `cache:dashboard:students:${institutionId}`,
      `cache:dashboard:class-dist:${institutionId}`,
    );
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

/** Invalidate individual student dashboard cache when assignment/mark changes occur. */
export async function invalidateStudentDashboardCache(institutionId: number, studentId: number) {
  if (redis.status !== 'ready') return;
  try {
    // The web dashboard key is suffixed with `new Date().getDay()`, so the key
    // set is exactly seven — enumerate them instead of SCANning the keyspace.
    const webKeys = Array.from({ length: 7 }, (_, day) => `cache:student:dashboard:web:${studentId}:${institutionId}:${day}`);
    await redis.unlink(`cache:student:dashboard:${studentId}:${institutionId}`, ...webKeys);
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
      for (const studentId of uniqueStudentIds.slice(offset, offset + 100)) {
        pipeline.incr(`cache:student:marks:version:${studentId}`);
        pipeline.unlink(
          `cache:student:marks:${studentId}:default`,
          `cache:student:dashboard:${studentId}:${institutionId}`,
          ...Array.from({ length: 7 }, (_, day) => `cache:student:dashboard:web:${studentId}:${institutionId}:${day}`),
        );
      }
      await pipeline.exec();
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
  return runDedupedFetch(`raw:${key}`, async () => {
    try {
      if (redis.status === 'ready') {
        const cached = await redis.get(key);
        if (cached) return cached;
      }
    } catch (err) {
      console.warn(`Redis get error for ${key}:`, err);
    }

    const fresh = await fetcher();

    try {
      if (redis.status === 'ready') {
        const jitter = Math.floor(ttlSeconds * (0.05 + Math.random() * 0.05));
        await redis.setex(key, ttlSeconds + jitter, fresh);
      }
    } catch (err) {
      console.warn(`Redis setex error for ${key}:`, err);
    }

    return fresh;
  });
}

```

## src/lib/cache-scripts.ts

SHA256: a83b87698ac7cdcd06d91ed95e2f446ee86ed820eb8911a7343f5c51976db06c

```typescript
// Known scripts mutate only the supplied keys. Tracking can invalidate those
// keys without flushing every unrelated local cache entry.
export const CACHE_UNLOCK = 'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("UNLINK", KEYS[1]) else return 0 end';
export const CACHE_STORE = 'if redis.call("GET", KEYS[2]) == ARGV[1] and not redis.call("GET", KEYS[1]) then redis.call("SETEX", KEYS[1], ARGV[2], ARGV[3]); redis.call("UNLINK", KEYS[2]); return 1 else return 0 end';
export const CACHE_REFRESH = 'if redis.call("GET", KEYS[2]) == ARGV[1] and redis.call("GET", KEYS[1]) == ARGV[4] then redis.call("SETEX", KEYS[1], ARGV[2], ARGV[3]); redis.call("UNLINK", KEYS[2]); return 1 else return 0 end';
export const CACHE_WRITE_SCRIPTS = new Set([CACHE_UNLOCK, CACHE_STORE, CACHE_REFRESH]);
// Reads the payload and acquires only its separate fill lock atomically. This
// script never changes read-data keys, so it must not flush their tracked cache.
export const CACHE_ACQUIRE = 'local value = redis.call("GET", KEYS[1]); if value then return {value, 0} end; local locked = redis.call("SET", KEYS[2], ARGV[1], "PX", ARGV[2], "NX"); return {false, locked and 1 or 0}';

```

## src/lib/cache-refresh-context.ts

SHA256: d8cd96fe09bbfeedc65421009dcf51a2cbc120f2fa78bcf32de7983d85e8a1a1

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

// Read-data refreshes must not occupy the foreground request pool. Context
// propagates through nested reads without changing their authorization or TTL.
export const cacheRefreshContext = new AsyncLocalStorage<boolean>();

```

## src/lib/tracked-dashboard-cache.ts

SHA256: 379e69eb2ae6ebd8c4e69a8280c4cb437b25bde49c2badb5ba02bf7c1ef8c264

```typescript
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

```

## src/lib/dashboard-response.ts

SHA256: 870300a07ec596d6917c945a6e48744d65e5ac03046f46b3f075f04035e10d0f

```typescript
// Reuse decoding/encoding of identical JSON. The tracked dashboard cache retains
// Redis's deadline and receives invalidations; response streams remain per-call.
const decoded = new Map<string, object>();
const responses = new WeakMap<object, Map<boolean, { body: string; status: number }>>();
const timetables = new WeakMap<object, string>();
const MAX_ENTRIES = 4096;
const MAX_JSON_LENGTH = 16_384;

// The standalone adapter can send this immutable JSON directly. Keep an ordinary
// independent Response stream for Next's normal request handler and other callers.
function serializedResponse(body: string, init: ResponseInit) {
  // The native adapter writes the immutable string directly. A string BodyInit
  // otherwise schedules an eager stream pull/UTF-8 encoding for every cache hit,
  // even though that body is never read. A zero-buffer stream does this work only
  // when Next, text(), clone(), or another ordinary Response consumer reads it.
  // Each response encodes its own bytes, so a reader cannot mutate another body.
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  }, { highWaterMark: 0 });
  return Object.defineProperty(new Response(stream, init), Symbol.for('nisaab360.serialized-json'), { value: body });
}

/** Dashboard callers treat these decoded payloads as immutable. */
export function decodeDashboardPayload<T extends object>(json: string): T {
  const hit = decoded.get(json);
  if (hit) return hit as T;
  const payload = JSON.parse(json) as T;
  if (payload && typeof payload === 'object' && json.length <= MAX_JSON_LENGTH) {
    if (decoded.size >= MAX_ENTRIES) decoded.delete(decoded.keys().next().value!);
    decoded.set(json, payload);
  }
  return payload;
}

export function dashboardResponse(payload: object, coursesEnabled: boolean, headers?: Headers) {
  let variants = responses.get(payload);
  if (!variants) { variants = new Map(); responses.set(payload, variants); }
  let variant = variants.get(coursesEnabled);
  if (!variant) {
    const status = 'error' in payload ? 404 : 200;
    variant = { status, body: JSON.stringify(status === 404 ? payload : { ...payload, coursesEnabled }) };
    variants.set(coursesEnabled, variant);
  }
  // Never reuse a Response or its headers: each caller has its own CORS, timing
  // and request ID, and a response body stream can only be consumed once.
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/json');
  return serializedResponse(variant.body, { status: variant.status, headers: responseHeaders });
}

/** Cache JSON encoding only; every authenticated call gets its own response. */
export function timetableResponse(timetable: object) {
  let body = timetables.get(timetable);
  if (body === undefined) { body = JSON.stringify({ timetable }); timetables.set(timetable, body); }
  return serializedResponse(body, { headers: { 'Content-Type': 'application/json' } });
}

```

## src/db/index.ts

SHA256: b3175924308970d87e306df0ccb9a0619fcdfd435d064aa9a626e65d0f94f66f

```typescript
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { cacheRefreshContext } from '@/lib/cache-refresh-context';

const configuredPoolMax = Number.parseInt(process.env.DB_POOL_MAX ?? "15", 10);
const poolMax = Number.isFinite(configuredPoolMax) && configuredPoolMax > 0 ? configuredPoolMax : 15;

// Patch console.error to prevent dumping huge PG error objects with undefined fields
const originalError = console.error;
console.error = (...args: unknown[]) => {
  const newArgs = args.map(arg => {
    if (arg instanceof Error && (('query' in arg && 'params' in arg) || ('schema' in arg && 'table' in arg))) {
      // Drizzle's message/stack includes the entire SQL and parameters. During
      // pool exhaustion, serializing thousands of these worsens the backlog.
      const cause = arg.cause instanceof Error ? arg.cause : arg;
      return {
        message: cause.message,
        code: 'code' in cause ? cause.code : undefined,
        name: arg.name,
      };
    }
    return arg;
  });
  originalError(...newArgs);
};

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL!,
  max: poolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // PgBouncer rejects statement_timeout as a PostgreSQL startup parameter.
  // Keep the client-side query timeout below instead so pooled connections work.
  query_timeout: 5000,
  keepAlive: true,
  application_name: 'nisaab360_api'
});

// Background refresh has a bounded budget of its own. A refresh burst cannot
// consume the connections needed for fresh profiles, membership and mutations.
export const cacheRefreshPool = new Pool({
  ...pool.options,
  max: 4,
  application_name: 'nisaab360_cache_refresh',
});
cacheRefreshPool.on('error', (err) => {
  console.error('PostgreSQL cache refresh pool error:', err.message);
});
const foregroundQuery = pool.query;
pool.query = ((...args: unknown[]) => {
  const target = cacheRefreshContext.getStore() ? cacheRefreshPool : pool;
  const query = target === pool ? foregroundQuery : cacheRefreshPool.query;
  return Reflect.apply(query, target, args);
}) as typeof pool.query;

// Readiness must not queue behind hundreds of ordinary requests and convince
// the proxy that a responsive process has died. One separate probe connection
// still checks the same database through PgBouncer, with bounded timeouts.
export const readinessPool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  query_timeout: 2000,
  keepAlive: true,
  application_name: 'nisaab360_readiness',
});
readinessPool.on('error', (err) => {
  console.error('PostgreSQL readiness pool error:', err.message);
});

// Idle client errors must be handled or they can crash the process / leave bad sockets.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

export { pool };
export const db = drizzle(pool, { schema });

```

## src/app/api/student/timetable/route.ts

SHA256: ac8b1826f4da84e11df767ca7898a862b08663e55d70b705fb5ce488899c4d28

```typescript
import { NextRequest, NextResponse } from 'next/server';
export { corsPreflight as OPTIONS } from '@/lib/cors';
import { db } from '@/db';
import { staffAssignments, subjects, staff, students } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireRole, getTenantContext } from '@/lib/rbac';
import { getCachedOrFetch } from '@/lib/redis';
import { decodeDashboardPayload, timetableResponse } from '@/lib/dashboard-response';

// Reuse SQL compilation only; section membership is checked fresh on every call.
function prepareMembership() {
  return db.select({
    id: students.id,
    sectionId: students.sectionId,
    institutionId: students.institutionId,
  }).from(students).where(and(eq(students.id, sql.placeholder('userId')), eq(students.institutionId, sql.placeholder('tenantId')))).limit(1).prepare('');
}
let membershipQuery: ReturnType<typeof prepareMembership> | undefined;

export const GET = requireRole(['STUDENT'], async (req: NextRequest, { session }) => {
  const tenantId = getTenantContext(session);

  const [student] = await (membershipQuery ??= prepareMembership()).execute({ userId: session.userId, tenantId });
  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // Students belong to a section, not (yet) to a section_group.
  // Until student↔group membership exists, return every period for the section
  // (including parallel elective groups) so the slot shows the full split.
  const timetable = await getCachedOrFetch(
    `cache:timetable:student:${tenantId}:${student.sectionId}`,
    600,
    () => db.select({
      dayOfWeek: staffAssignments.dayOfWeek,
      startTime: staffAssignments.startTime,
      endTime: staffAssignments.endTime,
      subjectName: subjects.name,
      teacherName: staff.name,
    })
      .from(staffAssignments)
      .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
      .where(and(eq(staffAssignments.sectionId, student.sectionId), eq(staffAssignments.institutionId, tenantId))),
    decodeDashboardPayload,
  );

  return timetableResponse(timetable);
});

```

## src/app/api/staff/timetable/route.ts

SHA256: 23490e6ccf8269ca1a6c0383c307ca15ffad749fca322d1d63462b99f0038e0e

```typescript
import { NextRequest } from 'next/server';
export { corsPreflight as OPTIONS } from '@/lib/cors';
import { db } from '@/db';
import { classes, staffAssignments, subjects, sections } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole, getTenantContext } from '@/lib/rbac';
import { getCachedOrFetch } from '@/lib/redis';
import { decodeDashboardPayload, timetableResponse } from '@/lib/dashboard-response';

export const GET = requireRole(['STAFF'], async (req: NextRequest, { session }) => {
  const tenantId = getTenantContext(session);

  const timetable = await getCachedOrFetch(
    `cache:timetable:staff:v2:${tenantId}:${session.userId}`,
    600,
    () => db.select({
      dayOfWeek: staffAssignments.dayOfWeek,
      startTime: staffAssignments.startTime,
      endTime: staffAssignments.endTime,
      subjectName: subjects.name,
      className: classes.name,
      sectionName: sections.name,
    })
      .from(staffAssignments)
      .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .leftJoin(sections, eq(staffAssignments.sectionId, sections.id))
      .leftJoin(classes, eq(sections.classId, classes.id))
      .where(and(eq(staffAssignments.staffId, session.userId), eq(staffAssignments.institutionId, tenantId))),
    decodeDashboardPayload,
  );

  return timetableResponse(timetable);
});

```

## src/app/api/student/profile/route.ts

SHA256: c6d022ed17ccdf28bd579907175c2711e2e55440d564dda05a9172a0126e1942

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { students, classes, sections, campuses } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { updateStudentProfileSchema } from "@/lib/validators/student";
import { and, eq, sql } from "drizzle-orm";
export { corsPreflight as OPTIONS } from "@/lib/cors";

// Compile SQL/row mapping once; every profile read still queries the database.
// Empty statement name uses pg's unnamed protocol, safe with transaction pooling.
function prepareProfile() {
  return db.select({
      id: students.id, name: students.name, fatherName: students.fatherName, phone: students.phone,
      gender: students.gender, profilePictureUrl: students.profilePictureUrl,
      emergencyContact: students.emergencyContact, parentalWhatsapp: students.parentalWhatsapp,
      loginRollNumber: students.loginRollNumber, classRollNumber: students.classRollNumber,
      academicStatus: students.academicStatus, age: students.age,
      className: classes.name, sectionName: sections.name, campusName: campuses.name,
    }).from(students)
    .leftJoin(classes, eq(students.classId, classes.id))
    .leftJoin(sections, eq(students.sectionId, sections.id))
    .leftJoin(campuses, eq(students.campusId, campuses.id))
    .where(and(eq(students.id, sql.placeholder("userId")), eq(students.institutionId, sql.placeholder("institutionId"))))
    .prepare('');
}
let profileQuery: ReturnType<typeof prepareProfile> | undefined;

export const GET = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [profile] = await (profileQuery ??= prepareProfile()).execute({ userId: session.userId, institutionId: session.institutionId });
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    if (req.nextUrl.searchParams.get("include") !== "catalog") return NextResponse.json({ profile });
    const allClasses = await db.select({ id: classes.id, name: classes.name }).from(classes)
      .where(eq(classes.institutionId, session.institutionId));
    const allSections = await db.select({ id: sections.id, name: sections.name, classId: sections.classId }).from(sections)
      .where(eq(sections.institutionId, session.institutionId));
    return NextResponse.json({ profile, classes: allClasses, sections: allSections });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
});

export const PATCH = requireRole(["STUDENT"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.studentAcademicStatus === "GRADUATED") {
    return NextResponse.json({ error: "Profile updates are closed after graduation." }, { status: 403 });
  }
  const body = await req.json();
  const parsed = updateStudentProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await db.update(students)
    .set({ 
      ...(parsed.data.fatherName && { fatherName: parsed.data.fatherName }),
      ...(parsed.data.profilePictureUrl && { profilePictureUrl: parsed.data.profilePictureUrl }),
      ...(parsed.data.emergencyContact !== undefined && { emergencyContact: parsed.data.emergencyContact }),
      ...(parsed.data.parentalWhatsapp !== undefined && { parentalWhatsapp: parsed.data.parentalWhatsapp }),
      ...(parsed.data.age !== undefined && { age: parsed.data.age })
    })
    .where(and(eq(students.id, session.userId), eq(students.institutionId, session.institutionId)));

  return NextResponse.json({ message: "Profile updated successfully" });
});

```

## src/app/api/staff/profile/route.ts

SHA256: 1baf62e65a0310341db5c09b112360c55e76bef608b28625f701d7b66cb8899c

```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staff, campuses } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { and, eq, sql } from "drizzle-orm";
export { corsPreflight as OPTIONS } from "@/lib/cors";

// Compile SQL/row mapping once; every profile read still queries the database.
// Empty statement name uses pg's unnamed protocol, safe with transaction pooling.
function prepareProfile() {
  return db.select({
      id: staff.id, name: staff.name, email: staff.email, phone: staff.phone,
      profilePictureUrl: staff.profilePictureUrl, campusName: campuses.name,
    }).from(staff)
    .leftJoin(campuses, eq(staff.campusId, campuses.id))
    .where(and(eq(staff.id, sql.placeholder("userId")), eq(staff.institutionId, sql.placeholder("institutionId"))))
    .prepare('');
}
let profileQuery: ReturnType<typeof prepareProfile> | undefined;

export const GET = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [profile] = await (profileQuery ??= prepareProfile()).execute({ userId: session.userId, institutionId: session.institutionId });
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    const allCampuses = req.nextUrl.searchParams.get("campuses") === "1"
      ? await db.select({ id: campuses.id, name: campuses.name }).from(campuses)
        .where(eq(campuses.institutionId, session.institutionId))
      : [];
    return NextResponse.json({ profile, campuses: allCampuses });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
});

export const PATCH = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = (await import("@/lib/validators/staff")).updateStaffProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  await db.update(staff)
    .set({ 
      ...(parsed.data.profilePictureUrl && { profilePictureUrl: parsed.data.profilePictureUrl })
    })
    .where(and(eq(staff.id, session.userId), eq(staff.institutionId, session.institutionId)));

  return NextResponse.json({ message: "Profile updated successfully" });
});

```

## src/lib/rate-limit.ts

SHA256: fe5fbc6bcec4ec4d44ee6ab0754878902e3ce178d671cb5c8a627f4cbc5ab91f

```typescript
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

```
