CREATE INDEX IF NOT EXISTS "students_institution_id_idx" ON "students" ("institution_id");
CREATE INDEX IF NOT EXISTS "institutions_status_created_idx" ON "institutions" ("status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "staff_institution_id_idx" ON "staff" ("institution_id");
CREATE INDEX IF NOT EXISTS "submissions_institution_student_idx" ON "submissions" ("institution_id", "student_id");
CREATE INDEX IF NOT EXISTS "marks_institution_student_created_idx" ON "marks" ("institution_id", "student_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "attendances_institution_date_idx" ON "attendances" ("institution_id", "date");
CREATE INDEX IF NOT EXISTS "announcements_institution_created_idx" ON "announcements" ("institution_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "announcement_reads_user_idx" ON "announcement_reads" ("user_role", "user_id", "announcement_id");
