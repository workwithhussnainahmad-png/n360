import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionEdge } from './lib/auth-edge';
import { applyCorsHeaders, corsPreflight } from './lib/cors';
import { SESSION_HEADER, SESSION_SIG_HEADER, signSessionPayload, stripSessionHeaders } from './lib/session-header';
import { DEFAULT_MAX_BODY_BYTES, bodyTooLargeResponse, exceedsDeclaredBodyLimit } from './lib/http';
import { parseInstitutionHostname } from './lib/institution-domain';
import { getPublicSiteBaseDomain } from './lib/public-site-domain';
import { MAX_RESTORE_UPLOAD_BYTES } from './lib/institution-restore-limits';
import { CAMPUS_VIEW_COOKIE, CAMPUS_READ_ONLY_ERROR, isCampusAccount, readCampusViewToken } from './lib/campus-view';

const WEB_SESSION_MAX_AGE = 5 * 24 * 60 * 60;

export async function proxy(request: NextRequest) {
  const bodyLimit = request.method === 'POST' && request.nextUrl.pathname === '/api/institution/restore-requests'
    ? MAX_RESTORE_UPLOAD_BYTES : DEFAULT_MAX_BODY_BYTES;
  // Global body ceiling, enforced at the edge before any handler, Server Action
  // or `req.json()` allocates. `requireRole` repeats this check for defence in
  // depth, but ~18 mutating routes authenticate via `getSession()` instead and
  // are only covered here. Only the bounded restore ZIP upload gets the larger
  // ceiling; ordinary JSON and CSV handlers retain the existing limit.
  if (
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    exceedsDeclaredBodyLimit(request, bodyLimit)
  ) {
    const tooLarge = bodyTooLargeResponse();
    return request.nextUrl.pathname.startsWith('/api')
      ? applyCorsHeaders(request, tooLarge)
      : tooLarge;
  }

  // Sanitised copy of the inbound headers, built once and used by every
  // next()/rewrite() below. `x-user-session` is a trusted internal header, so a
  // client-supplied one must never survive into a handler.
  const requestHeaders = new Headers(request.headers);
  stripSessionHeaders(requestHeaders);
  const forwarded = { request: { headers: requestHeaders } };

  // Block writes before custom API handlers and Server Actions. RBAC also
  // validates the selected workspace and current membership against the DB.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.cookies.has(CAMPUS_VIEW_COOKIE)) {
    const identity = await getSessionEdge(request.cookies);
    if (identity && isCampusAccount(identity)) {
      const homeId = identity.role === 'INSTITUTION' ? identity.userId : identity.institutionId;
      const target = await readCampusViewToken(request.cookies.get(CAMPUS_VIEW_COOKIE)?.value, { ...identity, homeInstitutionId: homeId });
      const exceptions = ['/api/institution/campus-view', '/api/auth/logout', '/api/auth/refresh'];
      if (target && target !== homeId && !exceptions.includes(request.nextUrl.pathname)) {
        const denied = NextResponse.json({ error: CAMPUS_READ_ONLY_ERROR }, { status: 403 });
        return request.nextUrl.pathname.startsWith('/api') ? applyCorsHeaders(request, denied) : denied;
      }
    }
  }

  if (request.nextUrl.pathname.startsWith('/api')) {
    if (request.method === 'OPTIONS') return corsPreflight(request);
    return applyCorsHeaders(request, NextResponse.next(forwarded));
  }

  const session = await getSessionEdge(request.cookies);
  const path = request.nextUrl.pathname;
  const hostname = (request.headers.get('host') || '').split(':')[0].toLowerCase();

  let rewritePath: string | null = null;
  const isStaticOrApi = path.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf)$/i) || path.startsWith('/api') || path.startsWith('/payments/');
  const isAuthPath = path === '/login' || path === '/institution-login' || path === '/employee-login' || path === '/parent-login' || path === '/login/super-admin' || path === '/force-password-change';

  if (!isStaticOrApi) {
    if (hostname === 'blog.nisaab360.app' || hostname.startsWith('blog.localhost')) {
      rewritePath = `/blog${path === '/' ? '' : path}`;
    } else if (hostname === 'student.nisaab360.app' || hostname.startsWith('student.localhost')) {
      if (!isAuthPath && !path.startsWith('/student')) rewritePath = `/student${path === '/' ? '' : path}`;
    } else if (hostname === 'staff.nisaab360.app' || hostname.startsWith('staff.localhost')) {
      if (!isAuthPath && !path.startsWith('/staff')) rewritePath = `/staff${path === '/' ? '' : path}`;
    } else if (hostname === 'parent.nisaab360.app' || hostname.startsWith('parent.localhost')) {
      if (!isAuthPath && !path.startsWith('/parent')) rewritePath = `/parent${path === '/' ? '' : path}`;
    } else if (hostname === 'institution.nisaab360.app' || hostname.startsWith('institution.localhost')) {
      if (!isAuthPath && !path.startsWith('/institution')) rewritePath = `/institution${path === '/' ? '' : path}`;
    } else if (hostname === 'employee.nisaab360.app' || hostname.startsWith('employee.localhost')) {
      if (!isAuthPath && !path.startsWith('/employee')) rewritePath = `/employee${path === '/' ? '' : path}`;
    } else if (hostname === 'sa.nisaab360.app' || hostname === 'superadmin.nisaab360.app' || hostname.startsWith('sa.localhost')) {
      if (!isAuthPath && !path.startsWith('/sa')) rewritePath = `/sa${path === '/' ? '' : path}`;
    } else {
      const parsedHostname = parseInstitutionHostname(request.headers.get('host') || '', await getPublicSiteBaseDomain());
      if (parsedHostname.kind === 'institution') {
        rewritePath = path.startsWith('/sites')
          ? '/sites/__invalid__'
          : `/sites/${parsedHostname.slug}${path === '/' ? '' : path}`;
      }
    }
  }

  const virtualPath = rewritePath || path;



  if (
    session &&
    !session.mustChangePassword &&
    // Keep parent login reachable even with a stale/invalid parent session.
    // The parent layout redirects invalid accounts here; redirecting it back to
    // the dashboard creates an endless /parent-login <-> /parent/dashboard loop.
    (virtualPath === '/' ||
      virtualPath === '/login' ||
      virtualPath === '/institution-login' ||
      virtualPath === '/employee-login' ||
      virtualPath === '/login/super-admin')
  ) {
    return keepWebSessionAlive(
      NextResponse.redirect(new URL(getDashboardPath(session, request), request.url)),
      request
    );
  }

  // Protect force-password-change path
  if (virtualPath === '/force-password-change') {
    if (!session) return NextResponse.redirect(new URL('/login', request.url));
    if (!session.mustChangePassword) {
      return keepWebSessionAlive(
        NextResponse.redirect(new URL(getDashboardPath(session, request), request.url)),
        request
      );
    }
    const res = rewritePath
      ? NextResponse.rewrite(new URL(rewritePath, request.url), forwarded)
      : NextResponse.next(forwarded);
    return keepWebSessionAlive(res, request);
  }

  // Handle password change requirement globally
  if (session && session.mustChangePassword && !virtualPath.startsWith('/api/auth/change-password')) {
    return keepWebSessionAlive(
      NextResponse.redirect(new URL('/force-password-change', request.url)),
      request
    );
  }

  if (virtualPath.startsWith('/sa')) {
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.redirect(new URL('/login/super-admin', request.url));
    }
  }

  if (virtualPath === '/employee' || virtualPath.startsWith('/employee/')) {
    if (!session || session.role !== 'EMPLOYEE') {
      return NextResponse.redirect(new URL('/employee-login', request.url));
    }
  }

  if (virtualPath === '/institution' || virtualPath.startsWith('/institution/')) {
    if (!session || (session.role !== 'INSTITUTION' && session.role !== 'INSTITUTION_ADMIN')) {
      return NextResponse.redirect(new URL('/institution-login', request.url));
    }
  }

  if (virtualPath.startsWith('/staff')) {
    if (!session || session.role !== 'STAFF') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  if (virtualPath.startsWith('/student')) {
    if (!session || session.role !== 'STUDENT') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    if (session.studentAcademicStatus === 'GRADUATED') {
      const allowedGraduatePaths = [
        '/student/dashboard',
        '/student/profile',
        '/student/transcripts',
        '/student/attendance',
      ];
      const isAllowedGraduatePath = allowedGraduatePaths.some((allowedPath) => (
        virtualPath === allowedPath || virtualPath.startsWith(`${allowedPath}/`)
      ));
      if (!isAllowedGraduatePath) {
        return keepWebSessionAlive(
          NextResponse.redirect(new URL('/student/profile', request.url)),
          request
        );
      }
    }
  }

  if (virtualPath === '/parent' || virtualPath.startsWith('/parent/')) {
    if (!session || session.role !== 'PARENT') {
      return NextResponse.redirect(new URL('/parent-login', request.url));
    }
  }

  if (session) {
    const serialized = JSON.stringify(session);
    requestHeaders.set(SESSION_HEADER, serialized);
    requestHeaders.set(SESSION_SIG_HEADER, await signSessionPayload(serialized));
  }

  const nextRes = rewritePath
    ? NextResponse.rewrite(new URL(rewritePath, request.url), forwarded)
    : NextResponse.next(forwarded);

  if (session) {
    nextRes.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    nextRes.headers.set('Pragma', 'no-cache');
    nextRes.headers.set('Expires', '0');
  }

  return session ? keepWebSessionAlive(nextRes, request) : nextRes;
}

function getDashboardPath(session: { role: string; studentAcademicStatus?: string }, request: NextRequest) {
  const host = request.headers.get('host') || 'nisaab360.app';
  const isLocal = host.toLowerCase().includes('localhost');
  const protocol = isLocal ? 'http://' : 'https://';
  const hostPort = host.match(/:(\d+)$/)?.[0] || '';
  const baseHost = isLocal ? `localhost${hostPort}` : 'nisaab360.app';
  if (isLocal) {
    switch (session.role) {
      case 'SUPER_ADMIN': return '/sa/dashboard';
      case 'EMPLOYEE': return '/employee/dashboard';
      case 'INSTITUTION':
      case 'INSTITUTION_ADMIN': return '/institution/dashboard';
      case 'STAFF': return '/staff/dashboard';
      case 'STUDENT': return '/student/dashboard';
      case 'PARENT': return '/parent/dashboard';
      default: return '/login';
    }
  }
  
  switch (session.role) {
    case 'SUPER_ADMIN': return `${protocol}sa.${baseHost}/dashboard`;
    case 'EMPLOYEE': return `${protocol}employee.${baseHost}/dashboard`;
    case 'INSTITUTION':
    case 'INSTITUTION_ADMIN': return `${protocol}institution.${baseHost}/dashboard`;
    case 'STAFF': return `${protocol}staff.${baseHost}/dashboard`;
    case 'STUDENT': return `${protocol}student.${baseHost}/dashboard`;
    case 'PARENT': return `${protocol}parent.${baseHost}/dashboard`;
    default: return '/login';
  }
}

function keepWebSessionAlive(response: NextResponse, request: NextRequest) {
  // Sliding cookie rewrite is only needed near expiry. Rewriting Set-Cookie on
  // every HTML navigation is expensive and unnecessary while the session has
  // more than ~2 days remaining.
  const sessionExpRaw = request.cookies.get('session_exp')?.value;
  if (sessionExpRaw) {
    const remainingMs = parseInt(sessionExpRaw, 10) - Date.now();
    if (Number.isFinite(remainingMs) && remainingMs > 2 * 24 * 60 * 60 * 1000) {
      return response;
    }
  }

  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const domain = host === 'nisaab360.app' || host.endsWith('.nisaab360.app') ? '.nisaab360.app' : undefined;
  const secure = domain !== undefined && (request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:');

  if (accessToken) {
    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: WEB_SESSION_MAX_AGE,
      domain,
    });
  }

  if (refreshToken) {
    response.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: WEB_SESSION_MAX_AGE,
      domain,
    });
  }

  response.cookies.set('session_exp', String(Date.now() + WEB_SESSION_MAX_AGE * 1000), {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: WEB_SESSION_MAX_AGE,
    domain,
  });

  return response;
}

export const config = {
  matcher: [
    // These six guarded APIs apply CORS/header sanitization in requireRole and
    // export OPTIONS themselves, avoiding Proxy dispatch for every portal read.
    '/api/((?!(?:(?:staff|student)/(?:dashboard|timetable|profile)|health|ready)/?$).*)',
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes are protected by rbac.ts)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt, llms.txt (metadata files)
     * - models (face-recognition model weights, served straight from public/)
     * - anything with a static asset extension
     *
     * The extension group matters for CPU: middleware previously ran for every
     * `public/` asset and installer download, and each invocation cloned the
     * request headers and did a full HMAC `jwtVerify` of the session cookie for a
     * file that has no auth semantics at all. A single portal page pulls dozens
     * of these.
     */
    '/((?!api|_next/static|_next/image|models/|favicon.ico|sitemap.xml|robots.txt|llms\\.txt$|.*\\.(?:js|mjs|css|map|png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2|ttf|otf|eot|mp4|webm|wasm|exe|apk|zip|dmg)$).*)',
  ],
};
