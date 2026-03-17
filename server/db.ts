// ABOUTME: Postgres connection and Drizzle ORM instance.
// ABOUTME: Reads DATABASE_URL from environment, ensures tables exist on startup, exports db for use in API routes.
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
// Schema-less instance for Better Auth — it manages its own tables
export const authDb = drizzle(client);

export async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "saved_store" (
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
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "org_credential" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL UNIQUE,
      "encrypted_service_account" text NOT NULL,
      "encrypted_dek" text NOT NULL,
      "iv" text NOT NULL,
      "auth_tag" text NOT NULL,
      "dek_iv" text NOT NULL,
      "dek_auth_tag" text NOT NULL,
      "key_version" integer NOT NULL DEFAULT 1,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "project" (
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
  `);
}

export async function ensureForeignKeys() {
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_credential_org_fk') THEN
        ALTER TABLE "org_credential" ADD CONSTRAINT "org_credential_org_fk"
          FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_org_fk') THEN
        ALTER TABLE "project" ADD CONSTRAINT "project_org_fk"
          FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `);
}
