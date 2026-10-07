CREATE TABLE IF NOT EXISTS "expo_push_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"user_role" "user_role" NOT NULL,
	"user_id" integer NOT NULL,
	"notification_id" integer,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expo_push_tickets_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "emergency_contact" varchar(50);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "parental_whatsapp" varchar(50);--> statement-breakpoint
ALTER TABLE "expo_push_tickets" ADD CONSTRAINT "expo_push_tickets_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;
