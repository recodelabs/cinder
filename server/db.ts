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
}
