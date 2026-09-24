// Active Prisma CLI configuration (P0-C1). Working copy of the frozen reference
// `prisma.config.ts`, with technical configuration refinements only (AR-014, TECHNOLOGY_ARCHITECTURE §7-8):
// - the single root `.env` is loaded from a path resolved relative to this file, not the current
//   working directory (the frozen `import "dotenv/config"` is replaced by Node's process.loadEnvFile);
// - CLI connections use the scoped migration account (MIGRATION_DATABASE_URL) and a separate shadow
//   schema (SHADOW_DATABASE_URL); the runtime app uses DATABASE_URL through the driver adapter.
// Commands that need a database must be run through scripts/db/prisma-guarded.mjs, which enforces
// the local schema allowlist before invoking Prisma.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = path.join(repoRoot, '.env');
if (existsSync(envFile)) {
  // Does not override variables already present in the environment.
  process.loadEnvFile(envFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env['MIGRATION_DATABASE_URL'],
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
