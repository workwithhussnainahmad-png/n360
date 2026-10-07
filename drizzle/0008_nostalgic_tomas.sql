CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"mobile_app_version" varchar(50) DEFAULT '1.0.0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
