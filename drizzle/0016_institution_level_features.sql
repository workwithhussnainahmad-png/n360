ALTER TYPE "test_type" ADD VALUE IF NOT EXISTS 'PROMOTION';

DO $$ BEGIN
  CREATE TYPE "promotion_status" AS ENUM ('PROMOTED', 'RETAINED', 'GRADUATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "grading_scales" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "passing_percentage" real NOT NULL,
  "grades_json" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "grading_scales_institution_id_unique" UNIQUE("institution_id"),
  CONSTRAINT "grading_scales_passing_percentage_check" CHECK ("passing_percentage" >= 0 AND "passing_percentage" <= 100)
);

CREATE TABLE IF NOT EXISTS "institution_custom_roles" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "permissions" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "institution_custom_roles_institution_name_unique" UNIQUE("institution_id", "name")
);

ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "custom_role_id" integer REFERENCES "institution_custom_roles"("id") ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "student_promotions" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "from_class_id" integer NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "to_class_id" integer REFERENCES "classes"("id") ON DELETE SET NULL,
  "status" "promotion_status" NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "student_promotions_institution_student_idx"
  ON "student_promotions" ("institution_id", "student_id");
