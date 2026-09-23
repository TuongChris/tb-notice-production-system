// Guarded entry point for Prisma CLI commands (P0-C). Loads the root .env explicitly, validates
// database targets against the local allowlist, then runs Prisma with the active API config.
//
//   node scripts/db/prisma-guarded.mjs format|validate|generate
//   node scripts/db/prisma-guarded.mjs migrate-create <migration_name>
//
// migrate-create runs `prisma migrate dev --create-only`: it drafts a migration file using the
// separate shadow schema and does NOT apply the migration to tb_notice_dev.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget, describeTarget } from './allowlist.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiDir = path.join(repoRoot, 'apps/api');
const prismaBin = path.join(repoRoot, 'node_modules/.bin/prisma');
const envFile = path.join(repoRoot, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const [command, ...rest] = process.argv.slice(2);

function runPrisma(args) {
  const result = spawnSync(prismaBin, [...args, '--config', 'prisma.config.ts'], {
    cwd: apiDir,
    stdio: 'inherit',
    // CHECKPOINT_DISABLE: no Prisma usage telemetry; update notices are not version guidance here.
    env: { ...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function requireMigrationTargets() {
  const migration = assertLocalTarget(
    'MIGRATION_DATABASE_URL',
    process.env.MIGRATION_DATABASE_URL,
    {
      expectedSchema: 'tb_notice_dev',
      forbidUser: 'tb_dev',
    },
  );
  const shadow = assertLocalTarget('SHADOW_DATABASE_URL', process.env.SHADOW_DATABASE_URL, {
    expectedSchema: 'tb_notice_shadow',
    forbidUser: 'tb_dev',
  });
  if (process.env.MIGRATION_DATABASE_URL === process.env.SHADOW_DATABASE_URL) {
    throw new Error('SHADOW_DATABASE_URL must differ from MIGRATION_DATABASE_URL.');
  }
  console.log(`[guard] migration target: ${describeTarget(migration)}`);
  console.log(`[guard] shadow target:    ${describeTarget(shadow)}`);
}

try {
  switch (command) {
    case 'format':
      runPrisma(['format']);
      break;
    case 'validate':
      runPrisma(['validate']);
      break;
    case 'generate':
      runPrisma(['generate']);
      break;
    case 'migrate-create': {
      const name = rest[0];
      if (!name || !/^[a-z0-9_]{1,60}$/.test(name)) {
        throw new Error('migrate-create requires a lowercase snake_case migration name.');
      }
      requireMigrationTargets();
      runPrisma(['migrate', 'dev', '--create-only', '--name', name]);
      break;
    }
    default:
      throw new Error(`Unknown or unsupported command: ${command ?? '(none)'}`);
  }
} catch (error) {
  console.error(`[guard] refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
