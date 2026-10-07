ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'PARENT';

DO $$ BEGIN
  CREATE TYPE "parent_account_status" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'DISABLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "guardian_email" varchar(255);

CREATE INDEX IF NOT EXISTS "students_institution_guardian_email_idx"
  ON "students" ("institution_id", "guardian_email");

CREATE TABLE IF NOT EXISTS "parent_accounts" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "name" varchar(255),
  "email" varchar(255) NOT NULL,
  "phone" varchar(50),
  "password_hash" text,
  "status" "parent_account_status" NOT NULL DEFAULT 'PENDING_ACTIVATION',
  "must_change_password" boolean NOT NULL DEFAULT true,
  "session_version" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "deleted_at" timestamp,
  CONSTRAINT "parent_accounts_institution_email_unique" UNIQUE ("institution_id", "email"),
  CONSTRAINT "parent_accounts_id_institution_unique" UNIQUE ("id", "institution_id"),
  CONSTRAINT "parent_accounts_email_normalized_check" CHECK ("email" = lower(btrim("email")))
);

CREATE INDEX IF NOT EXISTS "parent_accounts_institution_id_idx"
  ON "parent_accounts" ("institution_id");

CREATE TABLE IF NOT EXISTS "parent_students" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "parent_id" integer NOT NULL REFERENCES "parent_accounts"("id") ON DELETE CASCADE,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "relationship" varchar(50) NOT NULL DEFAULT 'GUARDIAN',
  "linked_by_id" integer NOT NULL,
  "linked_by_role" "user_role" NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "parent_students_institution_student_unique" UNIQUE ("institution_id", "student_id"),
  CONSTRAINT "parent_students_parent_student_unique" UNIQUE ("parent_id", "student_id"),
  CONSTRAINT "parent_students_parent_tenant_fk" FOREIGN KEY ("parent_id", "institution_id")
    REFERENCES "parent_accounts" ("id", "institution_id") ON DELETE CASCADE,
  CONSTRAINT "parent_students_student_tenant_fk" FOREIGN KEY ("student_id", "institution_id")
    REFERENCES "students" ("id", "institution_id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "parent_students_parent_id_idx" ON "parent_students" ("parent_id");
CREATE INDEX IF NOT EXISTS "parent_students_student_id_idx" ON "parent_students" ("student_id");

-- Preserve guardian identities for students enrolled before this migration.
UPDATE "students" AS s
SET "guardian_email" = lower(btrim(a."guardian_email"))
FROM "admission_enrollments" AS e
JOIN "admission_applications" AS a
  ON a."id" = e."application_id" AND a."institution_id" = e."institution_id"
WHERE s."id" = e."student_id"
  AND s."institution_id" = e."institution_id"
  AND a."guardian_email" IS NOT NULL
  AND btrim(a."guardian_email") <> '';

INSERT INTO "parent_accounts" ("institution_id", "name", "email", "phone")
SELECT DISTINCT ON (a."institution_id", lower(btrim(a."guardian_email")))
  a."institution_id",
  a."guardian_name",
  lower(btrim(a."guardian_email")),
  a."guardian_phone"
FROM "admission_enrollments" AS e
JOIN "admission_applications" AS a
  ON a."id" = e."application_id" AND a."institution_id" = e."institution_id"
WHERE a."guardian_email" IS NOT NULL AND btrim(a."guardian_email") <> ''
ORDER BY a."institution_id", lower(btrim(a."guardian_email")), a."updated_at" DESC
ON CONFLICT ("institution_id", "email") DO NOTHING;

INSERT INTO "parent_students" (
  "institution_id", "parent_id", "student_id", "linked_by_id", "linked_by_role"
)
SELECT
  e."institution_id",
  p."id",
  e."student_id",
  e."enrolled_by",
  'INSTITUTION'::"user_role"
FROM "admission_enrollments" AS e
JOIN "admission_applications" AS a
  ON a."id" = e."application_id" AND a."institution_id" = e."institution_id"
JOIN "parent_accounts" AS p
  ON p."institution_id" = a."institution_id"
 AND p."email" = lower(btrim(a."guardian_email"))
ON CONFLICT ("institution_id", "student_id") DO NOTHING;
