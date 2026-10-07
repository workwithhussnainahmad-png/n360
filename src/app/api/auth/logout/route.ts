import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookies, revokeRefreshToken } from '@/lib/auth';
import { AUTH_MAX_BODY_BYTES, bodyTooLargeResponse, readJsonBody } from '@/lib/http';

export async function POST(req: NextRequest) {
  // Unauthenticated endpoint: cap the body instead of buffering whatever arrives.
  // A missing or malformed body still falls back to the cookie, as before.
  const parsedBody = await readJsonBody<{ refreshToken?: unknown }>(req, AUTH_MAX_BODY_BYTES);
  if (!parsedBody.ok && parsedBody.status === 413) return bodyTooLargeResponse();
  const refreshToken = parsedBody.ok && typeof parsedBody.data?.refreshToken === 'string'
    ? parsedBody.data.refreshToken
    : req.cookies.get('refresh_token')?.value;

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  await clearAuthCookies();
  return NextResponse.json({ message: 'Logged out successfully' });
}
