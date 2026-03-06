// ABOUTME: Drizzle schema for the saved_store table.
// ABOUTME: Stores FHIR store configurations linked to user emails.
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
