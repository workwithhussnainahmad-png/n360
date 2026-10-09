-- Preserve issued totals/payment history; existing invoices remain monthly.
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS billing_key varchar(36) NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS billing_kind varchar(20) NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS billing_label varchar(120);
CREATE TABLE IF NOT EXISTS fee_billing_batches (
  id varchar(36) PRIMARY KEY,
  institution_id integer NOT NULL REFERENCES institutions(id),
  label varchar(120) NOT NULL,
  request_hash varchar(64) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
ALTER TABLE fee_invoices DROP CONSTRAINT IF EXISTS fee_invoices_institution_student_month_unique;
CREATE UNIQUE INDEX IF NOT EXISTS fee_invoices_institution_student_billing_unique
  ON fee_invoices(institution_id, student_id, billing_month, billing_key);
ALTER TABLE student_fee_adjustments ADD COLUMN IF NOT EXISTS frequency varchar(20) NOT NULL DEFAULT 'RECURRING';
ALTER TABLE student_fee_adjustments ADD COLUMN IF NOT EXISTS start_month varchar(7);
ALTER TABLE student_fee_adjustments ADD COLUMN IF NOT EXISTS end_month varchar(7);
ALTER TABLE student_fee_adjustments ADD COLUMN IF NOT EXISTS consumed_invoice_id integer REFERENCES fee_invoices(id);
-- Historical adjustments keep their established recurring behavior; no totals change.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fee_invoice_billing_kind_check') THEN
    ALTER TABLE fee_invoices ADD CONSTRAINT fee_invoice_billing_kind_check CHECK
      ((billing_kind='MONTHLY' AND billing_key='MONTHLY') OR
       (billing_kind='ONE_TIME' AND billing_key ~ '^[0-9a-fA-F-]{36}$'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fee_adjustment_period_check') THEN
    ALTER TABLE student_fee_adjustments ADD CONSTRAINT fee_adjustment_period_check CHECK (
      frequency IN ('ONCE','RECURRING') AND
      (start_month IS NULL OR start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') AND
      (end_month IS NULL OR end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') AND
      (start_month IS NULL OR end_month IS NULL OR end_month >= start_month));
  END IF;
END $$;
