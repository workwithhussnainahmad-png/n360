CREATE TABLE IF NOT EXISTS "central_database_backups" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size_bytes" bigint,
  "sha256" text,
  "drive_file_id" text,
  "status" text DEFAULT 'IN_PROGRESS' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "central_database_backups_run_id_idx" ON "central_database_backups" ("run_id");
CREATE INDEX IF NOT EXISTS "central_database_backups_status_idx" ON "central_database_backups" ("status");
