ALTER TABLE "diaries" ADD COLUMN "subject_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "diaries" ADD COLUMN "date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "class_subject_date_unique" UNIQUE("class_id","subject_id","date");