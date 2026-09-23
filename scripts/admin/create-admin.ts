// yarn admin:create — local administrator bootstrap (P1, AR-013). No public signup exists.
//
// 1. Loads the root .env and validates DATABASE_URL through the shared local allowlist BEFORE any
//    build or connection: loopback host, port 3307, schema tb_notice_dev only, never root and never
//    the tb_migrate tooling account (the runtime tb_dev account creates the row).
// 2. Builds the compiled API (Prisma client if missing, @tb/contracts, @tb/api) so the CLI uses the
//    current Argon2id parameters and credential rules. Build steps never read standard input.
// 3. Runs apps/api/dist/src/cli/admin-create.js with the terminal attached (hidden password prompt)
//    or with standard input passed through (--password-stdin). Arguments are forwarded unchanged.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { assertLocalTarget, describeTarget } from '../db/allowlist.mjs';
import { loadRootEnv } from '../db/lib/targets.mjs';
import { repoRoot } from '../contracts/paths.ts';

const node = process.execPath;
const bin = (name: string) => path.join(repoRoot, 'node_modules/.bin', name);

function refuse(message: string): never {
  console.error(`[admin:create] refused: ${message}`);
  process.exit(1);
}

function build(label: string, command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) refuse(`${label} failed (exit ${result.status ?? result.signal})`);
}

loadRootEnv();
try {
  const target = assertLocalTarget('DATABASE_URL', process.env['DATABASE_URL'], {
    expectedSchema: 'tb_notice_dev',
    forbidUser: 'tb_migrate',
  });
  console.log(`[admin:create] guard: ${describeTarget(target)} (local runtime account)`);
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error));
}

if (!existsSync(path.join(repoRoot, 'apps/api/generated/prisma/client.ts'))) {
  build('generating the Prisma client', node, [
    path.join(repoRoot, 'scripts/db/prisma-guarded.mjs'),
    'generate',
  ]);
}
build('building @tb/contracts', bin('tsc'), [
  '-p',
  path.join(repoRoot, 'packages/contracts/tsconfig.json'),
]);
build('building @tb/api', bin('tsc'), ['-p', path.join(repoRoot, 'apps/api/tsconfig.build.json')]);

const cli = spawnSync(
  node,
  [path.join(repoRoot, 'apps/api/dist/src/cli/admin-create.js'), ...process.argv.slice(2)],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (cli.error) refuse(cli.error.message);
process.exit(cli.status ?? 1);
