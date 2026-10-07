CREATE TABLE IF NOT EXISTS "admission_applicant_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "guardian_email" varchar(255) NOT NULL,
  "password_hash" text NOT NULL,
  "must_change_password" boolean DEFAULT true NOT NULL,
  "session_version" integer DEFAULT 0 NOT NULL,
  "failed_login_count" integer DEFAULT 0 NOT NULL,
  "locked_until" timestamp,
  "last_login_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admission_applicant_accounts_id_inst_unique" UNIQUE ("id", "institution_id"),
  CONSTRAINT "admission_applicant_accounts_failed_login_check" CHECK ("failed_login_count" >= 0),
  CONSTRAINT "admission_applicant_accounts_session_version_check" CHECK ("session_version" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "admission_applicant_accounts_inst_email_uidx"
  ON "admission_applicant_accounts" ("institution_id", lower("guardian_email"));

ALTER TABLE "admission_applications"
  ADD COLUMN IF NOT EXISTS "applicant_id" integer;

ALTER TABLE "admission_applications"
  DROP CONSTRAINT IF EXISTS "admission_applications_applicant_id_fk",
  DROP CONSTRAINT IF EXISTS "admission_applications_applicant_tenant_fk";

ALTER TABLE "admission_applications"
  ADD CONSTRAINT "admission_applications_applicant_tenant_fk"
  FOREIGN KEY ("applicant_id", "institution_id") REFERENCES "admission_applicant_accounts"("id", "institution_id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "admission_applications_applicant_submitted_idx"
  ON "admission_applications" ("applicant_id", "submitted_at");
