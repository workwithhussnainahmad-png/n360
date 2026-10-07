-- Keep high-volume admission queues and their common searches index-backed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "admission_applications_inst_cycle_submitted_idx"
  ON "admission_applications" ("institution_id", "cycle_id", "submitted_at" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "admission_applications_inst_student_search_idx"
  ON "admission_applications" ("institution_id", lower("student_name") text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "admission_applications_inst_guardian_search_idx"
  ON "admission_applications" ("institution_id", lower("guardian_name") text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "admission_applications_inst_phone_search_idx"
  ON "admission_applications" ("institution_id", lower("guardian_phone") text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "admission_applications_inst_email_search_idx"
  ON "admission_applications" ("institution_id", lower("guardian_email") text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "admission_applications_inst_number_search_idx"
  ON "admission_applications" ("institution_id", lower("application_number") text_pattern_ops);
