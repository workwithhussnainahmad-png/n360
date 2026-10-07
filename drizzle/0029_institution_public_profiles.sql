CREATE TABLE IF NOT EXISTS "institution_public_profiles" (
  "institution_id" integer PRIMARY KEY NOT NULL,
  "tagline" varchar(160),
  "description" text,
  "public_email" varchar(255),
  "public_phone" varchar(50),
  "public_address" varchar(300),
  "accent_color" varchar(7) DEFAULT '#233c32' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "institution_public_profiles_institution_id_institutions_id_fk"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE
);

ALTER TABLE "institution_public_profiles"
  DROP CONSTRAINT IF EXISTS "institution_public_profiles_description_length_check",
  DROP CONSTRAINT IF EXISTS "institution_public_profiles_accent_color_check";

ALTER TABLE "institution_public_profiles"
  ADD CONSTRAINT "institution_public_profiles_description_length_check"
    CHECK ("description" IS NULL OR char_length("description") <= 2000),
  ADD CONSTRAINT "institution_public_profiles_accent_color_check"
    CHECK ("accent_color" IN ('#233c32', '#1d4ed8', '#7c2d12', '#5b21b6', '#0f766e'));
