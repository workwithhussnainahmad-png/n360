ALTER TABLE "student_promotions" ADD COLUMN IF NOT EXISTS "from_roll_number" varchar(100);
ALTER TABLE "student_promotions" ADD COLUMN IF NOT EXISTS "to_roll_number" varchar(100);
