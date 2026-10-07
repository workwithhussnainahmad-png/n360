ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS intake_institution_id integer;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS campus_id integer;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS campus_name varchar(255);

UPDATE admission_applications a SET intake_institution_id = a.institution_id WHERE intake_institution_id IS NULL;
UPDATE admission_applications a SET campus_id = (
  SELECT c.id FROM campuses c JOIN institutions i ON i.id = c.institution_id
  WHERE c.institution_id = a.institution_id AND c.deleted_at IS NULL
  ORDER BY (c.name = i.campus_name) DESC, c.id LIMIT 1
) WHERE campus_id IS NULL;
UPDATE admission_applications a SET campus_name = COALESCE(
  (SELECT c.name FROM campuses c WHERE c.id = a.campus_id),
  (SELECT i.campus_name FROM institutions i WHERE i.id = a.institution_id), 'Main'
) WHERE campus_name IS NULL;
ALTER TABLE admission_applications ALTER COLUMN intake_institution_id SET NOT NULL;
ALTER TABLE admission_applications ALTER COLUMN campus_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS campuses_id_inst_unique ON campuses(id, institution_id);
ALTER TABLE admission_applications DROP CONSTRAINT IF EXISTS admission_applications_applicant_tenant_fk;
ALTER TABLE admission_applications DROP CONSTRAINT IF EXISTS admission_applications_offering_tenant_cycle_fk;
ALTER TABLE admission_applications DROP CONSTRAINT IF EXISTS admission_applications_intake_fk;
ALTER TABLE admission_applications ADD CONSTRAINT admission_applications_intake_fk FOREIGN KEY (intake_institution_id) REFERENCES institutions(id) ON DELETE RESTRICT;
ALTER TABLE admission_applications ADD CONSTRAINT admission_applications_applicant_tenant_fk FOREIGN KEY (applicant_id, intake_institution_id) REFERENCES admission_applicant_accounts(id, institution_id) ON DELETE RESTRICT;
ALTER TABLE admission_applications ADD CONSTRAINT admission_applications_offering_tenant_cycle_fk FOREIGN KEY (offering_id, intake_institution_id, cycle_id) REFERENCES admission_offerings(id, institution_id, cycle_id) ON DELETE RESTRICT;
ALTER TABLE admission_applications DROP CONSTRAINT IF EXISTS admission_applications_campus_tenant_fk;
ALTER TABLE admission_applications ADD CONSTRAINT admission_applications_campus_tenant_fk FOREIGN KEY (campus_id, institution_id) REFERENCES campuses(id, institution_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS admission_applications_intake_applicant_idx ON admission_applications(intake_institution_id, applicant_id, submitted_at);
DROP INDEX IF EXISTS admission_applications_student_cycle_uidx;
CREATE UNIQUE INDEX admission_applications_student_cycle_uidx ON admission_applications(intake_institution_id, cycle_id, lower(guardian_email), lower(student_name));

-- Keep legacy writers safe, and reject routing to another institution family.
CREATE OR REPLACE FUNCTION validate_admission_campus_intake() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.intake_institution_id := COALESCE(NEW.intake_institution_id, NEW.institution_id);
  NEW.campus_name := COALESCE(NEW.campus_name, (SELECT campus_name FROM institutions WHERE id = NEW.institution_id), 'Main');
  IF NEW.institution_id <> NEW.intake_institution_id AND NOT EXISTS (
    SELECT 1 FROM institutions WHERE id = NEW.institution_id AND parent_institution_id = NEW.intake_institution_id
  ) THEN RAISE EXCEPTION 'Admission campus must belong to the intake institution' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS admission_campus_intake_guard ON admission_applications;
CREATE TRIGGER admission_campus_intake_guard BEFORE INSERT OR UPDATE OF institution_id, intake_institution_id, campus_id ON admission_applications FOR EACH ROW EXECUTE FUNCTION validate_admission_campus_intake();
