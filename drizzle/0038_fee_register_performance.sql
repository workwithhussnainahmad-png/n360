-- Keep the fee register index-backed as invoice and student volumes grow.
-- pg_trgm supports the existing contains-search UX without forcing sequential
-- scans for student names and roll numbers.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "fee_invoices_inst_month_created_idx"
  ON "fee_invoices" ("institution_id", "billing_month", "created_at" DESC, "id" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "fee_invoices_inst_month_status_created_idx"
  ON "fee_invoices" ("institution_id", "billing_month", "status", "created_at" DESC, "id" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "students_name_trgm_idx"
  ON "students" USING gin (lower("name") gin_trgm_ops)
  WHERE "deleted_at" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "students_login_roll_trgm_idx"
  ON "students" USING gin (lower("login_roll_number") gin_trgm_ops)
  WHERE "deleted_at" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "students_class_roll_trgm_idx"
  ON "students" USING gin (lower("class_roll_number") gin_trgm_ops)
  WHERE "deleted_at" IS NULL AND "class_roll_number" IS NOT NULL;
