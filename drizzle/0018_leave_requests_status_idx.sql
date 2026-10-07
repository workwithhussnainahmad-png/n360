-- Institution/staff/student leave request lists filter by
-- (institution_id, user_role, status = 'PENDING') and sort by created_at desc.
-- The existing leave_requests_inst_role_user_idx (institution_id, user_role, user_id)
-- doesn't help this query pattern since user_id isn't part of the filter.
CREATE INDEX IF NOT EXISTS "leave_requests_inst_role_status_idx"
  ON "leave_requests" ("institution_id", "user_role", "status", "created_at");
