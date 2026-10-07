ALTER TABLE "institutions"
  ADD COLUMN IF NOT EXISTS "public_slug" varchar(30),
  ADD COLUMN IF NOT EXISTS "public_site_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "admissions_enabled" boolean DEFAULT false NOT NULL;

ALTER TABLE "institutions"
  DROP CONSTRAINT IF EXISTS "institutions_public_slug_format_check",
  DROP CONSTRAINT IF EXISTS "institutions_public_slug_reserved_check",
  DROP CONSTRAINT IF EXISTS "institutions_public_site_requires_slug_check",
  DROP CONSTRAINT IF EXISTS "institutions_admissions_requires_public_site_check";

ALTER TABLE "institutions"
  ADD CONSTRAINT "institutions_public_slug_format_check"
  CHECK (
    "public_slug" IS NULL
    OR (
      char_length("public_slug") BETWEEN 2 AND 30
      AND "public_slug" = lower("public_slug")
      AND "public_slug" ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
      AND "public_slug" NOT LIKE '%--%'
    )
  ),
  ADD CONSTRAINT "institutions_public_slug_reserved_check"
  CHECK (
    "public_slug" IS NULL
    OR "public_slug" NOT IN (
      'admin', 'api', 'app', 'apply', 'assets', 'auth', 'blog', 'cdn',
      'docs', 'employee', 'help', 'institution', 'mail', 'portal', 'sa',
      'static', 'status', 'staff', 'student', 'superadmin', 'support', 'www'
    )
  );

ALTER TABLE "institutions"
  ADD CONSTRAINT "institutions_public_site_requires_slug_check"
  CHECK (NOT "public_site_enabled" OR "public_slug" IS NOT NULL),
  ADD CONSTRAINT "institutions_admissions_requires_public_site_check"
  CHECK (NOT "admissions_enabled" OR "public_site_enabled");

CREATE UNIQUE INDEX IF NOT EXISTS "institutions_public_slug_lower_unique"
  ON "institutions" (lower("public_slug"))
  WHERE "public_slug" IS NOT NULL;
