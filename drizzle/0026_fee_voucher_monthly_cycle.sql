ALTER TABLE "institutions"
ADD COLUMN IF NOT EXISTS "fee_voucher_open_day" integer,
ADD COLUMN IF NOT EXISTS "fee_voucher_late_day" integer,
ADD COLUMN IF NOT EXISTS "fee_voucher_late_fee" integer NOT NULL DEFAULT 0;

ALTER TABLE "institutions"
DROP CONSTRAINT IF EXISTS "institutions_fee_voucher_open_day_check",
ADD CONSTRAINT "institutions_fee_voucher_open_day_check"
CHECK ("fee_voucher_open_day" IS NULL OR "fee_voucher_open_day" BETWEEN 1 AND 28);

ALTER TABLE "institutions"
DROP CONSTRAINT IF EXISTS "institutions_fee_voucher_late_day_check",
ADD CONSTRAINT "institutions_fee_voucher_late_day_check"
CHECK ("fee_voucher_late_day" IS NULL OR "fee_voucher_late_day" BETWEEN 1 AND 28);

ALTER TABLE "institutions"
DROP CONSTRAINT IF EXISTS "institutions_fee_voucher_day_order_check",
ADD CONSTRAINT "institutions_fee_voucher_day_order_check"
CHECK (
  "fee_voucher_open_day" IS NULL
  OR "fee_voucher_late_day" IS NULL
  OR "fee_voucher_late_day" > "fee_voucher_open_day"
);

ALTER TABLE "institutions"
DROP CONSTRAINT IF EXISTS "institutions_fee_voucher_late_fee_check",
ADD CONSTRAINT "institutions_fee_voucher_late_fee_check"
CHECK ("fee_voucher_late_fee" >= 0);

ALTER TABLE "announcements"
ADD COLUMN IF NOT EXISTS "automation_key" varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS "announcements_automation_key_unique"
ON "announcements" ("automation_key");

ALTER TABLE "fee_vouchers"
ADD COLUMN IF NOT EXISTS "billing_month" varchar(7),
ADD COLUMN IF NOT EXISTS "late_fee_amount" integer NOT NULL DEFAULT 0;

ALTER TABLE "fee_vouchers"
DROP CONSTRAINT IF EXISTS "fee_vouchers_late_fee_amount_check",
ADD CONSTRAINT "fee_vouchers_late_fee_amount_check"
CHECK ("late_fee_amount" >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS "fee_vouchers_institution_student_month_unique"
ON "fee_vouchers" ("institution_id", "student_id", "billing_month");

CREATE TABLE IF NOT EXISTS "fee_voucher_cycles" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "billing_month" varchar(7) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'DUE',
  "late_fee_amount" integer NOT NULL DEFAULT 0,
  "voucher_id" integer REFERENCES "fee_vouchers"("id") ON DELETE SET NULL,
  "late_marked_at" timestamp,
  "submitted_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fee_voucher_cycles_status_check" CHECK ("status" IN ('DUE', 'LATE', 'SUBMITTED')),
  CONSTRAINT "fee_voucher_cycles_late_fee_check" CHECK ("late_fee_amount" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "fee_voucher_cycles_institution_student_month_unique"
ON "fee_voucher_cycles" ("institution_id", "student_id", "billing_month");

CREATE INDEX IF NOT EXISTS "fee_voucher_cycles_institution_month_status_idx"
ON "fee_voucher_cycles" ("institution_id", "billing_month", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "fee_voucher_cycles_voucher_unique"
ON "fee_voucher_cycles" ("voucher_id");
