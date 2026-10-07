CREATE INDEX IF NOT EXISTS "online_test_submissions_institution_student_idx"
  ON "online_test_submissions" ("institution_id", "student_id");

CREATE INDEX IF NOT EXISTS "online_test_submissions_institution_status_heartbeat_idx"
  ON "online_test_submissions" ("institution_id", "status", "last_heartbeat_at");

CREATE INDEX IF NOT EXISTS "notifications_institution_user_created_idx"
  ON "notifications" ("institution_id", "user_role", "user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notifications_institution_user_unread_idx"
  ON "notifications" ("institution_id", "user_role", "user_id", "is_read", "created_at" DESC);
