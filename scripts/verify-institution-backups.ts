import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { institutionBackups, institutionGoogleDriveBackups } from "@/db/schema";
import { decryptStreamingCredentials } from "@/lib/streaming-credentials";
import { verifyGoogleDriveBackup } from "@/lib/google-drive-backups";

async function main() {
  const rows = await db.select({
    id: institutionBackups.id,
    objectKey: institutionBackups.objectKey,
    fileSize: institutionBackups.fileSize,
    institutionId: institutionBackups.institutionId,
    credentialsEncrypted: institutionGoogleDriveBackups.credentialsEncrypted,
  }).from(institutionBackups).innerJoin(institutionGoogleDriveBackups, eq(institutionGoogleDriveBackups.institutionId, institutionBackups.institutionId))
    .where(eq(institutionBackups.status, "COMPLETED"));
  for (const row of rows) {
    if (!row.objectKey?.startsWith("gdrive:") || !row.fileSize || !row.credentialsEncrypted) throw new Error(`Invalid Google Drive metadata for institution backup ${row.id}`);
    const credentials = decryptStreamingCredentials(row.credentialsEncrypted);
    if (!credentials?.refreshToken) throw new Error(`Google Drive credentials are unavailable for institution ${row.institutionId}`);
    const valid = await verifyGoogleDriveBackup({ refreshToken: credentials.refreshToken, fileId: row.objectKey.slice("gdrive:".length), expectedSize: row.fileSize });
    if (!valid) throw new Error(`Google Drive file verification failed for institution backup ${row.id}`);
  }
  process.stdout.write(`Verified ${rows.length} institution Google Drive backup record(s).\n`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
