DO $$ BEGIN
  CREATE TYPE "admission_cycle_status" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "admission_application_status" AS ENUM (
    'SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUIRED', 'TEST_SCHEDULED',
    'INTERVIEW_SCHEDULED', 'DECISION_PENDING', 'OFFERED', 'REJECTED',
    'FEE_PENDING', 'FEE_VERIFICATION', 'ENROLLED', 'WITHDRAWN'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "admission_cycles" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "academic_year" varchar(20) NOT NULL,
  "opens_on" date,
  "closes_on" date,
  "instructions" text,
  "requires_test" boolean DEFAULT false NOT NULL,
  "requires_interview" boolean DEFAULT false NOT NULL,
  "status" "admission_cycle_status" DEFAULT 'DRAFT' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admission_cycles_institution_name_unique" UNIQUE ("institution_id", "name"),
  CONSTRAINT "admission_cycles_id_institution_unique" UNIQUE ("id", "institution_id"),
  CONSTRAINT "admission_cycles_date_order_check" CHECK ("opens_on" IS NULL OR "closes_on" IS NULL OR "opens_on" <= "closes_on"),
  CONSTRAINT "admission_cycles_instructions_length_check" CHECK ("instructions" IS NULL OR char_length("instructions") <= 3000)
);

CREATE TABLE IF NOT EXISTS "admission_offerings" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "cycle_id" integer NOT NULL,
  "title" varchar(120) NOT NULL,
  "description" varchar(500),
  "capacity" integer,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admission_offerings_cycle_title_unique" UNIQUE ("cycle_id", "title"),
  CONSTRAINT "admission_offerings_id_inst_cycle_unique" UNIQUE ("id", "institution_id", "cycle_id"),
  CONSTRAINT "admission_offerings_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0),
  CONSTRAINT "admission_offerings_cycle_tenant_fk" FOREIGN KEY ("cycle_id", "institution_id") REFERENCES "admission_cycles"("id", "institution_id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "admission_applications" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "cycle_id" integer NOT NULL,
  "offering_id" integer NOT NULL,
  "application_number" varchar(32) NOT NULL UNIQUE,
  "student_name" varchar(255) NOT NULL,
  "date_of_birth" date NOT NULL,
  "gender" "gender" NOT NULL,
  "guardian_name" varchar(255) NOT NULL,
  "guardian_email" varchar(255) NOT NULL,
  "guardian_phone" varchar(50) NOT NULL,
  "previous_institution" varchar(255),
  "notes" text,
  "status" "admission_application_status" DEFAULT 'SUBMITTED' NOT NULL,
  "submitted_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admission_applications_notes_length_check" CHECK ("notes" IS NULL OR char_length("notes") <= 2000),
  CONSTRAINT "admission_applications_offering_tenant_cycle_fk" FOREIGN KEY ("offering_id", "institution_id", "cycle_id") REFERENCES "admission_offerings"("id", "institution_id", "cycle_id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "admission_cycles_institution_status_idx" ON "admission_cycles" ("institution_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "admission_cycles_one_open_per_institution_uidx" ON "admission_cycles" ("institution_id") WHERE "status" = 'OPEN';
CREATE INDEX IF NOT EXISTS "admission_offerings_institution_cycle_idx" ON "admission_offerings" ("institution_id", "cycle_id");
CREATE INDEX IF NOT EXISTS "admission_applications_inst_status_submitted_idx" ON "admission_applications" ("institution_id", "status", "submitted_at");
CREATE INDEX IF NOT EXISTS "admission_applications_inst_email_idx" ON "admission_applications" ("institution_id", "guardian_email");
CREATE UNIQUE INDEX IF NOT EXISTS "admission_applications_student_cycle_uidx" ON "admission_applications" ("institution_id", "cycle_id", lower("guardian_email"), lower("student_name"));
