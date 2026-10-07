ALTER TABLE "system_settings"
ADD COLUMN IF NOT EXISTS "public_site_base_domain" varchar(253) NOT NULL DEFAULT 'nisaab360.app';
