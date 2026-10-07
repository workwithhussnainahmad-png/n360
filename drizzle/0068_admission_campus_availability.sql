CREATE TABLE IF NOT EXISTS admission_cycle_campuses (
  cycle_id integer NOT NULL REFERENCES admission_cycles(id) ON DELETE CASCADE,
  campus_id integer NOT NULL,
  institution_id integer NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  is_open boolean NOT NULL DEFAULT false,
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, campus_id),
  CONSTRAINT admission_cycle_campuses_campus_tenant_fk FOREIGN KEY (campus_id, institution_id) REFERENCES campuses(id, institution_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS admission_cycle_campuses_inst_idx ON admission_cycle_campuses(institution_id, cycle_id);

CREATE OR REPLACE FUNCTION validate_admission_cycle_campus() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE intake_id integer;
BEGIN
  SELECT institution_id INTO intake_id FROM admission_cycles WHERE id = NEW.cycle_id;
  IF intake_id IS NULL OR (NEW.institution_id <> intake_id AND NOT EXISTS (
    SELECT 1 FROM institutions WHERE id = NEW.institution_id AND parent_institution_id = intake_id
  )) THEN RAISE EXCEPTION 'Campus does not belong to this admission cycle' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS admission_cycle_campus_guard ON admission_cycle_campuses;
CREATE TRIGGER admission_cycle_campus_guard BEFORE INSERT OR UPDATE ON admission_cycle_campuses FOR EACH ROW EXECUTE FUNCTION validate_admission_cycle_campus();

-- Only the original owning campus keeps an already-open cycle. Never open siblings.
-- The migration ledger prevents this initial backfill from reopening a later closure.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM nisaab360_supplemental_migrations WHERE name = '0068_admission_campus_availability.sql') THEN
    INSERT INTO admission_cycle_campuses(cycle_id, campus_id, institution_id, is_open)
    SELECT ac.id, c.id, c.institution_id, true FROM admission_cycles ac
    JOIN institutions i ON i.id = ac.institution_id
    JOIN campuses c ON c.institution_id = i.id AND c.name = i.campus_name
    WHERE ac.status = 'OPEN' AND c.deleted_at IS NULL AND i.deleted_at IS NULL AND i.status = 'APPROVED'
    ON CONFLICT (cycle_id, campus_id) DO NOTHING;
  END IF;
END $$;
