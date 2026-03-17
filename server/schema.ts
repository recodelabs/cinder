// ABOUTME: Drizzle schema for the saved_store and org_credential tables.
// ABOUTME: Stores FHIR store configurations and encrypted GCP service account credentials.
import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const savedStore = pgTable('saved_store', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userEmail: text('user_email').notNull(),
  name: text('name').notNull(),
  gcpProject: text('gcp_project').notNull(),
  gcpLocation: text('gcp_location').notNull(),
  gcpDataset: text('gcp_dataset').notNull(),
  gcpFhirStore: text('gcp_fhir_store').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique('saved_store_user_email_name_unique').on(table.userEmail, table.name),
]);

export const orgCredential = pgTable('org_credential', {
  orgId: text('org_id').primaryKey(),
  iv: text('iv').notNull(),
  ciphertext: text('ciphertext').notNull(),
  tag: text('tag').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
