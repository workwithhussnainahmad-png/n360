/**
 * scripts/restore-central-drive-backup.ts
 *
 * Downloads and decrypts a central database backup from Google Drive.
 *
 * Usage:
 *   npx tsx scripts/restore-central-drive-backup.ts \
 *     --file-id <google-drive-file-id> \
 *     --output /path/to/output.dump
 *
 * Requires:
 *   GOOGLE_DRIVE_CENTRAL_CLIENT_ID
 *   GOOGLE_DRIVE_CENTRAL_CLIENT_SECRET
 *   GOOGLE_DRIVE_CENTRAL_REDIRECT_URI
 *   GOOGLE_DRIVE_CENTRAL_REFRESH_TOKEN
 *   CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY (the key active when the backup was created)
 *
 * IMPORTANT — Key rotation:
 *   If CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY was rotated after a backup was
 *   created, you must use the key that was active at the time of that backup.
 *   Set CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY to the older key value before
 *   running this script for older backups.
 *
 * After this script succeeds, restore the dump with:
 *   pg_restore --host <host> --username <user> --dbname <db> /path/to/output.dump
 *
 * NEVER accessible to institution users. Server-side only.
 */

import "dotenv/config";
import { writeFile, unlink, mkdir, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { createDecipheriv, scryptSync } from "node:crypto";
import { dirname, resolve } from "node:path";
import { statSync } from "node:fs";
import { getCentralAccessToken, sha256OfFile } from "@/lib/central-drive-backups";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

async function downloadDriveFile(fileId: string, destPath: string): Promise<{ name: string; size: number }> {
  const token = await getCentralAccessToken();

  // First get metadata.
  const metaRes = await fetch(
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id,name,size&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!metaRes.ok) {
    throw new Error(`Failed to get Drive file metadata (${metaRes.status})`);
  }
  const meta = await metaRes.json() as { id: string; name: string; size: string };
  const expectedSize = Number(meta.size);
  console.log(`[restore] File: ${meta.name} (${expectedSize} bytes)`);

  // Download the file content.
  const dlRes = await fetch(
    `${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!dlRes.ok) {
    throw new Error(`Failed to download Drive file (${dlRes.status})`);
  }
  if (!dlRes.body) throw new Error("Drive download response has no body");

  // Stream to disk.
  const chunks: Uint8Array[] = [];
  const reader = dlRes.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks);
  await writeFile(destPath, buffer, { mode: 0o600 });

  const downloadedSize = statSync(destPath).size;
  if (downloadedSize !== expectedSize) {
    throw new Error(`Downloaded size ${downloadedSize} does not match expected ${expectedSize}`);
  }

  return { name: meta.name, size: expectedSize };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fileIdIdx = args.indexOf("--file-id");
  const outputIdx = args.indexOf("--output");

  if (fileIdIdx === -1 || outputIdx === -1 || !args[fileIdIdx + 1] || !args[outputIdx + 1]) {
    process.stderr.write(
      [
        "",
        "  Central Drive Backup — Restore",
        "",
        "  Usage:",
        "    npx tsx scripts/restore-central-drive-backup.ts \\",
        "      --file-id <google-drive-file-id> \\",
        "      --output /path/to/output.dump",
        "",
        "  IMPORTANT: Set CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY to the key",
        "  that was active when the backup was created. If the key was rotated,",
        "  use the older key value.",
        "",
        "  After restore:",
        "    pg_restore --host <host> --username <user> --dbname <db> /path/to/output.dump",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const fileId = args[fileIdIdx + 1];
  const outputPath = resolve(args[outputIdx + 1]);
  const encPath = outputPath + ".enc";

  const encKey = process.env.CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY?.trim();
  if (!encKey || encKey.length < 32) {
    throw new Error(
      "CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY must be set (at least 32 characters). " +
      "If the key was rotated, use the key active at the time the backup was created.",
    );
  }

  const cleanup = async () => {
    try { await unlink(encPath); } catch { /* already gone */ }
  };

  try {
    await mkdir(dirname(outputPath), { recursive: true });

    // Step 1: Download the encrypted file.
    console.log(`\n[restore] Downloading Drive file: ${fileId}`);
    const { name, size } = await downloadDriveFile(fileId, encPath);
    const checksum = await sha256OfFile(encPath);
    console.log(`[restore] Downloaded: ${name} (${size} bytes, sha256=${checksum})`);

    // Step 2: Decrypt the N360GCM1 AES-256-GCM envelope.
    console.log(`[restore] Decrypting to: ${outputPath}`);
    try {
      const encrypted = await readFile(encPath);
      if (encrypted.subarray(0, 8).toString() !== "N360GCM1") throw new Error("Unsupported backup format");
      const salt = encrypted.subarray(8, 24);
      const iv = encrypted.subarray(24, 36);
      const tag = encrypted.subarray(36, 52);
      const ciphertext = encrypted.subarray(52);
      const key = scryptSync(encKey, salt, 32, { N: 16384, r: 8, p: 1 });
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      await writeFile(outputPath, Buffer.concat([decipher.update(ciphertext), decipher.final()]), { mode: 0o600 });
    } catch {
      throw new Error(
        "Decryption failed. Verify CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY matches the key used when the backup was created.",
      );
    }

    const decryptedSize = statSync(outputPath).size;
    console.log(`[restore] Decrypted: ${outputPath} (${decryptedSize} bytes)`);

    // Step 3: Verify the dump catalog (non-destructive).
    console.log("[restore] Verifying dump catalog...");
    try {
      execSync(`pg_restore --list "${outputPath}"`, { stdio: "ignore" });
      console.log("[restore] Dump catalog OK — pg_restore --list succeeded");
    } catch {
      console.warn("[restore] pg_restore --list failed — pg_restore may not be installed or the dump may be corrupt");
    }

    // Step 4: Summary.
    console.log("\n" + "=".repeat(72));
    console.log("  RESTORE PREPARATION COMPLETE");
    console.log("=".repeat(72));
    console.log(`  Source Drive file : ${name} (${fileId})`);
    console.log(`  Decrypted dump    : ${outputPath}`);
    console.log(`  Size              : ${decryptedSize} bytes`);
    console.log("");
    console.log("  To restore the database:");
    console.log(`    pg_restore --host <host> --port 5432 \\`);
    console.log(`      --username <user> --dbname <target-db> \\`);
    console.log(`      "${outputPath}"`);
    console.log("");
    console.log("  WARNING: pg_restore will overwrite data in the target database.");
    console.log("  Use a dedicated restore database, not the live production database.");
    console.log("=".repeat(72) + "\n");
  } catch (err) {
    await cleanup();
    throw err;
  }

  await cleanup();
}

main().catch((err) => {
  console.error("\n[restore] FAILED:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
