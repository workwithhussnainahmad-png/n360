ALTER TABLE "batch_exams"
  ADD COLUMN IF NOT EXISTS "type" "test_type" DEFAULT 'FINAL' NOT NULL;
