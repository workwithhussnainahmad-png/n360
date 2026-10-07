/**
 * Central administrator Google Drive backup utilities.
 *
 * This module handles platform-owned disaster-recovery database backups.
 * It is completely separate from institution Google Drive backups.
 *
 * Authentication design: currently uses OAuth 2.0 refresh token stored in
 * GOOGLE_DRIVE_CENTRAL_REFRESH_TOKEN. If the project later migrates to a
 * Google Workspace service account, only getCentralAccessToken() needs to
 * change — all callers (upload, verify, list, delete) remain unmodified.
 */

import { createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { createReadStream as fsCreateReadStream } from "node:fs";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
// The administrator pre-creates the destination folder, so drive.file is not
// sufficient: it cannot reliably access files/folders not created by this app.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required but not configured`);
  return value;
}

export function centralDriveClientConfig() {
  return {
    clientId: requiredEnv("GOOGLE_DRIVE_CENTRAL_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_DRIVE_CENTRAL_CLIENT_SECRET"),
    redirectUri: requiredEnv("GOOGLE_DRIVE_CENTRAL_REDIRECT_URI"),
  };
}

export function centralDriveFolderId(): string {
  return requiredEnv("CENTRAL_DATABASE_BACKUP_DRIVE_FOLDER_ID");
}

export function centralInstitutionBackupFolderId(): string {
  return requiredEnv("CENTRAL_INSTITUTION_BACKUPS_DRIVE_FOLDER_ID");
}

// ---------------------------------------------------------------------------
// OAuth URL generation (for the one-time administrator setup flow)
// ---------------------------------------------------------------------------

/**
 * Returns the Google OAuth consent URL for the administrator to visit once
 * in order to obtain a refresh token.
 *
 * To switch to a service account later, replace this function and
 * getCentralAccessToken() — nothing else changes.
 */
export function centralDriveOAuthUrl(state: string): string {
  const config = centralDriveClientConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPE,
    state,
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

// ---------------------------------------------------------------------------
// Token exchange (one-time setup)
// ---------------------------------------------------------------------------

/**
 * Exchanges an OAuth authorization code for a refresh token.
 * The refresh token is logged to stdout by the callback route so the
 * administrator can copy it into GOOGLE_DRIVE_CENTRAL_REFRESH_TOKEN.
 * It is never stored in the database.
 */
export async function exchangeCentralDriveCode(code: string): Promise<{ refreshToken: string }> {
  const config = centralDriveClientConfig();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.refresh_token !== "string") {
    throw new Error("Central Google Drive authorization failed — no refresh_token in response");
  }
  return { refreshToken: body.refresh_token };
}

// ---------------------------------------------------------------------------
// Access token (runtime, called per backup run)
// ---------------------------------------------------------------------------

/**
 * Obtains a short-lived access token by exchanging the stored refresh token.
 *
 * To migrate to a service account: replace this function body with a
 * JWT-signed assertion flow (google-auth-library or raw fetch to TOKEN_ENDPOINT
 * with grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer). All callers
 * remain unchanged.
 */
export async function getCentralAccessToken(): Promise<string> {
  const config = centralDriveClientConfig();
  const refreshToken = requiredEnv("GOOGLE_DRIVE_CENTRAL_REFRESH_TOKEN");
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string") {
    throw new Error("Central Google Drive access token refresh failed");
  }
  return body.access_token;
}

// ---------------------------------------------------------------------------
// Internal Drive request helper
// ---------------------------------------------------------------------------

async function driveRequest<T>(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    let providerMessage = "";
    try {
      const body = await response.json() as Record<string, unknown>;
      if (body && "error" in body) providerMessage = `: ${JSON.stringify(body.error)}`;
    } catch { /* ignore parse error */ }
    const err = new Error(`Central Drive request failed (${response.status})${providerMessage}`);
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }
  return response.json() as Promise<T>;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
function escapedDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findChildFolder(token: string, name: string, parentId: string) {
  const query = `name = '${escapedDriveQuery(name)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const params = new URLSearchParams({ q: query, spaces: "drive", pageSize: "1", fields: "files(id,name)" });
  const result = await driveRequest<{ files?: Array<{ id: string; name: string }> }>(token, `${DRIVE_FILES}?${params}`);
  return result.files?.[0] ?? null;
}

async function createChildFolder(token: string, name: string, parentId: string) {
  return driveRequest<{ id: string; name: string }>(token, `${DRIVE_FILES}?fields=id,name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
}

/** Returns the per-institution folder below the administrator's institution root. */
export async function ensureCentralInstitutionFolder(institutionName: string) {
  const token = await getCentralAccessToken();
  const safeName = institutionName.replace(/[^a-z0-9 _-]/gi, "").trim().slice(0, 180) || "Institution";
  const rootId = centralInstitutionBackupFolderId();
  const folder = await findChildFolder(token, safeName, rootId) || await createChildFolder(token, safeName, rootId);
  return { folderId: folder.id, folderName: safeName };
}

/** Uploads/replaces the encrypted ZIP in the central administrator archive. */
export async function replaceCentralInstitutionBackup(options: {
  institutionName: string;
  fileName: string;
  zipPath: string;
  expectedSize: number;
}) {
  const folder = await ensureCentralInstitutionFolder(options.institutionName);
  const token = await getCentralAccessToken();
  const query = new URLSearchParams({
    q: `'${folder.folderId}' in parents and name = '${escapedDriveQuery(options.fileName)}' and trashed = false`,
    spaces: "drive",
    pageSize: "1",
    fields: "files(id,name,size)",
  });
  const existing = await driveRequest<{ files?: Array<{ id: string; name: string; size?: string }> }>(token, `${DRIVE_FILES}?${query}`);
  const previousFileId = existing.files?.[0]?.id;
  const result = await uploadCentralBackupFile({
    filePath: options.zipPath,
    fileName: options.fileName,
    folderId: folder.folderId,
  });
  if (result.size !== options.expectedSize) throw new Error("Central institution backup verification failed");
  if (previousFileId && previousFileId !== result.driveFileId) await deleteDriveFile(previousFileId);
  return { ...result, folderName: folder.folderName };
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Uploads a local encrypted file to the central Drive backup folder using
 * the resumable upload protocol (suitable for large files).
 *
 * Returns { driveFileId, size } on success.
 * Throws on any Drive API error.
 */
export async function uploadCentralBackupFile(options: {
  filePath: string;
  fileName: string;
  folderId: string;
}): Promise<{ driveFileId: string; size: number }> {
  const token = await getCentralAccessToken();
  const localSize = statSync(options.filePath).size;

  // Step 1: Initiate resumable upload session.
  const initiateUrl = `${DRIVE_UPLOAD}?uploadType=resumable&supportsAllDrives=true&fields=id,size`;
  const initiateResponse = await fetch(initiateUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": "application/octet-stream",
      "X-Upload-Content-Length": String(localSize),
    },
    body: JSON.stringify({
      name: options.fileName,
      parents: [options.folderId],
      mimeType: "application/octet-stream",
    }),
  });

  if (!initiateResponse.ok) {
    throw new Error(`Central Drive resumable upload initiation failed (${initiateResponse.status})`);
  }

  const sessionUri = initiateResponse.headers.get("Location");
  if (!sessionUri) throw new Error("Central Drive did not return a resumable upload session URI");

  // Step 2: Upload the file content to the session URI.
  const uploadResponse = await fetch(sessionUri, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(localSize),
    },
    body: createReadStream(options.filePath) as unknown as BodyInit,
    // Node.js fetch requires this flag for streaming request bodies.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  if (!uploadResponse.ok) {
    throw new Error(`Central Drive resumable upload failed (${uploadResponse.status})`);
  }

  const uploaded = await uploadResponse.json() as { id?: string; size?: string | number };
  if (!uploaded.id) throw new Error("Central Drive upload did not return a file ID");

  return { driveFileId: uploaded.id, size: Number(uploaded.size ?? localSize) };
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/**
 * Verifies that a Drive file exists and has the expected byte size.
 */
export async function verifyCentralDriveFile(options: {
  driveFileId: string;
  expectedSize: number;
}): Promise<boolean> {
  const token = await getCentralAccessToken();
  const file = await driveRequest<{ id: string; size?: string }>(
    token,
    `${DRIVE_FILES}/${encodeURIComponent(options.driveFileId)}?fields=id,size&supportsAllDrives=true`,
  );
  return file.id === options.driveFileId && Number(file.size) === options.expectedSize;
}

// ---------------------------------------------------------------------------
// List backup files
// ---------------------------------------------------------------------------

export type DriveBackupFile = {
  id: string;
  name: string;
  size: string;
  createdTime: string;
};

/**
 * Lists all central database backup files in the Drive folder, ordered by
 * name ascending (dates embedded in names give chronological order).
 */
export async function listCentralDriveFiles(folderId: string): Promise<DriveBackupFile[]> {
  const token = await getCentralAccessToken();
  const query = `'${folderId}' in parents and name contains 'database-' and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    spaces: "drive",
    fields: "files(id,name,size,createdTime)",
    pageSize: "1000",
    orderBy: "name asc",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const result = await driveRequest<{ files?: DriveBackupFile[] }>(
    token,
    `${DRIVE_FILES}?${params}`,
  );
  return result.files ?? [];
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Deletes a single Drive file by ID.
 */
export async function deleteDriveFile(driveFileId: string): Promise<void> {
  const token = await getCentralAccessToken();
  const response = await fetch(
    `${DRIVE_FILES}/${encodeURIComponent(driveFileId)}?supportsAllDrives=true`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`Central Drive delete failed for file ${driveFileId} (${response.status})`);
  }
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

/**
 * Applies the retention policy to the central backup folder:
 * - Keep the most recent `keepDaily` files.
 * - Additionally keep one file per calendar month for the most recent
 *   `keepMonthly` calendar months.
 *
 * Files must follow the naming pattern:
 *   database-YYYY-MM-DD-HH-mm.dump.enc
 *
 * Deletion errors are caught, logged, and do not abort the process.
 * Returns a summary of files deleted and files kept.
 */
export async function applyCentralDriveRetention(
  folderId: string,
  keepDaily: number,
  keepMonthly: number,
): Promise<{ kept: number; deleted: number; errors: number }> {
  const files = await listCentralDriveFiles(folderId);

  // Parse only files matching the expected naming pattern.
  const datePattern = /^database-(\d{4})-(\d{2})-(\d{2})-\d{2}-\d{2}\.dump\.enc$/;
  const parsed = files
    .map((f) => {
      const match = datePattern.exec(f.name);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      // YYYY-MM key used for monthly retention.
      const monthKey = `${match[1]}-${match[2]}`;
      return { file: f, year, month, day, monthKey };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Newest first.
    .sort((a, b) => b.file.name.localeCompare(a.file.name));

  const keep = new Set<string>();

  // Keep most recent N (daily).
  parsed.slice(0, keepDaily).forEach((x) => keep.add(x.file.id));

  // Keep one per month for the most recent M months.
  const monthsSeen = new Map<string, string>();
  for (const x of parsed) {
    if (!monthsSeen.has(x.monthKey)) {
      monthsSeen.set(x.monthKey, x.file.id);
      keep.add(x.file.id);
      if (monthsSeen.size >= keepMonthly) break;
    }
  }

  let deleted = 0;
  let errors = 0;

  for (const x of parsed) {
    if (keep.has(x.file.id)) continue;
    try {
      await deleteDriveFile(x.file.id);
      console.log(`[central-backup] retention: deleted ${x.file.name} (${x.file.id})`);
      deleted++;
    } catch (err) {
      console.error(
        `[central-backup] retention: failed to delete ${x.file.name} (${x.file.id}):`,
        err instanceof Error ? err.message : String(err),
      );
      errors++;
    }
  }

  return { kept: keep.size, deleted, errors };
}

// ---------------------------------------------------------------------------
// SHA-256 checksum helper (for upload verification)
// ---------------------------------------------------------------------------

export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(fsCreateReadStream(filePath), hash);
  return hash.digest("hex");
}
