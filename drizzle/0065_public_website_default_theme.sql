-- Preserve existing selections; new public profiles use the platform design.
DO $$ BEGIN
  ALTER TABLE institution_public_profiles ALTER COLUMN theme SET DEFAULT 'default';
  ALTER TABLE institution_public_profiles DROP CONSTRAINT IF EXISTS institution_public_profiles_theme_check;
  ALTER TABLE institution_public_profiles ADD CONSTRAINT institution_public_profiles_theme_check
    CHECK (theme IN ('default', 'heritage', 'folio', 'grove', 'orbit', 'mosaic'));
END $$;
