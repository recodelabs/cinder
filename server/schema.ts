// ABOUTME: Drizzle schema for saved_store, org_credential, and project tables.
// ABOUTME: Stores FHIR store configs, encrypted org credentials, and project definitions.
import { integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

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
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().unique(),
  encryptedServiceAccount: text('encrypted_service_account').notNull(),
  encryptedDek: text('encrypted_dek').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  dekIv: text('dek_iv').notNull(),
  dekAuthTag: text('dek_auth_tag').notNull(),
  keyVersion: integer('key_version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const project = pgTable('project', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  organizationId: text('organization_id').notNull(),
  gcpProject: text('gcp_project').notNull(),
  gcpLocation: text('gcp_location').notNull(),
  gcpDataset: text('gcp_dataset').notNull(),
  gcpFhirStore: text('gcp_fhir_store').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique('project_organization_id_slug_unique').on(table.organizationId, table.slug),
]);
