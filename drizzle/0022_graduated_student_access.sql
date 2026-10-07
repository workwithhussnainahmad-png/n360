DO $$ BEGIN
  CREATE TYPE "student_academic_status" AS ENUM ('ACTIVE', 'GRADUATED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "institutions"
  ADD COLUMN IF NOT EXISTS "allow_graduated_student_access" boolean DEFAULT true NOT NULL;

ALTER TABLE "classes"
  ADD COLUMN IF NOT EXISTS "is_graduated_archive" boolean DEFAULT false NOT NULL;

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "academic_status" "student_academic_status" DEFAULT 'ACTIVE' NOT NULL;
