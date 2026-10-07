import { createReadStream } from "node:fs";
import { SignJWT, jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const FOLDER_MIME = "application/vnd.google-apps.folder";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function clientConfig() {
  return {
    clientId: required("GOOGLE_DRIVE_CLIENT_ID"),
    clientSecret: required("GOOGLE_DRIVE_CLIENT_SECRET"),
    redirectUri: required("GOOGLE_DRIVE_REDIRECT_URI"),
  };
}

export async function createGoogleDriveState(institutionId: number) {
  return new SignJWT({ institutionId, purpose: "institution-google-drive" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getJwtSecret());
}

export async function verifyGoogleDriveState(state: string) {
  const { payload } = await jwtVerify(state, getJwtSecret(), { algorithms: ["HS256"] });
  if (payload.purpose !== "institution-google-drive" || typeof payload.institutionId !== "number") {
    throw new Error("Invalid Google Drive authorization state");
  }
  return payload.institutionId;
}

export function googleDriveAuthorizationUrl(state: string) {
  const config = clientConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/drive.file",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleDriveCode(code: string) {
  const config = clientConfig();
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
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.refresh_token !== "string") {
    throw new Error("Google Drive authorization failed");
  }
  return { refreshToken: body.refresh_token as string };
}

async function accessToken(refreshToken: string) {
  const config = clientConfig();
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
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== "string") throw new Error("Google Drive access token refresh failed");
  return body.access_token as string;
}

async function driveRequest<T>(token: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = body && typeof body === "object" && "error" in body
      ? JSON.stringify((body as { error?: unknown }).error)
      : "";
    const error = new Error(`Google Drive request failed (${response.status})${providerMessage ? `: ${providerMessage}` : ""}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

function escapedQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(token: string, name: string, parentId: string) {
  const query = `name = '${escapedQuery(name)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const params = new URLSearchParams({ q: query, spaces: "drive", pageSize: "1", fields: "files(id,name)" });
  const result = await driveRequest<{ files?: Array<{ id: string; name: string }> }>(token, `${DRIVE_FILES}?${params}`);
  return result.files?.[0] ?? null;
}

async function createFolder(token: string, name: string, parentId: string) {
  return driveRequest<{ id: string; name: string }>(token, `${DRIVE_FILES}?fields=id,name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
}

export async function ensureInstitutionBackupFolder(refreshToken: string, institutionName: string, institutionId: number) {
  const token = await accessToken(refreshToken);
  const root = await findFolder(token, "Nisaab360", "root") || await createFolder(token, "Nisaab360", "root");
  const safeName = institutionName.replace(/[^a-z0-9 _-]/gi, "").trim().slice(0, 180) || "Institution";
  // The institution-facing layout is intentionally stable and human-readable:
  // Nisaab360/<InstitutionName>/InstitutionName Backup.zip.
  // The institution ID is still used by the LMS record, not exposed in the
  // Drive path requested by the product workflow.
  void institutionId;
  const folderName = safeName;
  const folder = await findFolder(token, folderName, root.id) || await createFolder(token, folderName, root.id);
  return { folderId: folder.id, folderName, rootFolderId: root.id };
}

async function uploadMedia(token: string, fileId: string | undefined, fileName: string, parentId: string, zipPath: string) {
  if (!fileId) {
    // Create the metadata record first, then upload media to that record. This
    // avoids multipart parsing differences between Google Drive and Node's
    // fetch implementation while preserving the one-file-per-institution
    // layout.
    const created = await driveRequest<{ id: string }>(token, `${DRIVE_FILES}?supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fileName, parents: [parentId], mimeType: "application/zip" }),
    });
    return uploadMedia(token, created.id, fileName, parentId, zipPath);
  }

  const endpoint = `${DRIVE_UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=id,name,size`;
  const stream = createReadStream(zipPath);
  return driveRequest<{ id: string; name: string; size: string }>(token, endpoint, {
    method: "PATCH",
    headers: { "Content-Type": "application/zip" },
    body: stream as unknown as BodyInit,
    // Node's fetch requires this flag for a streaming request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

export async function replaceGoogleDriveBackup(options: {
  refreshToken: string;
  folderId: string;
  previousFileId?: string | null;
  fileName: string;
  zipPath: string;
  expectedSize: number;
}) {
  const token = await accessToken(options.refreshToken);
  let remote: { id: string; name: string; size: string };
  try {
    remote = await uploadMedia(token, options.previousFileId || undefined, options.fileName, options.folderId, options.zipPath);
  } catch (error) {
    if (!options.previousFileId || (error as { status?: number }).status !== 404) throw error;
    remote = await uploadMedia(token, undefined, options.fileName, options.folderId, options.zipPath);
  }
  if (Number(remote.size) !== options.expectedSize) throw new Error("Google Drive backup verification failed");
  return { fileId: remote.id, fileName: remote.name };
}

export async function verifyGoogleDriveBackup(options: { refreshToken: string; fileId: string; expectedSize: number }) {
  const token = await accessToken(options.refreshToken);
  const file = await driveRequest<{ id: string; name: string; size?: string }>(token, `${DRIVE_FILES}/${encodeURIComponent(options.fileId)}?fields=id,name,size&supportsAllDrives=true`);
  return file.id === options.fileId && Number(file.size) === options.expectedSize;
}
