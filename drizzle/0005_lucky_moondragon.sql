CREATE TABLE "batch_exam_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_exam_subject_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"marks_obtained" real NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "student_batch_result_unique" UNIQUE("batch_exam_subject_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "batch_exam_subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_exam_id" integer NOT NULL,
	"subject_id" integer NOT NULL,
	"max_marks" real NOT NULL,
	"staff_id" integer,
	"is_published" boolean DEFAULT false NOT NULL,
	"review_deadline" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_exams" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"class_id" integer NOT NULL,
	"section_id" integer,
	"title" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "announcement_push_notifications_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "test_push_notifications_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "announcement_push_notifications_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_exam_results" ADD CONSTRAINT "batch_exam_results_batch_exam_subject_id_batch_exam_subjects_id_fk" FOREIGN KEY ("batch_exam_subject_id") REFERENCES "public"."batch_exam_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_exam_results" ADD CONSTRAINT "batch_exam_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_exam_subjects" ADD CONSTRAINT "batch_exam_subjects_batch_exam_id_batch_exams_id_fk" FOREIGN KEY ("batch_exam_id") REFERENCES "public"."batch_exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_exam_subjects" ADD CONSTRAINT "batch_exam_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_exam_subjects" ADD CONSTRAINT "batch_exam_subjects_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_exams" ADD CONSTRAINT "batch_exams_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_exams" ADD CONSTRAINT "batch_exams_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_exams" ADD CONSTRAINT "batch_exams_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;