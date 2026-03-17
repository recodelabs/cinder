CREATE TABLE "org_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"encrypted_service_account" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"dek_iv" text NOT NULL,
	"dek_auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_credential_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"organization_id" text NOT NULL,
	"gcp_project" text NOT NULL,
	"gcp_location" text NOT NULL,
	"gcp_dataset" text NOT NULL,
	"gcp_fhir_store" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_organization_id_slug_unique" UNIQUE("organization_id","slug")
);
