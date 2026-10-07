ALTER TABLE "institution_public_profiles"
ADD COLUMN IF NOT EXISTS "website_notices" jsonb;
