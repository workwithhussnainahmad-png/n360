ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "announcement_push_notifications_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "test_push_notifications_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "announcement_push_notifications_enabled" boolean DEFAULT false NOT NULL;
