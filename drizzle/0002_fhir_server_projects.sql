ALTER TABLE "project" ALTER COLUMN "gcp_project" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "gcp_location" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "gcp_dataset" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "gcp_fhir_store" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "server_type" text DEFAULT 'gcp' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "fhir_base_url" text;