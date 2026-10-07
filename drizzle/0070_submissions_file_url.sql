-- Forward repair for the unregistered manual 0016_submissions_file_url migration.
-- Keep historical migrations unchanged; installations with the column also replay safely.
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "file_url" text;
