import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, getLightSessionFromRequest, getWarmSessionFromRequest, UserRole, JWTPayload } from './auth';
import { DEFAULT_MAX_BODY_BYTES, bodyTooLargeResponse, exceedsDeclaredBodyLimit } from './http';
import { withRateLimit } from './rate-limit';
import { measurePerformancePhase } from './performance';
import { withApiPolicy } from './api-policy';
import { stripSessionHeaders } from './session-header';
import { applyCorsHeaders } from './cors';
import type { NativeJsonResponse } from './native-json-response';
import { campusMutationBlocked, CAMPUS_READ_ONLY_ERROR } from './campus-view';
import { authorizeSecurityPermission, type SecurityPermission } from './security-permissions';

type RouteHandler = (
  req: NextRequest,
  context: { params: any; session: JWTPayload },
) => Promise<Response> | Response;

type RequireRoleOptions = {
  permission?: SecurityPermission;
  allowCampusSwitch?: boolean;
  /** OAuth callbacks and similar GET endpoints still change configuration. */
  mutatesOnRead?: boolean;
  allowPasswordChangeRequired?: boolean;
  /** Skip Redis/DB user validity + student enrich — for heartbeat/unread only. */
  light?: boolean;
  /** Override the request-body ceiling for routes with genuinely larger payloads. */
  maxBodyBytes?: number;
  /** Only a synchronous read of already-valid cached data; null means ordinary GET. */
  nativeWarm?: (req: NextRequest, context: { session: JWTPayload }) => NativeJsonResponse | null;
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

  if (campusMutationBlocked(session, options?.mutatesOnRead ? 'POST' : req.method, options?.allowCampusSwitch)) {
    return NextResponse.json({ error: CAMPUS_READ_ONLY_ERROR }, { status: 403 });
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
  const guarded = withApiPolicy(async (req: NextRequest, context: any) => {
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
      if (options?.permission && !await authorizeSecurityPermission(session, options.permission)) {
        return NextResponse.json({ error: 'Forbidden: this action is outside your role permissions.' }, { status: 403 });
      }

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
  if (options?.nativeWarm) Object.defineProperty(guarded, Symbol.for('nisaab360.native-warm-get'), {
    value: (req: NextRequest): NativeJsonResponse | null => {
      stripSessionHeaders(req.headers);
      if (req.method !== 'GET' || exceedsDeclaredBodyLimit(req, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES)) return null;
      const session = getWarmSessionFromRequest(req);
      if (!session || options?.permission || enforceSessionGuards(req, session, allowedRoles, options)) return null;
      const response = options.nativeWarm!(req, { session });
      return response?.status === 200 ? applyCorsHeaders(req, response) : null;
    },
  });
  return guarded;
}

export function getTenantContext(session: JWTPayload): number {
  if (!session.institutionId) {
    throw new Error('Tenant context missing. This route requires an institution ID.');
  }
  return session.institutionId;
}
