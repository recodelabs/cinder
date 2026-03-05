CREATE TABLE "saved_store" (
	"id" text PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"name" text NOT NULL,
	"gcp_project" text NOT NULL,
	"gcp_location" text NOT NULL,
	"gcp_dataset" text NOT NULL,
	"gcp_fhir_store" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saved_store_user_email_name_unique" UNIQUE("user_email","name")
);
