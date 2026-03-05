// ABOUTME: Drizzle Kit configuration for database migrations.
// ABOUTME: Points to server/schema.ts for schema definitions.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
