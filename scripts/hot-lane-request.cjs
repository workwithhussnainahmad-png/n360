'use strict';
/** Defer Next's URL/cookie adaptation on the six audited bearer-only GET paths. */
function createHotLaneRequest(req, NextRequest, light = false) {
  const host = req.headers.host || 'localhost';
  const url = `http://${host}${req.url}`;
  const headers = new Headers(req.headers);
  if (!light || typeof req.headers.authorization !== 'string' || !/^Bearer\s+(.+)$/i.test(req.headers.authorization)) {
    return new NextRequest(url, { method: 'GET', headers });
  }
  // Reject malformed URLs just as NextRequest does. No cookies/NextURL needed
  // for these bearer-authenticated handlers; standard URL supplies used fields.
  const parsed = new URL(url);
  let fallback;
  const base = { method: 'GET', headers, url, nextUrl: parsed };
  return new Proxy(base, {
    get(target, key) {
      if (Reflect.has(target, key)) return Reflect.get(target, key);
      // Preserve the rest of the Request API if a handler later needs it.
      fallback ??= new NextRequest(url, { method: 'GET', headers });
      const value = Reflect.get(fallback, key, fallback);
      return typeof value === 'function' ? value.bind(fallback) : value;
    },
  });
}
// Only the audited synchronous warm callback receives this restricted facade.
// A miss is handled with the full Request above, including cookie authentication.
function createNativeWarmRequest(req) {
  const url = `http://${req.headers.host || 'localhost'}${req.url}`;
  const deleted = new Set();
  const headers = {
    get(name) {
      name = name.toLowerCase();
      if (deleted.has(name)) return null;
      const value = req.headers[name];
      return value === undefined ? null : String(value).replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, '');
    },
    delete(name) { deleted.add(name.toLowerCase()); },
  };
  return { method: 'GET', url, nextUrl: new URL(url), headers };
}
module.exports = { createHotLaneRequest, createNativeWarmRequest };
