import { requireRole } from '@/lib/rbac';
/**
 * GET /api/sa/central-backup/google-drive/callback
 *
 * Google redirects the administrator here after consent. This route:
 *   1. Validates the CSRF state JWT.
 *   2. Exchanges the authorization code for a refresh token.
 *   3. Returns the refresh token once over the authenticated setup flow.
 *
 * The refresh token is never written to the database or logs. It is displayed
 * once in the setup response so the administrator can put it in a secret.
 *
 * SECURITY: This callback requires an authenticated Root administrator; previously it was publicly reachable (Google cannot authenticate the
 * admin before redirecting). It is protected by the signed short-lived state JWT.
 * No authentication middleware wraps this handler so Google's redirect works.
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";
import { exchangeCentralDriveCode } from "@/lib/central-drive-backups";

const SUCCESS_HTML = (refreshToken: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Central Drive Setup — Token Obtained</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; color: #111; }
    h1 { font-size: 1.25rem; color: #1a1a1a; }
    .box { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 1rem 1.25rem; margin: 1.5rem 0; }
    .warn { background: #fefce8; border-color: #fde047; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>Central Google Drive Setup — Refresh Token Obtained</h1>
  <div class="box">
    <strong>Success.</strong> The refresh token is shown once below and was not written to server logs.<br>
    It has <strong>not</strong> been stored in the database or server logs.
  </div>
  <div class="box warn">
    <strong>Action required:</strong>
    <ol>
      <li>Copy the token below and set it as <code>GOOGLE_DRIVE_CENTRAL_REFRESH_TOKEN</code> in your server environment.</li>
      <li>Restart the application container so the new environment variable takes effect.</li>
      <li>Rotate or delete the token from your log storage once it is saved securely.</li>
    </ol>
  </div>
  <p><code>${refreshToken.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c))}</code></p>
  <p>Close this tab after saving it. Do not share the token.</p>
</body>
</html>`;

const ERROR_HTML = (message: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Central Drive Setup — Error</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; }
    .box { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; padding: 1rem 1.25rem; }
  </style>
</head>
<body>
  <h1>Central Drive Setup — Error</h1>
  <div class="box"><strong>Setup failed:</strong> ${message.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] ?? c))}</div>
  <p>Return to the super-admin panel and try again.</p>
</body>
</html>`;

export const GET = requireRole(['SUPER_ADMIN'], async (req: NextRequest, { session }) => {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle user denial at the consent screen.
  if (error) {
    console.warn(`[central-backup-setup] OAuth consent denied: ${error}`);
    return new NextResponse(ERROR_HTML(`Google OAuth error: ${error}`), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (!code || !state) {
    return new NextResponse(ERROR_HTML("Missing code or state parameter."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Validate CSRF state JWT.
  try {
    const { payload } = await jwtVerify(state, getJwtSecret(), { algorithms: ["HS256"] });
    if (payload.purpose !== "central-google-drive-setup" || payload.sub !== String(session.userId)) {
      throw new Error("Invalid state purpose");
    }
  } catch {
    return new NextResponse(ERROR_HTML("Invalid or expired state token. Please start the setup again."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Exchange the authorization code for a refresh token.
  let refreshToken: string;
  try {
    const result = await exchangeCentralDriveCode(code);
    refreshToken = result.refreshToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    console.error(`[central-backup-setup] token exchange failed: ${message}`);
    return new NextResponse(ERROR_HTML(message), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new NextResponse(SUCCESS_HTML(refreshToken), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}, { permission: 'platform.security', mutatesOnRead: true });
