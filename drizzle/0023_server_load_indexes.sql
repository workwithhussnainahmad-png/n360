-- Tenant list / hot-path indexes for concurrent capacity
CREATE INDEX IF NOT EXISTS subjects_institution_id_idx ON subjects (institution_id);
CREATE INDEX IF NOT EXISTS classes_institution_id_idx ON classes (institution_id);
CREATE INDEX IF NOT EXISTS sections_institution_id_idx ON sections (institution_id);
CREATE INDEX IF NOT EXISTS sections_institution_class_id_idx ON sections (institution_id, class_id);
CREATE INDEX IF NOT EXISTS staff_assignments_institution_staff_idx ON staff_assignments (institution_id, staff_id);
CREATE INDEX IF NOT EXISTS staff_assignments_institution_section_idx ON staff_assignments (institution_id, section_id);
CREATE INDEX IF NOT EXISTS assignments_institution_staff_created_idx ON assignments (institution_id, staff_id, created_at);
CREATE INDEX IF NOT EXISTS assignments_institution_section_idx ON assignments (institution_id, section_id);
CREATE INDEX IF NOT EXISTS tests_institution_id_idx ON tests (institution_id);
CREATE INDEX IF NOT EXISTS tests_institution_class_id_idx ON tests (institution_id, class_id);
CREATE INDEX IF NOT EXISTS tests_institution_section_id_idx ON tests (institution_id, section_id);
CREATE INDEX IF NOT EXISTS tests_institution_date_idx ON tests (institution_id, date);
CREATE INDEX IF NOT EXISTS marks_institution_test_id_idx ON marks (institution_id, test_id);
CREATE INDEX IF NOT EXISTS diaries_institution_class_date_idx ON diaries (institution_id, class_id, date);
