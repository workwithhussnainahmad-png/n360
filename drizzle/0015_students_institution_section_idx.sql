-- Manual production migration: CREATE INDEX CONCURRENTLY must run outside a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "students_institution_section_id_idx"
  ON "students" ("institution_id", "section_id");
