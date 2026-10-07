-- Custom Timetable: elective sub-groups within a section.
-- Existing staff_assignments rows keep group_id NULL (whole-section behavior unchanged).

CREATE TABLE IF NOT EXISTS "section_groups" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL,
  "section_id" integer NOT NULL,
  "name" varchar(100) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "section_groups"
    ADD CONSTRAINT "section_groups_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "section_groups"
    ADD CONSTRAINT "section_groups_section_id_sections_id_fk"
    FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "section_groups_institution_section_idx"
ON "section_groups" ("institution_id", "section_id");

ALTER TABLE "staff_assignments"
ADD COLUMN IF NOT EXISTS "group_id" integer;

DO $$ BEGIN
  ALTER TABLE "staff_assignments"
    ADD CONSTRAINT "staff_assignments_group_id_section_groups_id_fk"
    FOREIGN KEY ("group_id") REFERENCES "section_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Replace section uniqueness so parallel group periods can share a start time.
-- Prefer dropping the named unique CONSTRAINT first; also drop INDEX if it was
-- already converted in a prior environment.
ALTER TABLE "staff_assignments" DROP CONSTRAINT IF EXISTS "section_time_slot_unique";
DROP INDEX IF EXISTS "section_time_slot_unique";

CREATE UNIQUE INDEX "section_time_slot_unique"
ON "staff_assignments" (
  "institution_id",
  "section_id",
  COALESCE("group_id", 0),
  "day_of_week",
  "start_time"
);

-- staff_time_slot_unique is intentionally left unchanged.
