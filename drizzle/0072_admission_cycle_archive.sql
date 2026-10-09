ALTER TABLE admission_cycles ADD COLUMN IF NOT EXISTS archived_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admission_cycles_archive_closed') THEN
    ALTER TABLE admission_cycles ADD CONSTRAINT admission_cycles_archive_closed
      CHECK (archived_at IS NULL OR status = 'CLOSED');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS admission_cycles_archive_list_idx
  ON admission_cycles (institution_id, archived_at DESC, id DESC) WHERE archived_at IS NOT NULL;
CREATE OR REPLACE FUNCTION protect_admission_cycle_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM admission_applications WHERE cycle_id = OLD.id) THEN
    RAISE EXCEPTION 'This cycle has application records; archive it instead' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS protect_admission_cycle_history ON admission_cycles;
CREATE TRIGGER protect_admission_cycle_history BEFORE DELETE ON admission_cycles
FOR EACH ROW EXECUTE FUNCTION protect_admission_cycle_history();
CREATE OR REPLACE FUNCTION protect_admission_offering_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM admission_applications WHERE offering_id = OLD.id) THEN
    RAISE EXCEPTION 'This offering has application records and cannot be deleted' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS protect_admission_offering_history ON admission_offerings;
CREATE TRIGGER protect_admission_offering_history BEFORE DELETE ON admission_offerings
FOR EACH ROW EXECUTE FUNCTION protect_admission_offering_history();
