DO $$ BEGIN
  CREATE TYPE "public_event_status" AS ENUM ('DRAFT', 'PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public_event_duration" AS ENUM ('ONE_DAY', 'THREE_DAYS', 'ONE_WEEK', 'ONE_MONTH', 'FOREVER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "public_events" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
  "title" varchar(160) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "summary" varchar(500),
  "cover_image_url" varchar(500),
  "event_date" varchar(120),
  "venue" varchar(200),
  "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" "public_event_status" NOT NULL DEFAULT 'DRAFT',
  "visibility_duration" "public_event_duration" NOT NULL DEFAULT 'ONE_WEEK',
  "published_at" timestamptz,
  "expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "public_events_blocks_check" CHECK (jsonb_typeof("blocks") = 'array' AND jsonb_array_length("blocks") <= 40),
  CONSTRAINT "public_events_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "public_events_institution_slug_uidx" ON "public_events" ("institution_id", "slug");
CREATE INDEX IF NOT EXISTS "public_events_public_lookup_idx" ON "public_events" ("institution_id", "status", "published_at", "expires_at");
