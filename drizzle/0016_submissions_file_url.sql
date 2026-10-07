-- Manual production migration: apply with psql; do not use drizzle-kit push.
ALTER TABLE "submissions" ADD COLUMN "file_url" text;
