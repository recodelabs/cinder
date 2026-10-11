// ABOUTME: Drizzle schema for saved_store, org_credential, project, and fhir_server_credential tables.
// ABOUTME: Stores FHIR store configs, encrypted org credentials, project definitions, and FHIR server client credentials.
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
  // 'gcp' targets Google Cloud Healthcare API via the gcp* coordinates;
  // 'fhir' targets any FHIR R4 server (e.g. HAPI) at fhirBaseUrl, optionally with
  // client credentials from fhir_server_credential.
  serverType: text('server_type', { enum: ['gcp', 'fhir'] }).notNull().default('gcp'),
  fhirBaseUrl: text('fhir_base_url'),
  gcpProject: text('gcp_project'),
  gcpLocation: text('gcp_location'),
  gcpDataset: text('gcp_dataset'),
  gcpFhirStore: text('gcp_fhir_store'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  unique('project_organization_id_slug_unique').on(table.organizationId, table.slug),
]);

// OAuth client credentials for a 'fhir' project whose server needs a Bearer token
// (e.g. FHIR Info Gateway). The secret is envelope-encrypted like org_credential.
export const fhirServerCredential = pgTable('fhir_server_credential', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().unique().references(() => project.id, { onDelete: 'cascade' }),
  tokenUrl: text('token_url').notNull(),
  clientId: text('client_id').notNull(),
  encryptedClientSecret: text('encrypted_client_secret').notNull(),
  encryptedDek: text('encrypted_dek').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  dekIv: text('dek_iv').notNull(),
  dekAuthTag: text('dek_auth_tag').notNull(),
  keyVersion: integer('key_version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
