import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { institutionGoogleDriveBackups, institutions } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { verifyGoogleDriveState, exchangeGoogleDriveCode, ensureInstitutionBackupFolder } from "@/lib/google-drive-backups";
import { encryptStreamingCredentials } from "@/lib/streaming-credentials";

export const GET = requireRole(["INSTITUTION"], async (req: NextRequest, { session }) => {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return NextResponse.json({ error: "Google Drive authorization is incomplete" }, { status: 400 });
  const institutionId = await verifyGoogleDriveState(state);
  if (institutionId !== session.institutionId) return NextResponse.json({ error: "Authorization tenant mismatch" }, { status: 403 });
  const [institution] = await db.select({ name: institutions.name }).from(institutions).where(eq(institutions.id, institutionId)).limit(1);
  if (!institution) return NextResponse.json({ error: "Institution not found" }, { status: 404 });
  const credentials = await exchangeGoogleDriveCode(code);
  const folder = await ensureInstitutionBackupFolder(credentials.refreshToken, institution.name, institutionId);
  const encrypted = encryptStreamingCredentials({ refreshToken: credentials.refreshToken });
  await db.insert(institutionGoogleDriveBackups).values({ institutionId, credentialsEncrypted: encrypted, folderId: folder.folderId, folderName: folder.folderName, updatedAt: new Date() }).onConflictDoUpdate({ target: institutionGoogleDriveBackups.institutionId, set: { credentialsEncrypted: encrypted, folderId: folder.folderId, folderName: folder.folderName, updatedAt: new Date(), lastBackupError: null } });
  const redirectUrl = new URL("/institution/settings?googleDrive=connected", req.url);
  // Next may build req.url from HOSTNAME=0.0.0.0 while listening on all
  // interfaces. That address is valid for binding a server but not for a
  // browser redirect; normalize it to the local URL users can open.
  if (redirectUrl.hostname === "0.0.0.0") redirectUrl.hostname = "localhost";
  return NextResponse.redirect(redirectUrl);
}, { mutatesOnRead: true , permission: 'institution.security'});
