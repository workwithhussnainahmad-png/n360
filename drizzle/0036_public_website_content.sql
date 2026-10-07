ALTER TABLE "institution_public_profiles"
  ADD COLUMN IF NOT EXISTS "hero_image_url" varchar(500),
  ADD COLUMN IF NOT EXISTS "announcement_text" varchar(240),
  ADD COLUMN IF NOT EXISTS "announcement_link" varchar(500),
  ADD COLUMN IF NOT EXISTS "about_title" varchar(120),
  ADD COLUMN IF NOT EXISTS "mission" text,
  ADD COLUMN IF NOT EXISTS "vision" text,
  ADD COLUMN IF NOT EXISTS "principal_name" varchar(120),
  ADD COLUMN IF NOT EXISTS "principal_title" varchar(120),
  ADD COLUMN IF NOT EXISTS "principal_message" text,
  ADD COLUMN IF NOT EXISTS "principal_image_url" varchar(500),
  ADD COLUMN IF NOT EXISTS "statistics" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "programs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "highlights" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "gallery_images" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "map_url" varchar(500),
  ADD COLUMN IF NOT EXISTS "facebook_url" varchar(500),
  ADD COLUMN IF NOT EXISTS "instagram_url" varchar(500),
  ADD COLUMN IF NOT EXISTS "youtube_url" varchar(500);

ALTER TABLE "institution_public_profiles"
  DROP CONSTRAINT IF EXISTS "institution_public_profiles_statistics_check",
  ADD CONSTRAINT "institution_public_profiles_statistics_check" CHECK (jsonb_typeof("statistics") = 'array' AND jsonb_array_length("statistics") <= 6),
  DROP CONSTRAINT IF EXISTS "institution_public_profiles_programs_check",
  ADD CONSTRAINT "institution_public_profiles_programs_check" CHECK (jsonb_typeof("programs") = 'array' AND jsonb_array_length("programs") <= 8),
  DROP CONSTRAINT IF EXISTS "institution_public_profiles_highlights_check",
  ADD CONSTRAINT "institution_public_profiles_highlights_check" CHECK (jsonb_typeof("highlights") = 'array' AND jsonb_array_length("highlights") <= 8),
  DROP CONSTRAINT IF EXISTS "institution_public_profiles_gallery_check",
  ADD CONSTRAINT "institution_public_profiles_gallery_check" CHECK (jsonb_typeof("gallery_images") = 'array' AND jsonb_array_length("gallery_images") <= 8);
