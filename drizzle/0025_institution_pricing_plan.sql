ALTER TABLE "institutions"
ADD COLUMN IF NOT EXISTS "pricing_plan" varchar(20);
