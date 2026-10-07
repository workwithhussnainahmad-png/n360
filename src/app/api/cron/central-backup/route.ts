import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { centralBackupSettings, centralDatabaseBackups } from "@/db/schema";
import { timingSafeEqual } from "@/lib/auth";
import { decryptStreamingCredentials } from "@/lib/streaming-credentials";
import {
  uploadCentralBackupFile,
  verifyCentralDriveFile,
  applyCentralDriveRetention,
  centralDriveFolderId,
} from "@/lib/central-drive-backups";

async function encryptDatabaseDump(inputPath: string, outputPath: string): Promise<void> {
  const [settings] = await db.select({ encrypted: centralBackupSettings.databasePasswordEncrypted }).from(centralBackupSettings).where(eq(centralBackupSettings.id, 1)).limit(1);
  const password = decryptStreamingCredentials(settings?.encrypted)?.password;
  if (!password) throw new Error("Central database backup password is not configured by a super-admin");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(await readFile(inputPath)), cipher.final()]);
  await writeFile(outputPath, Buffer.concat([Buffer.from("N360GCM1"), salt, iv, cipher.getAuthTag(), ciphertext]), { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[central-backup] CRON_SECRET is not configured; rejecting request");
    return false;
  }
  const authHeader = req.headers.get("authorization");
  const cronHeader = req.headers.get("x-cron-secret");
  return (
    (authHeader !== null && timingSafeEqual(authHeader, `Bearer ${secret}`)) ||
    (cronHeader !== null && timingSafeEqual(cronHeader, secret))
  );
}

// ---------------------------------------------------------------------------
// B2 secondary upload (best-effort — must never throw)
// ---------------------------------------------------------------------------

async function tryB2Upload(
  filePath: string,
  fileName: string,
  fileSize: number,
): Promise<"UPLOADED" | "SKIPPED" | "FAILED"> {
  const region = process.env.B2_REGION?.trim();
  const keyId = process.env.B2_APPLICATION_KEY_ID?.trim();
  const key = process.env.B2_APPLICATION_KEY?.trim();
  const bucket = process.env.B2_BUCKET_NAME?.trim();

  if (!region || !keyId || !key || !bucket) {
    console.warn("[central-backup] B2 credentials not configured; skipping secondary B2 upload");
    return "SKIPPED";
  }

  try {
    const client = new S3Client({
      region,
      endpoint: `https://s3.${region}.backblazeb2.com`,
      forcePathStyle: true,
      credentials: { accessKeyId: keyId, secretAccessKey: key },
    });

    const stream = createReadStream(filePath);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `central-database-backups/${fileName}`,
        Body: stream,
        ContentLength: fileSize,
        ContentType: "application/octet-stream",
      }),
    );
    console.log(`[central-backup] B2 secondary upload succeeded: ${fileName}`);
    return "UPLOADED";
  } catch (err) {
    console.error(
      "[central-backup] B2 secondary upload failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
    return "FAILED";
  }
}

// ---------------------------------------------------------------------------
// POST /api/cron/central-backup
//
// Called by backup/backup.sh after the dump is encrypted and written to disk.
// Body:
//   {
//     runId:        string  – idempotency key, e.g. "central-2026-09-21-00-00-a1b2c3d4"
//     fileName:     string  – e.g. "database-2026-09-21-00-00.sql.gz.enc"
//     filePath:     string  – absolute path on the shared volume, e.g. "/backups/..."
//     fileSizeBytes: number
//     sha256:       string  – hex SHA-256 of the encrypted file
//   }
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    runId,
    fileName,
    filePath,
    fileSizeBytes,
    sha256,
  } = body as Record<string, unknown>;

  if (
    typeof runId !== "string" || !runId ||
    typeof fileName !== "string" || !fileName ||
    typeof filePath !== "string" || !filePath ||
    typeof fileSizeBytes !== "number" || fileSizeBytes <= 0 ||
    typeof sha256 !== "string" || sha256.length !== 64
  ) {
    return NextResponse.json({ error: "Missing or invalid required fields" }, { status: 400 });
  }

  // Sanitize filePath: must be under /backups/ to prevent path traversal.
  if (!filePath.startsWith("/backups/") || filePath.includes("..")) {
    return NextResponse.json({ error: "Invalid filePath" }, { status: 400 });
  }
  const encryptedPath = `${filePath}.enc`;
  const encryptedFileName = fileName.replace(/\.dump$/, ".dump.enc");

  // -------------------------------------------------------------------------
  // Idempotency: if this run already completed, return success immediately.
  // -------------------------------------------------------------------------
  const [existing] = await db
    .select({ id: centralDatabaseBackups.id, status: centralDatabaseBackups.status, driveFileId: centralDatabaseBackups.driveFileId, b2Status: centralDatabaseBackups.b2Status })
    .from(centralDatabaseBackups)
    .where(eq(centralDatabaseBackups.runId, runId))
    .limit(1);

  if (existing?.status === "COMPLETED") {
    console.log(`[central-backup] run ${runId} already completed; returning cached result`);
    return NextResponse.json({
      success: true,
      runId,
      driveFileId: existing.driveFileId,
      b2Status: existing.b2Status,
      idempotent: true,
    });
  }

  // -------------------------------------------------------------------------
  // Verify the file exists on disk (prevents uploading a missing file).
  // -------------------------------------------------------------------------
  try {
    const fileStat = await stat(filePath);
    if (fileStat.size !== fileSizeBytes) {
      return NextResponse.json(
        { error: `File size mismatch: expected ${fileSizeBytes}, found ${fileStat.size}` },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: `File not found at path: ${filePath}` }, { status: 400 });
  }

  // -------------------------------------------------------------------------
  // Upsert row as UPLOADING.
  // -------------------------------------------------------------------------
  await db
    .insert(centralDatabaseBackups)
    .values({
      runId,
      fileName,
      fileSizeBytes,
      sha256,
      status: "UPLOADING",
    })
    .onConflictDoUpdate({
      target: centralDatabaseBackups.runId,
      set: { status: "UPLOADING", error: null },
    });

  // -------------------------------------------------------------------------
  // Upload to Google Drive (primary destination).
  // -------------------------------------------------------------------------
  let driveFileId: string;
  let encryptedSize = 0;
  try {
    const folderId = centralDriveFolderId();
    await encryptDatabaseDump(filePath, encryptedPath);
    encryptedSize = (await stat(encryptedPath)).size;
    const result = await uploadCentralBackupFile({ filePath: encryptedPath, fileName: encryptedFileName, folderId });
    driveFileId = result.driveFileId;

    // Verify the uploaded file.
    const valid = await verifyCentralDriveFile({
      driveFileId,
      expectedSize: encryptedSize,
    });
    if (!valid) {
      throw new Error("Post-upload Drive file verification failed: size mismatch");
    }

    console.log(`[central-backup] Google Drive upload verified: ${encryptedFileName} (${driveFileId})`);
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 2000) : "Unknown upload failure";
    console.error(`[central-backup] Google Drive upload FAILED for run ${runId}:`, message);
    await db
      .update(centralDatabaseBackups)
      .set({ status: "FAILED", error: message, completedAt: new Date() })
      .where(eq(centralDatabaseBackups.runId, runId));
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // -------------------------------------------------------------------------
  // Secondary B2 upload (best-effort; failure does NOT affect Drive status).
  // -------------------------------------------------------------------------
  const b2Status = await tryB2Upload(encryptedPath, encryptedFileName, encryptedSize);

  // -------------------------------------------------------------------------
  // Mark COMPLETED.
  // -------------------------------------------------------------------------
  await db
    .update(centralDatabaseBackups)
    .set({
      status: "COMPLETED",
      driveFileId,
      fileSizeBytes: encryptedSize,
      fileName: encryptedFileName,
      b2Status,
      completedAt: new Date(),
      error: null,
    })
    .where(eq(centralDatabaseBackups.runId, runId));

  // -------------------------------------------------------------------------
  // Apply retention policy (non-fatal on error).
  // -------------------------------------------------------------------------
  const keepDaily = Math.max(1, Number(process.env.CENTRAL_DATABASE_BACKUP_KEEP_DAILY ?? 30) || 30);
  const keepMonthly = Math.max(1, Number(process.env.CENTRAL_DATABASE_BACKUP_KEEP_MONTHLY ?? 12) || 12);

  try {
    const folderId = centralDriveFolderId();
    const retention = await applyCentralDriveRetention(folderId, keepDaily, keepMonthly);
    console.log(
      `[central-backup] retention: kept=${retention.kept} deleted=${retention.deleted} errors=${retention.errors}`,
    );
  } catch (err) {
    // Retention failure must not cause the whole backup to appear failed.
    console.error(
      "[central-backup] retention policy application failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
  }

  console.log(`[central-backup] run ${runId} completed successfully`);
  await unlink(encryptedPath).catch(() => undefined);
  await unlink(filePath).catch(() => undefined);

  return NextResponse.json({
    success: true,
    runId,
    fileName: encryptedFileName,
    driveFileId,
    b2Status,
  });
}
