CREATE TABLE IF NOT EXISTS "fee_heads" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "kind" varchar(20) NOT NULL DEFAULT 'RECURRING' CHECK ("kind" IN ('RECURRING', 'ONE_TIME')),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fee_heads_institution_name_unique" UNIQUE ("institution_id", "name")
);
CREATE INDEX IF NOT EXISTS "fee_heads_institution_active_idx" ON "fee_heads" ("institution_id", "is_active");

CREATE TABLE IF NOT EXISTS "class_fee_items" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "class_id" integer NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
  "fee_head_id" integer NOT NULL REFERENCES "fee_heads"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL CHECK ("amount" >= 0),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "class_fee_items_class_head_unique" UNIQUE ("institution_id", "class_id", "fee_head_id")
);
CREATE INDEX IF NOT EXISTS "class_fee_items_institution_class_idx" ON "class_fee_items" ("institution_id", "class_id");

CREATE TABLE IF NOT EXISTS "student_fee_adjustments" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "label" varchar(120) NOT NULL,
  "type" varchar(20) NOT NULL CHECK ("type" IN ('DISCOUNT', 'CHARGE')),
  "amount" integer NOT NULL CHECK ("amount" > 0),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "student_fee_adjustments_institution_student_idx" ON "student_fee_adjustments" ("institution_id", "student_id", "is_active");

CREATE TABLE IF NOT EXISTS "fee_invoices" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "billing_month" varchar(7) NOT NULL CHECK ("billing_month" ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
  "due_date" date NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'DUE' CHECK ("status" IN ('DUE', 'PARTIAL', 'PAID', 'VOID')),
  "subtotal" integer NOT NULL CHECK ("subtotal" >= 0),
  "discount_amount" integer NOT NULL DEFAULT 0 CHECK ("discount_amount" >= 0),
  "additional_amount" integer NOT NULL DEFAULT 0 CHECK ("additional_amount" >= 0),
  "late_fee_amount" integer NOT NULL DEFAULT 0 CHECK ("late_fee_amount" >= 0),
  "total_amount" integer NOT NULL CHECK ("total_amount" >= 0),
  "paid_amount" integer NOT NULL DEFAULT 0 CHECK ("paid_amount" >= 0),
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fee_invoices_institution_student_month_unique" UNIQUE ("institution_id", "student_id", "billing_month")
);
CREATE INDEX IF NOT EXISTS "fee_invoices_institution_month_status_idx" ON "fee_invoices" ("institution_id", "billing_month", "status");
CREATE INDEX IF NOT EXISTS "fee_invoices_student_created_idx" ON "fee_invoices" ("student_id", "created_at");

CREATE TABLE IF NOT EXISTS "fee_invoice_items" (
  "id" serial PRIMARY KEY,
  "invoice_id" integer NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "fee_head_id" integer REFERENCES "fee_heads"("id") ON DELETE SET NULL,
  "label" varchar(120) NOT NULL,
  "type" varchar(20) NOT NULL CHECK ("type" IN ('FEE', 'DISCOUNT', 'CHARGE', 'LATE_FEE')),
  "amount" integer NOT NULL CHECK ("amount" >= 0)
);
CREATE INDEX IF NOT EXISTS "fee_invoice_items_invoice_idx" ON "fee_invoice_items" ("invoice_id");

CREATE TABLE IF NOT EXISTS "fee_payments" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "invoice_id" integer NOT NULL REFERENCES "fee_invoices"("id") ON DELETE CASCADE,
  "student_id" integer NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "receipt_number" varchar(50) NOT NULL,
  "amount" integer NOT NULL CHECK ("amount" > 0),
  "method" varchar(30) NOT NULL CHECK ("method" IN ('CASH', 'BANK', 'EASYPAISA', 'JAZZCASH', 'OTHER')),
  "reference" varchar(120),
  "notes" text,
  "received_at" timestamp NOT NULL DEFAULT now(),
  "recorded_by" integer NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fee_payments_institution_receipt_unique" UNIQUE ("institution_id", "receipt_number")
);
CREATE INDEX IF NOT EXISTS "fee_payments_invoice_created_idx" ON "fee_payments" ("invoice_id", "created_at");
CREATE INDEX IF NOT EXISTS "fee_payments_institution_received_idx" ON "fee_payments" ("institution_id", "received_at");
