ALTER TABLE "diaries"
  ALTER COLUMN "subject_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "diaries"
  DROP CONSTRAINT IF EXISTS "class_subject_date_unique";
--> statement-breakpoint
ALTER TABLE "diaries"
  DROP CONSTRAINT IF EXISTS "diaries_class_id_subject_id_date_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "diaries_class_subject_date_not_null_uidx"
  ON "diaries" ("class_id", "subject_id", "date")
  WHERE "subject_id" IS NOT NULL;
