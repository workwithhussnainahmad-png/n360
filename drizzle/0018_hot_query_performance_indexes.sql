-- Performance indexes for hot list/filter patterns (non-destructive, IF NOT EXISTS).
-- Applied safely against live Postgres; do not recreate existing indexes from 0006/0009/0015/0016.

CREATE INDEX CONCURRENTLY IF NOT EXISTS leave_requests_inst_role_status_idx
  ON leave_requests (institution_id, user_role, status, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS campuses_institution_id_idx
  ON campuses (institution_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS academic_sessions_institution_current_idx
  ON academic_sessions (institution_id, is_current);

CREATE INDEX CONCURRENTLY IF NOT EXISTS staff_teachable_subjects_inst_staff_idx
  ON staff_teachable_subjects (institution_id, staff_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS student_profile_requests_inst_status_idx
  ON student_profile_change_requests (institution_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS student_profile_requests_student_idx
  ON student_profile_change_requests (student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS staff_profile_requests_inst_status_idx
  ON staff_profile_change_requests (institution_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS staff_profile_requests_staff_idx
  ON staff_profile_change_requests (staff_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS attendances_institution_section_date_idx
  ON attendances (institution_id, section_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS online_test_questions_online_test_id_idx
  ON online_test_questions (online_test_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS refresh_tokens_user_idx
  ON refresh_tokens (user_role, user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS fee_vouchers_institution_created_idx
  ON fee_vouchers (institution_id, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS batch_exams_institution_class_idx
  ON batch_exams (institution_id, class_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS batch_exam_subjects_batch_exam_id_idx
  ON batch_exam_subjects (batch_exam_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS batch_exam_subjects_staff_id_idx
  ON batch_exam_subjects (staff_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS batch_exam_results_student_id_idx
  ON batch_exam_results (student_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS tickets_institution_status_created_idx
  ON tickets (institution_id, status, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS tickets_forwarded_created_idx
  ON tickets (is_forwarded, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ticket_history_ticket_id_idx
  ON ticket_history (ticket_id);
