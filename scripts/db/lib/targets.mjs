// Named local database targets for P0 tooling (decision D3). Every helper resolves its target
// here: the URL must pass the loopback/port/schema allowlist, name exactly the schema that belongs
// to the target, and use the tb_migrate tooling account (never root, never the tb_dev runtime user).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLocalTarget, describeTarget } from '../allowlist.mjs';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const TOOLING_USER = 'tb_migrate';

export const TARGETS = Object.freeze({
  dev: Object.freeze({ variable: 'MIGRATION_DATABASE_URL', schema: 'tb_notice_dev' }),
  test: Object.freeze({ variable: 'TEST_DATABASE_URL', schema: 'tb_notice_test' }),
  replay: Object.freeze({ variable: 'REPLAY_DATABASE_URL', schema: 'tb_notice_replay' }),
  shadow: Object.freeze({ variable: 'SHADOW_DATABASE_URL', schema: 'tb_notice_shadow' }),
});

/** Loads the single root .env (does not override variables already set). */
export function loadRootEnv() {
  const envFile = path.join(repoRoot, '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

/**
 * Resolves a named target. `allowed` restricts which names a command accepts.
 * Returns the raw URL (for child processes) and a password-free description.
 */
export function resolveTarget(name, allowed) {
  if (!allowed.includes(name)) {
    throw new Error(`target must be one of: ${allowed.join(', ')} (got ${name ?? '(none)'})`);
  }
  const spec = TARGETS[name];
  const rawUrl = process.env[spec.variable];
  const target = assertLocalTarget(spec.variable, rawUrl, {
    expectedSchema: spec.schema,
    requireUser: TOOLING_USER,
  });
  return {
    name,
    variable: spec.variable,
    schema: spec.schema,
    rawUrl,
    target,
    label: describeTarget(target),
  };
}

/** mariadb driver options for a resolved target (UTC session, binary session collation). */
export function driverConfig(resolved) {
  const url = new URL(resolved.rawUrl);
  return {
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: resolved.schema,
    timezone: '+00:00',
    allowPublicKeyRetrieval: true,
    connectTimeout: 5000,
    initSql: 'SET NAMES utf8mb4 COLLATE utf8mb4_0900_bin',
  };
}
