-- Legacy invoices intentionally remain unknown: today's class is not evidence
-- of the class that was billed. New invoices capture their issuance details.
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS class_id_at_issue integer;
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS class_name_at_issue varchar(255);
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS section_id_at_issue integer;
ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS section_name_at_issue varchar(255);
CREATE INDEX IF NOT EXISTS fee_invoices_issued_class_idx
  ON fee_invoices (institution_id, class_id_at_issue, billing_month, status, created_at DESC, id DESC);

-- A cycle SHARE lock makes a concurrent archive wait for committed writes.
-- After archive commits, stale API screens cannot mutate historical records.
CREATE OR REPLACE FUNCTION protect_archived_admission_records() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  record_data jsonb;
  target_cycle integer;
  archive_time timestamptz;
BEGIN
  -- On UPDATE protect both the old owner and a proposed new owner.
  FOR record_data IN SELECT value FROM jsonb_array_elements(
    CASE TG_OP WHEN 'INSERT' THEN jsonb_build_array(to_jsonb(NEW))
      WHEN 'DELETE' THEN jsonb_build_array(to_jsonb(OLD))
      ELSE jsonb_build_array(to_jsonb(OLD), to_jsonb(NEW)) END
  ) LOOP
    IF TG_TABLE_NAME = 'admission_applications' THEN
      target_cycle := (record_data->>'cycle_id')::integer;
    ELSE
      SELECT cycle_id INTO target_cycle FROM admission_applications
        WHERE id = (record_data->>'application_id')::integer;
    END IF;
    SELECT archived_at INTO archive_time FROM admission_cycles WHERE id = target_cycle FOR SHARE;
    IF archive_time IS NOT NULL THEN
      RAISE EXCEPTION 'Restore this archived admission cycle before changing its records' USING ERRCODE = 'N3601';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['admission_applications', 'admission_document_requests',
    'admission_appointments', 'admission_application_events', 'admission_fee_payments',
    'admission_fee_proofs', 'admission_enrollments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS protect_archived_admission_records ON %I', target_table);
    EXECUTE format('CREATE TRIGGER protect_archived_admission_records BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_archived_admission_records()', target_table);
  END LOOP;
END $$;
