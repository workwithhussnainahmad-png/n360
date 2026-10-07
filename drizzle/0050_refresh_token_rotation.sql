ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp,
  ADD COLUMN IF NOT EXISTS "replaced_by_hash" text,
  ADD COLUMN IF NOT EXISTS "reuse_detected_at" timestamp;

CREATE INDEX IF NOT EXISTS "refresh_tokens_active_user_idx"
  ON "refresh_tokens" ("user_role", "user_id")
  WHERE "revoked_at" IS NULL;

COMMENT ON COLUMN "refresh_tokens"."replaced_by_hash" IS
  'SHA-256 hash of the one-time successor token; presence enables reuse detection.';
COMMENT ON COLUMN "refresh_tokens"."reuse_detected_at" IS
  'First time an already-replaced refresh token was presented again.';
