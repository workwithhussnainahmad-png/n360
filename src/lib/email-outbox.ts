import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailOutbox } from "@/db/schema";
import { deliverEmail } from "@/lib/email";

function outboxKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be at least 32 characters for email outbox encryption");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptHtml(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", outboxKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

function decryptHtml(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted email payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", outboxKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

type QueueEmail = {
  institutionId?: number;
  to: string;
  subject: string;
  html: string;
  dedupeKey?: string;
};

export async function enqueueEmail(message: QueueEmail) {
  const [queued] = await db.insert(emailOutbox).values({
    institutionId: message.institutionId,
    recipient: message.to.trim().toLowerCase(),
    subject: message.subject,
    html: encryptHtml(message.html),
    dedupeKey: message.dedupeKey,
  }).onConflictDoNothing().returning({ id: emailOutbox.id });
  
  return queued?.id ?? null;
}

type ClaimedEmail = {
  id: number;
  recipient: string;
  subject: string;
  html: string;
  attempt_count: number;
};

export async function processEmailOutboxBatch(limit = 20) {
  // tenant-audit: allow-cross-tenant emailOutbox — this singleton delivery worker drains the shared queue for every institution.
  await db.update(emailOutbox).set({
    status: "PENDING",
    lockedAt: null,
    nextAttemptAt: new Date(),
    lastError: "Delivery worker interrupted; retrying.",
    updatedAt: new Date(),
  }).where(and(eq(emailOutbox.status, "PROCESSING"), sql`${emailOutbox.lockedAt} < now() - interval '15 minutes'`));

  const claimed = await db.execute<ClaimedEmail>(sql`
    UPDATE email_outbox
    SET status = 'PROCESSING', locked_at = now(), attempt_count = attempt_count + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM email_outbox
      WHERE status = 'PENDING' AND next_attempt_at <= now()
      ORDER BY next_attempt_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT ${Math.min(Math.max(limit, 1), 100)}
    )
    RETURNING id, recipient, subject, html, attempt_count
  `);

  let sent = 0;
  let retried = 0;
  let failed = 0;
  for (const message of claimed.rows) {
    try {
      await deliverEmail({ to: message.recipient, subject: message.subject, html: decryptHtml(message.html) });
      // Once delivered, remove the encrypted body as well; delivery metadata is
      // sufficient for auditing and old temporary credentials need not persist.
      // tenant-audit: allow-cross-tenant emailOutbox — message IDs came from the worker's globally claimed batch.
      await db.update(emailOutbox).set({ status: "SENT", html: "", sentAt: new Date(), lockedAt: null, lastError: null, updatedAt: new Date() }).where(eq(emailOutbox.id, message.id));
      sent += 1;
    } catch (error) {
      const exhausted = message.attempt_count >= 5;
      const delayMinutes = Math.min(60, 2 ** Math.max(0, message.attempt_count - 1));
      const lastError = (error instanceof Error ? error.message : "Email delivery failed").slice(0, 2000);
      // tenant-audit: allow-cross-tenant emailOutbox — message IDs came from the worker's globally claimed batch.
      await db.update(emailOutbox).set({
        status: exhausted ? "FAILED" : "PENDING",
        nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
        lockedAt: null,
        lastError,
        updatedAt: new Date(),
      }).where(eq(emailOutbox.id, message.id));
      if (exhausted) failed += 1;
      else retried += 1;
    }
  }
  return { claimed: claimed.rows.length, sent, retried, failed };
}
