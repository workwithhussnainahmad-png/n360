import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { institutionGoogleDriveBackups } from "@/db/schema";
import { encryptStreamingCredentials } from "@/lib/streaming-credentials";
import { getTenantContext, requireRole } from "@/lib/rbac";

export const GET = requireRole(["INSTITUTION"], async (_req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const [settings] = await db.select({ folderName: institutionGoogleDriveBackups.folderName, backupFileName: institutionGoogleDriveBackups.backupFileName, lastBackupAt: institutionGoogleDriveBackups.lastBackupAt, lastBackupError: institutionGoogleDriveBackups.lastBackupError, connected: institutionGoogleDriveBackups.credentialsEncrypted, passwordConfigured: institutionGoogleDriveBackups.archivePasswordEncrypted }).from(institutionGoogleDriveBackups).where(eq(institutionGoogleDriveBackups.institutionId, institutionId)).limit(1);
  return NextResponse.json({ connected: Boolean(settings?.connected && settings.folderName), passwordConfigured: Boolean(settings?.passwordConfigured), folderName: settings?.folderName ?? null, backupFileName: settings?.backupFileName ?? null, lastBackupAt: settings?.lastBackupAt ?? null, lastBackupError: settings?.lastBackupError ?? null });
}, { permission: 'institution.security' });

export const PUT = requireRole(["INSTITUTION"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const password = body && typeof body === "object" && typeof (body as { password?: unknown }).password === "string" ? (body as { password: string }).password : "";
  if (password.length < 14 || password.length > 200) return NextResponse.json({ error: "Backup password must contain 14-200 characters" }, { status: 400 });
  const encrypted = encryptStreamingCredentials({ password });
  await db.insert(institutionGoogleDriveBackups).values({ institutionId, archivePasswordEncrypted: encrypted, updatedAt: new Date() }).onConflictDoUpdate({ target: institutionGoogleDriveBackups.institutionId, set: { archivePasswordEncrypted: encrypted, updatedAt: new Date() } });
  return NextResponse.json({ success: true, passwordConfigured: true });
}, { permission: 'institution.security' });

export const DELETE = requireRole(["INSTITUTION"], async (_req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  await db.update(institutionGoogleDriveBackups).set({ credentialsEncrypted: null, folderId: null, folderName: null, backupFileId: null, backupFileName: null, updatedAt: new Date() }).where(and(eq(institutionGoogleDriveBackups.institutionId, institutionId)));
  return NextResponse.json({ success: true });
}, { permission: 'institution.security' });
