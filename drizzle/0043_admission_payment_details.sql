ALTER TABLE "admission_cycles"
  ADD COLUMN IF NOT EXISTS "payment_bank_name" varchar(120),
  ADD COLUMN IF NOT EXISTS "payment_account_number" varchar(160),
  ADD COLUMN IF NOT EXISTS "payment_qr_url" varchar(500);

ALTER TABLE "admission_fee_payments"
  ADD COLUMN IF NOT EXISTS "bank_name" varchar(120),
  ADD COLUMN IF NOT EXISTS "account_number" varchar(160),
  ADD COLUMN IF NOT EXISTS "qr_url" varchar(500);

ALTER TABLE "admission_applications"
  ADD COLUMN IF NOT EXISTS "previous_class_marks" varchar(100),
  ADD COLUMN IF NOT EXISTS "medical_information" text;
