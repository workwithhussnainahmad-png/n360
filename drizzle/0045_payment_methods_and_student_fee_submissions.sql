ALTER TABLE "institutions"
  ADD COLUMN IF NOT EXISTS "fee_payment_methods" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "admission_cycles"
  ADD COLUMN IF NOT EXISTS "payment_methods" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "admission_cycles"
SET "payment_methods" = jsonb_build_array(jsonb_build_object(
  'id', 'legacy-' || "id"::text,
  'providerName', "payment_bank_name",
  'accountTitle', '',
  'accountNumber', "payment_account_number",
  'qrUrl', "payment_qr_url"
))
WHERE "payment_methods" = '[]'::jsonb
  AND "payment_bank_name" IS NOT NULL
  AND "payment_account_number" IS NOT NULL;

ALTER TABLE "admission_fee_payments"
  ADD COLUMN IF NOT EXISTS "payment_methods" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "payer_source_bank" varchar(120);

UPDATE "admission_fee_payments"
SET "payment_methods" = jsonb_build_array(jsonb_build_object(
  'id', 'legacy-fee-' || "id"::text,
  'providerName', "bank_name",
  'accountTitle', '',
  'accountNumber', "account_number",
  'qrUrl', "qr_url"
))
WHERE "payment_methods" = '[]'::jsonb
  AND "bank_name" IS NOT NULL
  AND "account_number" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "fee_payment_submissions" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "invoice_id" integer NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL CHECK ("amount" > 0),
  "source_bank_name" varchar(120) NOT NULL,
  "transaction_id" varchar(160) NOT NULL,
  "proof_file_key" varchar(500) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'SUBMITTED' CHECK ("status" IN ('SUBMITTED', 'VERIFIED', 'REJECTED')),
  "reviewer_note" varchar(500),
  "verified_by" integer,
  "verified_at" timestamp,
  "submitted_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "fee_payment_submissions_invoice_status_idx"
  ON "fee_payment_submissions" ("invoice_id", "status");
CREATE INDEX IF NOT EXISTS "fee_payment_submissions_inst_status_submitted_idx"
  ON "fee_payment_submissions" ("institution_id", "status", "submitted_at");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_payment_submissions_one_pending_invoice_uidx"
  ON "fee_payment_submissions" ("invoice_id") WHERE "status" = 'SUBMITTED';
