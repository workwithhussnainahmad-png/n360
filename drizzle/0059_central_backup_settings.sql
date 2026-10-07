CREATE TABLE IF NOT EXISTS "central_backup_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "database_password_encrypted" text,
  "updated_by" integer REFERENCES "super_admins"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
