ALTER TABLE "system_settings"
ADD COLUMN IF NOT EXISTS "software_version" varchar(50) NOT NULL DEFAULT '1.0.0';
