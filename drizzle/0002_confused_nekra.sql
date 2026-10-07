CREATE TABLE "featured_institutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"logo_key" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"last_edited_at" timestamp DEFAULT now() NOT NULL,
	"last_edited_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "expo_push_token" varchar(255);--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "expo_push_token" varchar(255);