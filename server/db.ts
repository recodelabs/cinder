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
  // Better Auth tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "email" text NOT NULL UNIQUE,
      "email_verified" boolean NOT NULL DEFAULT false,
      "image" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "id" text PRIMARY KEY NOT NULL,
      "expires_at" timestamp NOT NULL,
      "token" text NOT NULL UNIQUE,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL,
      "ip_address" text,
      "user_agent" text,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "active_organization_id" text
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "account" (
      "id" text PRIMARY KEY NOT NULL,
      "account_id" text NOT NULL,
      "provider_id" text NOT NULL,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "access_token" text,
      "refresh_token" text,
      "id_token" text,
      "access_token_expires_at" timestamp,
      "refresh_token_expires_at" timestamp,
      "scope" text,
      "password" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "verification" (
      "id" text PRIMARY KEY NOT NULL,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "organization" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "slug" text NOT NULL UNIQUE,
      "logo" text,
      "created_at" timestamp NOT NULL,
      "metadata" text
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "member" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "role" text NOT NULL DEFAULT 'member',
      "created_at" timestamp NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "invitation" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
      "email" text NOT NULL,
      "role" text,
      "status" text NOT NULL DEFAULT 'pending',
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "inviter_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
    );
  `);

  // App tables
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
