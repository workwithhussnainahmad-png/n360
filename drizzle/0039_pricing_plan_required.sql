-- Registration now requires a pricing plan. Preserve legacy institutions by
-- assigning the entry plan before enforcing the database-level requirement.
UPDATE "institutions"
SET "pricing_plan" = 'BASIC'
WHERE "pricing_plan" IS NULL;

ALTER TABLE "institutions"
ALTER COLUMN "pricing_plan" SET NOT NULL;
