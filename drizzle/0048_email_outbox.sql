CREATE TABLE IF NOT EXISTS "email_outbox" (
  "id" serial PRIMARY KEY,
  "institution_id" integer REFERENCES "institutions"("id") ON DELETE SET NULL,
  "recipient" varchar(255) NOT NULL,
  "subject" varchar(255) NOT NULL,
  "html" text NOT NULL,
  "dedupe_key" varchar(255) UNIQUE,
  "status" varchar(16) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  "attempt_count" integer NOT NULL DEFAULT 0 CHECK ("attempt_count" >= 0),
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "locked_at" timestamptz,
  "sent_at" timestamptz,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "email_outbox_pending_idx" ON "email_outbox" ("status", "next_attempt_at", "id");
CREATE INDEX IF NOT EXISTS "email_outbox_institution_created_idx" ON "email_outbox" ("institution_id", "created_at");
