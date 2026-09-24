// yarn admin:<command> — local-only administration of application Users (P1/P1.1):
//   create | password | disable | enable | revoke-sessions. There is no HTTP API or UI for this.
//
// 1. Accepts only a known command (unknown input is refused without being echoed).
// 2. Loads the root .env and validates DATABASE_URL through the shared local allowlist BEFORE any
//    build or connection: loopback host, port 3307, schema tb_notice_dev only, never root and never
//    the tb_migrate tooling account (the runtime tb_dev account performs the change).
// 3. Builds the compiled API (Prisma client if missing, @tb/contracts, @tb/api) so the CLI uses the
//    current credential rules and Argon2id parameters. Build steps never read standard input.
// 4. Runs apps/api/dist/src/cli/admin.js <command> with the terminal attached (hidden password
//    prompt) or with standard input passed through (--password-stdin). The compiled entry repeats
//    the target check itself. Application login state only: no Signer, authority or business record.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { assertLocalTarget, describeTarget } from '../db/allowlist.mjs';
import { loadRootEnv } from '../db/lib/targets.mjs';
import { repoRoot } from '../contracts/paths.ts';
import { ADMIN_COMMANDS } from './commands.mjs';

const node = process.execPath;
const bin = (name: string) => path.join(repoRoot, 'node_modules/.bin', name);
const [command, ...args] = process.argv.slice(2);
const label = ADMIN_COMMANDS.includes(command ?? '') ? `admin:${command}` : 'admin';

function refuse(message: string): never {
  console.error(`[${label}] refused: ${message}`);
  process.exit(1);
}

function build(step: string, executable: string, buildArgs: string[]): void {
  const result = spawnSync(executable, buildArgs, {
    cwd: repoRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) refuse(`${step} failed (exit ${result.status ?? result.signal})`);
}

if (!ADMIN_COMMANDS.includes(command ?? '')) {
  refuse(`missing or unknown admin command (expected one of: ${ADMIN_COMMANDS.join(', ')})`);
}

loadRootEnv();
try {
  const target = assertLocalTarget('DATABASE_URL', process.env['DATABASE_URL'], {
    expectedSchema: 'tb_notice_dev',
    forbidUser: 'tb_migrate',
  });
  console.log(`[${label}] guard: ${describeTarget(target)} (local runtime account)`);
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
  [path.join(repoRoot, 'apps/api/dist/src/cli/admin.js'), command as string, ...args],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (cli.error) refuse(cli.error.message);
process.exit(cli.status ?? 1);
