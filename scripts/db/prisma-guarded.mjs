// Guarded entry point for Prisma CLI commands (P0-C). Loads the root .env explicitly, validates
// database targets against the local allowlist, then runs Prisma with the active API config.
//
//   node scripts/db/prisma-guarded.mjs format|validate|generate
//   node scripts/db/prisma-guarded.mjs migrate-create <migration_name>
//   node scripts/db/prisma-guarded.mjs status <test|replay|dev>
//   node scripts/db/prisma-guarded.mjs deploy <test|replay|dev>
//   node scripts/db/prisma-guarded.mjs diff-migrations-to-schema
//   node scripts/db/prisma-guarded.mjs diff-datasource-to-schema <test|replay|dev>
//   node scripts/db/prisma-guarded.mjs drift-probe
//   node scripts/db/prisma-guarded.mjs introspect-print <test|replay|dev>
//
// migrate-create / drift-probe run `prisma migrate dev --create-only`: they draft a migration file
// using the separate shadow schema and do NOT apply anything to tb_notice_dev. `deploy` applies
// only already-committed migrations (`prisma migrate deploy`). The diff commands are read-only on
// the target (the migrations diff replays history into the disposable shadow schema).
// `introspect-print` is `prisma db pull --print` (stdout only; the schema file is not written).
// There is intentionally no reset, db push or db execute command.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadRootEnv, repoRoot, resolveTarget } from './lib/targets.mjs';

const apiDir = path.join(repoRoot, 'apps/api');
const prismaBin = path.join(repoRoot, 'node_modules/.bin/prisma');
const APPLY_TARGETS = ['test', 'replay', 'dev'];

loadRootEnv();

const [command, ...rest] = process.argv.slice(2);

function runPrisma(args, migrationUrl) {
  const env = { ...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' };
  // CHECKPOINT_DISABLE: no Prisma usage telemetry; update notices are not version guidance here.
  if (migrationUrl) {
    // prisma.config.ts reads MIGRATION_DATABASE_URL; process.loadEnvFile does not override it.
    env.MIGRATION_DATABASE_URL = migrationUrl;
  }
  const result = spawnSync(prismaBin, [...args, '--config', 'prisma.config.ts'], {
    cwd: apiDir,
    stdio: 'inherit',
    env,
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function requireDevAndShadow() {
  const dev = resolveTarget('dev', ['dev']);
  const shadow = resolveTarget('shadow', ['shadow']);
  if (dev.rawUrl === shadow.rawUrl) {
    throw new Error('SHADOW_DATABASE_URL must differ from MIGRATION_DATABASE_URL.');
  }
  console.log(`[guard] migration target: ${dev.label}`);
  console.log(`[guard] shadow target:    ${shadow.label}`);
  return dev;
}

function requireApplyTarget(name) {
  const resolved = resolveTarget(name, APPLY_TARGETS);
  // The shadow URL stays configured but must never equal the target.
  const shadow = resolveTarget('shadow', ['shadow']);
  if (resolved.rawUrl === shadow.rawUrl) throw new Error('target must differ from the shadow URL.');
  console.log(`[guard] ${command} target: ${resolved.label}`);
  return resolved;
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
      requireDevAndShadow();
      runPrisma(['migrate', 'dev', '--create-only', '--name', name]);
      break;
    }
    case 'status':
      runPrisma(['migrate', 'status'], requireApplyTarget(rest[0]).rawUrl);
      break;
    case 'deploy':
      runPrisma(['migrate', 'deploy'], requireApplyTarget(rest[0]).rawUrl);
      break;
    case 'diff-migrations-to-schema': {
      requireDevAndShadow();
      runPrisma([
        'migrate',
        'diff',
        '--from-migrations',
        'prisma/migrations',
        '--to-schema',
        'prisma/schema.prisma',
        '--script',
        '--exit-code',
      ]);
      break;
    }
    case 'diff-datasource-to-schema':
      runPrisma(
        [
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          'prisma/schema.prisma',
          '--script',
          '--exit-code',
        ],
        requireApplyTarget(rest[0]).rawUrl,
      );
      break;
    case 'drift-probe':
      requireDevAndShadow();
      runPrisma(['migrate', 'dev', '--create-only', '--name', 'drift_probe']);
      break;
    case 'introspect-print':
      runPrisma(['db', 'pull', '--print'], requireApplyTarget(rest[0]).rawUrl);
      break;
    default:
      throw new Error(`Unknown or unsupported command: ${command ?? '(none)'}`);
  }
} catch (error) {
  console.error(`[guard] refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
