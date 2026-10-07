CREATE TYPE "public"."leave_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'LEAVE_REQUEST';--> statement-breakpoint
CREATE TABLE "account_deletions" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_name" varchar(255) NOT NULL,
	"admin_email" varchar(255) NOT NULL,
	"reason" text,
	"deleted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"image_url" varchar(500) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"user_role" "user_role" NOT NULL,
	"user_id" integer NOT NULL,
	"reason" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"parent_phone" varchar(50),
	"status" "leave_request_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_attendances" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"date" date NOT NULL,
	"status" "attendance_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_date_unique" UNIQUE("staff_id","date")
);
--> statement-breakpoint
ALTER TABLE "staff" ALTER COLUMN "announcement_push_notifications_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "test_push_notifications_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "announcement_push_notifications_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "reference_file_url" text;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "reference_file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "batch_exam_subjects" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "institutions" ADD COLUMN "accept_fee_vouchers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "super_admins" ADD COLUMN "is_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_vouchers" ADD CONSTRAINT "fee_vouchers_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendances" ADD CONSTRAINT "staff_attendances_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendances" ADD CONSTRAINT "staff_attendances_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fee_vouchers_student_created_idx" ON "fee_vouchers" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "leave_requests_inst_role_user_idx" ON "leave_requests" USING btree ("institution_id","user_role","user_id");--> statement-breakpoint
CREATE INDEX "staff_attendances_inst_date_idx" ON "staff_attendances" USING btree ("institution_id","date");--> statement-breakpoint
CREATE INDEX "announcement_reads_user_idx" ON "announcement_reads" USING btree ("user_role","user_id","announcement_id");--> statement-breakpoint
CREATE INDEX "announcements_institution_created_idx" ON "announcements" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX "attendances_institution_date_idx" ON "attendances" USING btree ("institution_id","date");--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "institutions_status_created_idx" ON "institutions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "marks_institution_student_created_idx" ON "marks" USING btree ("institution_id","student_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_institution_user_created_idx" ON "notifications" USING btree ("institution_id","user_role","user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_institution_user_unread_idx" ON "notifications" USING btree ("institution_id","user_role","user_id","is_read","created_at");--> statement-breakpoint
CREATE INDEX "online_test_submissions_institution_student_idx" ON "online_test_submissions" USING btree ("institution_id","student_id");--> statement-breakpoint
CREATE INDEX "online_test_submissions_institution_status_heartbeat_idx" ON "online_test_submissions" USING btree ("institution_id","status","last_heartbeat_at");--> statement-breakpoint
CREATE INDEX "staff_institution_id_idx" ON "staff" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "staff_lower_email_idx" ON "staff" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "students_institution_id_idx" ON "students" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "students_lower_login_roll_idx" ON "students" USING btree (lower("login_roll_number"));--> statement-breakpoint
CREATE INDEX "submissions_institution_student_idx" ON "submissions" USING btree ("institution_id","student_id");