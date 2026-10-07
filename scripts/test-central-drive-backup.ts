import "dotenv/config";
import { createCipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { statSync, unlinkSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { centralDriveFolderId, sha256OfFile, uploadCentralBackupFile, verifyCentralDriveFile } from "@/lib/central-drive-backups";

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("Run with --confirm to upload a labeled test file");
  const key = process.env.CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY?.trim();
  if (!key || key.length < 32) throw new Error("CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY must be set for this smoke test");
  const dir = join(tmpdir(), "nisaab360-central-test"); await mkdir(dir, { recursive: true });
  const raw = join(dir, `raw-${randomUUID()}.txt`); const encrypted = join(dir, `encrypted-${randomUUID()}.enc`);
  const name = `TEST-database-${new Date().toISOString().replace(/[:.]/g, "-")}.dump.enc`;
  try {
    const content = `Nisaab360 central backup smoke test\nGenerated: ${new Date().toISOString()}\n`;
    await writeFile(raw, content, { mode: 0o600 });
    const salt = randomBytes(16); const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", scryptSync(key, salt, 32, { N: 16384, r: 8, p: 1 }), iv);
    const ciphertext = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
    await writeFile(encrypted, Buffer.concat([Buffer.from("N360GCM1"), salt, iv, cipher.getAuthTag(), ciphertext]), { mode: 0o600 });
    const size = statSync(encrypted).size; const folderId = centralDriveFolderId();
    const uploaded = await uploadCentralBackupFile({ filePath: encrypted, fileName: name, folderId });
    if (!(await verifyCentralDriveFile({ driveFileId: uploaded.driveFileId, expectedSize: size }))) throw new Error("Drive verification failed");
    console.log(`SMOKE TEST PASSED: ${name} (${uploaded.driveFileId}, ${size} bytes, sha256=${await sha256OfFile(encrypted)})`);
  } finally {
    await unlink(raw).catch(() => undefined); await unlink(encrypted).catch(() => undefined);
    try { unlinkSync(raw); unlinkSync(encrypted); } catch { /* already removed */ }
  }
}
main().catch((error) => { console.error("SMOKE TEST FAILED:", error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
