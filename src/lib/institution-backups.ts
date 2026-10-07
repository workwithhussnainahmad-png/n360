import { createReadStream, createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import zipEncrypted from "archiver-zip-encrypted";
import type { Readable } from "node:stream";
import pg from "pg";
import QueryStream from "pg-query-stream";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { institutionBackups, institutionGoogleDriveBackups } from "@/db/schema";
import { decryptStreamingCredentials } from "@/lib/streaming-credentials";
import { replaceGoogleDriveBackup } from "@/lib/google-drive-backups";
import { replaceCentralInstitutionBackup } from "@/lib/central-drive-backups";

// archiver-zip-encrypted currently extends the legacy archiver API. Its
// package ships the compatible archiver version as a nested dependency, while
// the repository's top-level archiver package is ESM-only and has no
// registerFormat API.
const requireFunc = typeof require !== "undefined" ? require : createRequire(import.meta.url as string);
const archiver = requireFunc("archiver-zip-encrypted/node_modules/archiver") as {
  (format: string, options: Record<string, unknown>): {
    pipe(destination: NodeJS.WritableStream): void;
    file(path: string, options: { name: string }): void;
    append(value: string, options: { name: string }): void;
    finalize(): Promise<void>;
  };
  registerFormat(name: string, format: unknown): void;
};
export type InstitutionBackupType = "DAILY" | "MANUAL";
archiver.registerFormat("zip-encrypted", zipEncrypted);
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const REDACTED = new Set(["password_hash", "admin_password_hash", "security_question", "security_answer_hash", "token", "token_hash", "expo_push_token", "reset_token", "temporary_password"]);
export const INSTITUTION_BACKUP_DEPENDENT_TABLES: Record<string, string> = {
  announcement_reads: "announcement_id IN (SELECT id FROM announcements WHERE institution_id = $1)",
  batch_exam_subjects: "batch_exam_id IN (SELECT id FROM batch_exams WHERE institution_id = $1)",
  batch_exam_results: "batch_exam_subject_id IN (SELECT s.id FROM batch_exam_subjects s JOIN batch_exams e ON e.id = s.batch_exam_id WHERE e.institution_id = $1)",
  course_classes: "course_id IN (SELECT id FROM courses WHERE institution_id = $1)",
  course_lectures: "course_id IN (SELECT id FROM courses WHERE institution_id = $1)",
  course_lecture_progress: "lecture_id IN (SELECT l.id FROM course_lectures l JOIN courses c ON c.id = l.course_id WHERE c.institution_id = $1)",
  fee_invoice_items: "invoice_id IN (SELECT id FROM fee_invoices WHERE institution_id = $1)",
  online_test_questions: "online_test_id IN (SELECT id FROM online_tests WHERE institution_id = $1)",
  ticket_history: "ticket_id IN (SELECT id FROM tickets WHERE institution_id = $1)",
};
function connectionString() {
  // Always prefer DIRECT_URL if available (even locally) because REPEATABLE READ 
  // transactions stream heavily and can exhaust the PgBouncer pool.
  const value = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DIRECT_URL or DATABASE_URL is required");
  return value;
}
function quote(value: string) { if (!SAFE_IDENTIFIER.test(value)) throw new Error("Unsafe database identifier"); return '"' + value + '"'; }
function filePart(value: string) { return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Institution"; }
async function writeLine(stream: NodeJS.WritableStream, value: unknown) { if (!stream.write(JSON.stringify(value) + "\n")) await once(stream, "drain"); }
async function hashFile(path: string) { const hash = createHash("sha256"); await pipeline(createReadStream(path), hash); return hash.digest("hex"); }

async function snapshot(institutionId: number) {
  const pool = new pg.Pool({ connectionString: connectionString(), max: 1, connectionTimeoutMillis: 10_000, application_name: "nisaab360_google_drive_backup" });
  const client = await pool.connect(); const directory = join(tmpdir(), "nisaab360-tenant-backups"); await mkdir(directory, { recursive: true });
  const path = join(directory, String(institutionId) + "-" + randomUUID() + ".jsonl"); const output = createWriteStream(path, { flags: "wx", mode: 0o600 });
  let recordCount = 0; let tableCount = 0; const tableCounts: Record<string, number> = {};
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const institution = (await client.query<{ id: number; name: string; username: string }>("SELECT id, name, username FROM institutions WHERE id = $1", [institutionId])).rows[0];
    if (!institution) throw new Error("Institution does not exist");
    const result = await client.query<{ table_name: string; column_name: string }>("SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND (c.table_name='institutions' OR c.table_name IN (SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='institution_id') OR c.table_name = ANY($1::text[])) ORDER BY c.table_name, c.ordinal_position", [Object.keys(INSTITUTION_BACKUP_DEPENDENT_TABLES)]);
    const plan = new Map<string, string[]>();
    for (const item of result.rows) { if (item.table_name === "institution_backups" || item.table_name === "institution_google_drive_backups" || item.table_name === "institution_restore_requests" || item.table_name === "email_outbox" || REDACTED.has(item.column_name)) continue; const fields = plan.get(item.table_name) ?? []; fields.push(item.column_name); plan.set(item.table_name, fields); }
    await writeLine(output, { type: "header", format: "nisaab360-institution-export", version: 2, institution, generatedAt: new Date().toISOString(), sensitiveFieldsIncluded: false });
    for (const [table, fields] of plan) {
      const where = table === "institutions" ? "id = $1" : INSTITUTION_BACKUP_DEPENDENT_TABLES[table] ?? "institution_id = $1"; let count = 0;
      const query = "SELECT " + fields.map(quote).join(", ") + " FROM " + quote(table) + " WHERE " + where + " ORDER BY 1";
      for await (const row of client.query(new QueryStream(query, [institutionId], { batchSize: 500 }))) { await writeLine(output, { type: "row", table, data: row }); count += 1; }
      tableCounts[table] = count; tableCount += 1; recordCount += count;
    }
    await writeLine(output, { type: "manifest", tableCounts, tableCount, recordCount }); output.end(); await once(output, "finish"); await client.query("COMMIT");
    return { path, institution, recordCount, tableCount };
  } catch (error) { output.destroy(); try { await client.query("ROLLBACK"); } catch {} await rm(path, { force: true }); throw error; } finally { client.release(); await pool.end(); }
}
async function createZip(data: Awaited<ReturnType<typeof snapshot>>, password: string) {
  const path = data.path.replace(/\.jsonl$/, ".zip"); const output = createWriteStream(path, { flags: "wx", mode: 0o600 });
  const archive = archiver("zip-encrypted", { zlib: { level: 6 }, encryptionMethod: "aes256", password }); archive.pipe(output);
  archive.file(data.path, { name: "data.jsonl" });
  archive.append("Nisaab360 institution data export\n\nThis archive contains the latest export. Authentication secrets and tokens are intentionally excluded.\n", { name: "README.txt" });
  archive.append(JSON.stringify({ institution: data.institution, generatedAt: new Date().toISOString(), recordCount: data.recordCount, tableCount: data.tableCount }, null, 2), { name: "backup-info.json" });
  await archive.finalize(); await once(output, "close"); return path;
}
export async function enqueueScheduledInstitutionBackups(now = new Date()) {
  const period = now.toISOString().slice(0, 10);
  await db.execute(sql`UPDATE institution_backups SET status = 'PENDING', started_at = NULL, error = 'Worker interrupted; retrying.' WHERE status = 'RUNNING' AND started_at < now() - interval '2 hours'`);
  await db.execute(sql`INSERT INTO institution_backups (institution_id, backup_type, period_key)
    SELECT i.id, 'DAILY', ${period}
    FROM institutions i
    INNER JOIN institution_google_drive_backups g ON g.institution_id = i.id
    WHERE i.status = 'APPROVED' AND g.credentials_encrypted IS NOT NULL
      AND g.archive_password_encrypted IS NOT NULL AND g.folder_id IS NOT NULL
    ON CONFLICT (institution_id, backup_type, period_key) DO NOTHING`);
}
export async function enqueueInstitutionBackup(institutionId: number, typeOrRequestedBy: InstitutionBackupType | "EXPORT" | number, requestedByMaybe?: number, requestedByRole: "SUPER_ADMIN" | "EMPLOYEE" = "SUPER_ADMIN") {
  const requestedBy = typeof typeOrRequestedBy === "number" ? typeOrRequestedBy : requestedByMaybe;
  if (typeof typeOrRequestedBy === "string" && typeOrRequestedBy !== "MANUAL") {
    throw new Error("Institution Google Drive backups do not support EXPORT jobs");
  }
  if (!Number.isInteger(requestedBy)) throw new Error("A requesting platform operator is required");
  const periodKey = "manual-" + new Date().toISOString() + "-" + randomUUID().slice(0, 8);
  return (await db.insert(institutionBackups).values({ institutionId, backupType: "MANUAL", periodKey, requestedBy: requestedByRole === "SUPER_ADMIN" ? requestedBy : null, requestedByEmployee: requestedByRole === "EMPLOYEE" ? requestedBy : null }).returning())[0];
}

/** Institution backups no longer live in B2. Kept as an explicit compatibility
 * failure for retired restore/download handlers so old callers cannot silently
 * read a database-backup object using the new Google Drive records. */
export async function getInstitutionBackupObject(_objectKey: string): Promise<{ Body: Readable }> {
  void _objectKey;
  throw new Error("Institution backup objects are now stored in the institution's Google Drive");
}
export async function processNextInstitutionBackup() {
  const claimed = await db.execute<{ id: number; institution_id: number }>(sql`UPDATE institution_backups SET status = 'RUNNING', started_at = now(), error = NULL, attempt_count = attempt_count + 1 WHERE id = (SELECT id FROM institution_backups WHERE status = 'PENDING' ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id, institution_id`);
  const job = claimed.rows[0]; if (!job) return { processed: 0 }; let jsonl: string | undefined; let zip: string | undefined;
  try {
    const settings = (await db.select().from(institutionGoogleDriveBackups).where(eq(institutionGoogleDriveBackups.institutionId, job.institution_id)).limit(1))[0];
    const credentials = decryptStreamingCredentials(settings?.credentialsEncrypted); const password = decryptStreamingCredentials(settings?.archivePasswordEncrypted)?.password;
    if (!settings?.folderId || !credentials?.refreshToken || !password) throw new Error("Google Drive is not connected or the backup password is not configured");
    const data = await snapshot(job.institution_id); jsonl = data.path; zip = await createZip(data, password); const size = (await stat(zip)).size; const checksum = await hashFile(zip); const fileName = filePart(data.institution.name) + " Backup.zip";
    const remote = await replaceGoogleDriveBackup({ refreshToken: credentials.refreshToken, folderId: settings.folderId, previousFileId: settings.backupFileId, fileName, zipPath: zip, expectedSize: size });
    let centralRemote: { driveFileId: string; size: number } | null = null;
    if (process.env.CENTRAL_INSTITUTION_BACKUPS_DRIVE_FOLDER_ID?.trim()) {
      centralRemote = await replaceCentralInstitutionBackup({ institutionName: data.institution.name, fileName, zipPath: zip, expectedSize: size });
    }
    await db.transaction(async (tx) => { await tx.update(institutionGoogleDriveBackups).set({ backupFileId: remote.fileId, backupFileName: fileName, lastBackupAt: new Date(), lastBackupError: null, updatedAt: new Date() }).where(eq(institutionGoogleDriveBackups.institutionId, job.institution_id)); await tx.update(institutionBackups).set({ status: "COMPLETED", objectKey: "gdrive:" + remote.fileId, fileSize: size, sha256: checksum, recordCount: data.recordCount, tableCount: data.tableCount, completedAt: new Date(), error: null }).where(and(eq(institutionBackups.id, job.id), eq(institutionBackups.institutionId, job.institution_id))); });
    if (centralRemote) console.log(`[institution-backup] central archive updated for ${data.institution.name}: ${centralRemote.driveFileId}`);
    return { processed: 1, backupId: job.id };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "Unknown backup failure";
    await db.transaction(async (tx) => { await tx.update(institutionBackups).set({ status: "FAILED", error: message, completedAt: new Date() }).where(and(eq(institutionBackups.id, job.id), eq(institutionBackups.institutionId, job.institution_id))); await tx.update(institutionGoogleDriveBackups).set({ lastBackupError: message, updatedAt: new Date() }).where(eq(institutionGoogleDriveBackups.institutionId, job.institution_id)); }); throw error;
  } finally { if (zip) await rm(zip, { force: true }); if (jsonl) await rm(jsonl, { force: true }); }
}
