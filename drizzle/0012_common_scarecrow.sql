CREATE TYPE "public"."blog_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "meta_title" varchar(255);--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "meta_description" text;--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "excerpt" text;--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "status" "blog_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "published_at" timestamp;