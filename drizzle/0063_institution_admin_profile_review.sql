ALTER TABLE student_profile_change_requests ADD COLUMN IF NOT EXISTS reviewed_by_institution_admin integer REFERENCES institution_admins(id) ON DELETE SET NULL;
ALTER TABLE staff_profile_change_requests ADD COLUMN IF NOT EXISTS reviewed_by_institution_admin integer REFERENCES institution_admins(id) ON DELETE SET NULL;
