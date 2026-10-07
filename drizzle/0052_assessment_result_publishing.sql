ALTER TABLE "tests"
ADD COLUMN IF NOT EXISTS "results_published_at" timestamp;

-- Results entered before the draft/publish workflow were already visible to
-- students, so preserve that behaviour for existing records.
UPDATE "tests"
SET "results_published_at" = COALESCE("created_at", NOW())
WHERE "results_published_at" IS NULL;

CREATE INDEX IF NOT EXISTS "tests_institution_class_subject_date_idx"
ON "tests" ("institution_id", "class_id", "subject_id", "date");
