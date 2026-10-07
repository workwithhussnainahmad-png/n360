-- Performance indexes for student dashboard hot path

CREATE INDEX IF NOT EXISTS "assignments_institution_class_due_idx"
  ON "assignments" ("institution_id", "class_id", "due_at");

CREATE INDEX IF NOT EXISTS "staff_assignments_institution_section_day_idx"
  ON "staff_assignments" ("institution_id", "section_id", "day_of_week");

CREATE INDEX IF NOT EXISTS "tests_institution_class_role_idx"
  ON "tests" ("institution_id", "class_id", "created_by_role");

CREATE INDEX IF NOT EXISTS "batch_exam_results_student_id_idx"
  ON "batch_exam_results" ("student_id");

CREATE INDEX IF NOT EXISTS "submissions_assignment_student_inst_idx"
  ON "submissions" ("assignment_id", "student_id", "institution_id");
