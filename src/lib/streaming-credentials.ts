import crypto from "node:crypto";

function key() {
  // Prefer a dedicated encryption key so streaming-provider credentials can be
  // rotated independently. JWT_SECRET is the safe compatibility fallback: it is
  // already mandatory in every production app container and is validated to be
  // at least 32 characters during startup.
  const secret = process.env.STREAMING_CREDENTIALS_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "STREAMING_CREDENTIALS_SECRET or JWT_SECRET must be at least 32 characters",
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptStreamingCredentials(value: Record<string, string>) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function hasStreamingCredentials(value: string | null | undefined) {
  return Boolean(value?.startsWith("v1."));
}

export function decryptStreamingCredentials(
  value: string | null | undefined,
): Record<string, string> | null {
  if (!value?.startsWith("v1.")) return null;
  const [, encodedIv, encodedTag, encodedValue] = value.split(".");
  if (!encodedIv || !encodedTag || !encodedValue) return null;

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encodedValue, "base64url")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return null;
  }
}
