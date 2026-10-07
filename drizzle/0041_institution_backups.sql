CREATE TABLE IF NOT EXISTS "institution_backups" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "backup_type" varchar(16) NOT NULL,
  "period_key" varchar(40) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'PENDING',
  "object_key" text,
  "file_size" bigint,
  "sha256" varchar(64),
  "record_count" integer,
  "table_count" integer,
  "requested_by" integer REFERENCES "super_admins"("id") ON DELETE SET NULL,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  CONSTRAINT "institution_backups_type_check" CHECK ("backup_type" IN ('DAILY', 'MONTHLY', 'MANUAL', 'EXPORT')),
  CONSTRAINT "institution_backups_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  CONSTRAINT "institution_backups_period_unique" UNIQUE ("institution_id", "backup_type", "period_key")
);

CREATE INDEX IF NOT EXISTS "institution_backups_institution_created_idx"
  ON "institution_backups" ("institution_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "institution_backups_pending_idx"
  ON "institution_backups" ("created_at", "id") WHERE "status" = 'PENDING';

