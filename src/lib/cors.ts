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

export function applyCorsHeaders<T extends { headers: Pick<Headers, 'set'> }>(req: NextRequest, res: T): T {
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
