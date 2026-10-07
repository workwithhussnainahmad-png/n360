ALTER TABLE "fee_invoices"
  DROP CONSTRAINT IF EXISTS "fee_invoices_billing_month_check";

ALTER TABLE "fee_invoices"
  ADD CONSTRAINT "fee_invoices_billing_month_check"
  CHECK ("billing_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
