DO $$ BEGIN
  CREATE TYPE "admission_fee_payment_status" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "admission_application_status" ADD VALUE IF NOT EXISTS 'FEE_VERIFIED' AFTER 'FEE_VERIFICATION';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_id_institution_unique') THEN
    ALTER TABLE "students" ADD CONSTRAINT "students_id_institution_unique" UNIQUE ("id", "institution_id");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "admission_fee_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "application_id" integer NOT NULL,
  "amount" integer NOT NULL,
  "due_date" date,
  "instructions" text NOT NULL,
  "payer_reference" varchar(160),
  "proof_file_key" varchar(500),
  "status" "admission_fee_payment_status" DEFAULT 'PENDING' NOT NULL,
  "reviewer_note" varchar(500),
  "verified_by" integer,
  "verified_at" timestamp,
  "submitted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admission_fee_payments_application_unique" UNIQUE ("application_id"),
  CONSTRAINT "admission_fee_payments_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "admission_fee_payments_instructions_length_check" CHECK (char_length("instructions") <= 3000),
  CONSTRAINT "admission_fee_payments_application_tenant_fk" FOREIGN KEY ("application_id", "institution_id") REFERENCES "admission_applications"("id", "institution_id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "admission_enrollments" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "application_id" integer NOT NULL,
  "student_id" integer NOT NULL,
  "enrolled_by" integer NOT NULL,
  "credentials_issued_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admission_enrollments_application_unique" UNIQUE ("application_id"),
  CONSTRAINT "admission_enrollments_student_unique" UNIQUE ("student_id"),
  CONSTRAINT "admission_enrollments_application_tenant_fk" FOREIGN KEY ("application_id", "institution_id") REFERENCES "admission_applications"("id", "institution_id") ON DELETE RESTRICT,
  CONSTRAINT "admission_enrollments_student_tenant_fk" FOREIGN KEY ("student_id", "institution_id") REFERENCES "students"("id", "institution_id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "admission_fee_payments_inst_status_idx" ON "admission_fee_payments" ("institution_id", "status");
