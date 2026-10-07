CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."ticket_history_action" AS ENUM('CREATED', 'STATUS_CHANGED', 'FORWARDED', 'PLATFORM_STATUS_CHANGED', 'COMMENT_ADDED');--> statement-breakpoint
CREATE TYPE "public"."ticket_platform_status" AS ENUM('RECEIVED', 'WORKING', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('OPEN', 'WORKING', 'RESOLVED', 'FORWARDED');--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'INSTITUTION_ADMIN' BEFORE 'STAFF';--> statement-breakpoint
CREATE TABLE "institution_admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "institution_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "institution_owners" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"gender" "gender" NOT NULL,
	"email" varchar(255) NOT NULL,
	"contact_number" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "institution_owners_institution_id_unique" UNIQUE("institution_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"actor_role" "user_role" NOT NULL,
	"actor_id" integer NOT NULL,
	"action" "ticket_history_action" NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"institution_id" integer NOT NULL,
	"creator_role" "user_role" NOT NULL,
	"creator_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" DEFAULT 'OPEN' NOT NULL,
	"platform_status" "ticket_platform_status",
	"is_forwarded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "institution_admins" ADD CONSTRAINT "institution_admins_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_owners" ADD CONSTRAINT "institution_owners_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_history" ADD CONSTRAINT "ticket_history_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;