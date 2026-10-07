ALTER TABLE institution_public_profiles
  ADD COLUMN IF NOT EXISTS theme varchar(30) NOT NULL DEFAULT 'heritage';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_public_profiles_theme_check' AND conrelid = 'institution_public_profiles'::regclass) THEN
    ALTER TABLE institution_public_profiles ADD CONSTRAINT institution_public_profiles_theme_check
      CHECK (theme IN ('heritage', 'folio', 'grove', 'orbit', 'mosaic'));
  END IF;
END $$;
