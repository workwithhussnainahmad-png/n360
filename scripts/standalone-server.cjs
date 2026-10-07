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
 * module's GET directly and write its serialized Response with Content-Length.
 * Audited bearer GETs can defer NextRequest construction; fully warm dashboards
 * use a guarded native response callback attached to that same GET function.
 * The handlers are the same compiled modules Next would load
 * (same Node module instance, so pools, caches and tracking are shared), and all
 * of them are wrapped by requireRole/withApiPolicy, which already performs the
 * transport policy the Proxy applies to other API routes (session-header
 * stripping, CORS). Authentication, tenant/ownership and cache behaviour are
 * retained by the shared guard and the ordinary fallback handler.
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
const { createHotLaneRequest, createNativeWarmRequest } = require('./hot-lane-request.cjs');

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
const LIGHT_REQUEST_ENABLED = process.env.HOT_PATH_LIGHT_REQUEST === '1';
const NATIVE_WARM_ENABLED = process.env.HOT_PATH_NATIVE_WARM === '1';
const LIGHT_REQUEST_ROUTES = new Set([
  '/api/student/dashboard', '/api/student/timetable', '/api/student/profile',
  '/api/staff/dashboard', '/api/staff/timetable', '/api/staff/profile',
]);
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
    if (NATIVE_WARM_ENABLED && entry.nativeWarm) {
      const native = entry.nativeWarm(createNativeWarmRequest(req));
      if (native) {
        if (typeof native.body !== 'string' || native.status !== 200 || !native.headers?.values) {
          throw new Error('Invalid native warm response');
        }
        if (res.destroyed) return;
        const headers = { ...entry.headers, ...native.headers.values,
          'content-length': String(Buffer.byteLength(native.body)) };
        res.writeHead(native.status, headers);
        res.end(native.body);
        return;
      }
    }
    const request = createHotLaneRequest(req, NextRequest, LIGHT_REQUEST_ENABLED && entry.lightRequest);
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
      const nativeWarm = LIGHT_REQUEST_ROUTES.has(pathname) && handler[Symbol.for('nisaab360.native-warm-get')];
      lane.set(pathname, { handler, headers: staticHeadersFor(routesManifest, pathname), lightRequest: LIGHT_REQUEST_ROUTES.has(pathname),
        nativeWarm: typeof nativeWarm === 'function' ? nativeWarm : null });
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
