DO $$ BEGIN
  CREATE TYPE "admission_document_status" AS ENUM ('REQUESTED', 'SUBMITTED', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "admission_appointment_type" AS ENUM ('TEST', 'INTERVIEW');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "admission_appointment_outcome" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'ABSENT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admission_applications_id_inst_unique') THEN
    ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_id_inst_unique" UNIQUE ("id", "institution_id");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "admission_document_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "application_id" integer NOT NULL,
  "document_name" varchar(160) NOT NULL,
  "instructions" varchar(500),
  "status" "admission_document_status" DEFAULT 'REQUESTED' NOT NULL,
  "submitted_file_key" varchar(500),
  "reviewer_note" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admission_document_requests_app_name_unique" UNIQUE ("application_id", "document_name"),
  CONSTRAINT "admission_document_requests_application_tenant_fk" FOREIGN KEY ("application_id", "institution_id") REFERENCES "admission_applications"("id", "institution_id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "admission_appointments" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "application_id" integer NOT NULL,
  "type" "admission_appointment_type" NOT NULL,
  "scheduled_at" timestamp NOT NULL,
  "location" varchar(300) NOT NULL,
  "instructions" varchar(1000),
  "outcome" "admission_appointment_outcome" DEFAULT 'PENDING' NOT NULL,
  "outcome_note" varchar(1000),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admission_appointments_application_type_unique" UNIQUE ("application_id", "type"),
  CONSTRAINT "admission_appointments_application_tenant_fk" FOREIGN KEY ("application_id", "institution_id") REFERENCES "admission_applications"("id", "institution_id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "admission_application_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "application_id" integer NOT NULL,
  "title" varchar(160) NOT NULL,
  "description" varchar(1000),
  "from_status" "admission_application_status",
  "to_status" "admission_application_status",
  "visible_to_applicant" boolean DEFAULT true NOT NULL,
  "actor_id" integer NOT NULL,
  "actor_role" "user_role" NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admission_application_events_application_tenant_fk" FOREIGN KEY ("application_id", "institution_id") REFERENCES "admission_applications"("id", "institution_id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "admission_document_requests_app_status_idx" ON "admission_document_requests" ("application_id", "status");
CREATE INDEX IF NOT EXISTS "admission_appointments_inst_schedule_idx" ON "admission_appointments" ("institution_id", "scheduled_at");
CREATE INDEX IF NOT EXISTS "admission_application_events_app_created_idx" ON "admission_application_events" ("application_id", "created_at");
