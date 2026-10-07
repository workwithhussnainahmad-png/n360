import { randomBytes, scryptSync, createCipheriv } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [, , input, output] = process.argv;
const passphrase = process.env.CENTRAL_DATABASE_BACKUP_ENCRYPTION_KEY;
if (!input || !output || !passphrase || passphrase.length < 32) {
  console.error("Usage: encrypt-backup.mjs <input> <output> (key from environment)");
  process.exit(2);
}

const salt = randomBytes(16);
const iv = randomBytes(12);
const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ciphertext = Buffer.concat([cipher.update(await readFile(input)), cipher.final()]);
const tag = cipher.getAuthTag();

// N360GCM1 | salt(16) | iv(12) | tag(16) | ciphertext
await writeFile(output, Buffer.concat([Buffer.from("N360GCM1"), salt, iv, tag, ciphertext]), { mode: 0o600 });
