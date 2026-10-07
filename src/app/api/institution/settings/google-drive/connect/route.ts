import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { institutions } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { createGoogleDriveState, googleDriveAuthorizationUrl, verifyGoogleDriveState, exchangeGoogleDriveCode, ensureInstitutionBackupFolder } from "@/lib/google-drive-backups";
import { encryptStreamingCredentials } from "@/lib/streaming-credentials";
import { institutionGoogleDriveBackups } from "@/db/schema";
import { eq } from "drizzle-orm";

export const GET = requireRole(["INSTITUTION"], async (_req: NextRequest, { session }) => {
  const state = await createGoogleDriveState(getTenantContext(session));
  return NextResponse.json({ authorizationUrl: googleDriveAuthorizationUrl(state) });
}, { mutatesOnRead: true , permission: 'institution.security'});

export const POST = requireRole(["INSTITUTION"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return NextResponse.json({ error: "Google Drive authorization is incomplete" }, { status: 400 });
  const stateInstitutionId = await verifyGoogleDriveState(state);
  if (stateInstitutionId !== institutionId) return NextResponse.json({ error: "Authorization tenant mismatch" }, { status: 403 });
  const [institution] = await db.select({ name: institutions.name }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  if (!institution) return NextResponse.json({ error: "Institution not found" }, { status: 404 });
  const credentials = await exchangeGoogleDriveCode(code);
  const folder = await ensureInstitutionBackupFolder(credentials.refreshToken, institution.name, institutionId);
  const encrypted = encryptStreamingCredentials({ refreshToken: credentials.refreshToken });
  await db.insert(institutionGoogleDriveBackups).values({ institutionId, credentialsEncrypted: encrypted, folderId: folder.folderId, folderName: folder.folderName, updatedAt: new Date() }).onConflictDoUpdate({
    target: institutionGoogleDriveBackups.institutionId,
    set: { credentialsEncrypted: encrypted, folderId: folder.folderId, folderName: folder.folderName, updatedAt: new Date(), lastBackupError: null },
  });
  const redirectUrl = new URL("/institution/settings?googleDrive=connected", req.url);
  if (redirectUrl.hostname === "0.0.0.0") redirectUrl.hostname = "localhost";
  return NextResponse.redirect(redirectUrl);
}, { permission: 'institution.security' });
