ALTER TABLE "institution_backups"
ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;

