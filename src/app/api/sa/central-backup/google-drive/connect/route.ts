/**
 * GET /api/sa/central-backup/google-drive/connect
 *
 * Super-admin and employee only. Returns the Google OAuth consent URL for the one-time
 * administrator setup to obtain a central backup refresh token.
 *
 * This is separate from the institution Google Drive OAuth flow and must
 * never be accessible to institution users.
 */
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";
import { requireRole } from "@/lib/rbac";
import { centralDriveOAuthUrl } from "@/lib/central-drive-backups";

async function createCentralDriveState(userId: number): Promise<string> {
  return new SignJWT({ purpose: "central-google-drive-setup" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getJwtSecret());
}

export const GET = requireRole(["SUPER_ADMIN"], async (_req: NextRequest, { session }) => {
  void _req;
  const state = await createCentralDriveState(session.userId);
  const authorizationUrl = centralDriveOAuthUrl(state);
  return NextResponse.json({ authorizationUrl });
}, { permission: 'platform.security' });
