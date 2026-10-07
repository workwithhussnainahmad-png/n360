CREATE TABLE IF NOT EXISTS "institution_google_drive_backups" (
  "institution_id" integer PRIMARY KEY REFERENCES "institutions"("id") ON DELETE CASCADE,
  "credentials_encrypted" text,
  "folder_id" varchar(255),
  "folder_name" varchar(255),
  "backup_file_id" varchar(255),
  "backup_file_name" varchar(255),
  "archive_password_encrypted" text,
  "last_backup_at" timestamptz,
  "last_backup_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "institution_google_drive_backups_file_idx"
  ON "institution_google_drive_backups" ("backup_file_id");
