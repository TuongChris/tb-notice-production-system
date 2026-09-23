// Database target guard of the compiled admin CLI. Applies both boundaries, so running the compiled
// entry directly (bypassing scripts/admin/create-admin.ts) is exactly as restricted:
//   1. the shared tooling allowlist scripts/db/allowlist.mjs (loopback host, port 3307, schema
//      tb_notice_dev, never root, never the tb_migrate tooling account), and
//   2. the API runtime boundary runtimePoolConfig (same rules the running API applies).
// Messages name the rule and never contain the password.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repositoryRoot } from '../infrastructure/config/root-env.js';
import {
  runtimePoolConfig,
  type RuntimePoolConfig,
} from '../infrastructure/database/runtime-database-url.js';

interface LocalTarget {
  readonly host: string;
  readonly port: string;
  readonly schema: string;
  readonly user: string;
}

interface Allowlist {
  assertLocalTarget(
    variableName: string,
    rawUrl: string | undefined,
    options: { expectedSchema?: string; forbidUser?: string; requireUser?: string },
  ): LocalTarget;
  describeTarget(target: LocalTarget): string;
}

export interface CliTarget {
  readonly pool: RuntimePoolConfig;
  /** user@host:port/schema, without the password. */
  readonly label: string;
}

export async function resolveCliTarget(rawUrl: string | undefined): Promise<CliTarget> {
  const root = repositoryRoot();
  if (root === undefined) {
    throw new Error('DATABASE_URL guard unavailable: repository root (.yarnrc.yml) not found.');
  }
  const allowlist = (await import(
    pathToFileURL(path.join(root, 'scripts/db/allowlist.mjs')).href
  )) as Allowlist;
  const target = allowlist.assertLocalTarget('DATABASE_URL', rawUrl, {
    expectedSchema: 'tb_notice_dev',
    forbidUser: 'tb_migrate',
  });
  return { pool: runtimePoolConfig(rawUrl), label: allowlist.describeTarget(target) };
}
