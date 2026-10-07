ALTER TABLE "admission_cycles"
  ADD COLUMN IF NOT EXISTS "required_documents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "test_scheduled_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "test_location" varchar(300),
  ADD COLUMN IF NOT EXISTS "test_instructions" text,
  ADD COLUMN IF NOT EXISTS "interview_scheduled_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "interview_location" varchar(300),
  ADD COLUMN IF NOT EXISTS "interview_instructions" text,
  ADD COLUMN IF NOT EXISTS "admission_fee_amount" integer,
  ADD COLUMN IF NOT EXISTS "admission_fee_due_days" integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "admission_fee_instructions" text;

ALTER TABLE "admission_cycles"
  DROP CONSTRAINT IF EXISTS "admission_cycles_fee_amount_check",
  ADD CONSTRAINT "admission_cycles_fee_amount_check" CHECK ("admission_fee_amount" IS NULL OR "admission_fee_amount" > 0),
  DROP CONSTRAINT IF EXISTS "admission_cycles_fee_due_days_check",
  ADD CONSTRAINT "admission_cycles_fee_due_days_check" CHECK ("admission_fee_due_days" BETWEEN 1 AND 90),
  DROP CONSTRAINT IF EXISTS "admission_cycles_required_documents_check",
  ADD CONSTRAINT "admission_cycles_required_documents_check" CHECK (jsonb_typeof("required_documents") = 'array' AND jsonb_array_length("required_documents") <= 20);
