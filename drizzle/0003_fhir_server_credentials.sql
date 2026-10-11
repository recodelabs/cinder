CREATE TABLE "fhir_server_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"token_url" text NOT NULL,
	"client_id" text NOT NULL,
	"encrypted_client_secret" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"dek_iv" text NOT NULL,
	"dek_auth_tag" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fhir_server_credential_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "fhir_server_credential" ADD CONSTRAINT "fhir_server_credential_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;