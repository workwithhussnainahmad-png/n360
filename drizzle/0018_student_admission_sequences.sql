ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "admission_sequence" integer;

CREATE TABLE IF NOT EXISTS "student_admission_counters" (
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "admission_year" integer NOT NULL,
  "next_sequence" integer NOT NULL DEFAULT 1,
  PRIMARY KEY ("institution_id", "admission_year")
);

CREATE UNIQUE INDEX IF NOT EXISTS "students_institution_year_admission_sequence_unique"
  ON "students" ("institution_id", "year_of_joining", "admission_sequence");
