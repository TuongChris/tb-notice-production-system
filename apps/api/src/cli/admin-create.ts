// Compiled entry point of `yarn admin:create` (run through scripts/admin/create-admin.ts, which
// first validates DATABASE_URL against the local allowlist and builds the API).
//
// Safety: local development only. The target must pass the shared allowlist
// (scripts/db/allowlist.mjs: loopback, port 3307, schema tb_notice_dev, never root or tb_migrate)
// and the API runtime boundary (runtimePoolConfig) — see cli-target.ts. The password is read
// without echo or from --password-stdin, is hashed with Argon2id and is never stored, printed or
// logged in plaintext.
import { randomUUID } from 'node:crypto';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client.js';
import { loadRootEnv } from '../infrastructure/config/root-env.js';
import { systemClock } from '../infrastructure/time/clock.js';
import { PasswordHasher } from '../modules/auth/password-hasher.js';
import { ADMIN_CREATE_USAGE, CliUsageError, parseAdminCreateArgs } from './admin-create-args.js';
import {
  acceptDisplayName,
  acceptEmail,
  AdminCreateRefusal,
  assertEmailAvailable,
  createLocalAdmin,
} from './admin-create-core.js';
import { resolveCliTarget } from './cli-target.js';
import {
  PromptCancelled,
  readHiddenLine,
  readPasswordFromStdin,
  readVisibleLine,
  type TtyInput,
} from './terminal-input.js';

const MIGRATION_NAME = '20260923103912_initial_schema';

function log(message: string): void {
  process.stdout.write(`[admin:create] ${message}\n`);
}

async function promptNewPassword(): Promise<string> {
  const input = process.stdin as unknown as TtyInput;
  const first = await readHiddenLine(input, process.stdout, 'Password (not echoed): ');
  const second = await readHiddenLine(input, process.stdout, 'Repeat password: ');
  if (first !== second) throw new AdminCreateRefusal('the two passwords do not match');
  return first;
}

async function main(): Promise<number> {
  loadRootEnv();
  const args = parseAdminCreateArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${ADMIN_CREATE_USAGE}\n`);
    return 0;
  }
  const interactive = process.stdin.isTTY === true;
  if (!interactive && !args.passwordStdin) {
    throw new AdminCreateRefusal(
      'standard input is not a terminal; pass --password-stdin to supply the password on stdin',
    );
  }
  if (args.passwordStdin && interactive) {
    // Reading a terminal in normal mode would echo the password and keep it in the scrollback.
    throw new AdminCreateRefusal(
      '--password-stdin reads a pipe or file; at a terminal omit it and use the hidden prompt',
    );
  }
  if (args.passwordStdin && (args.email === undefined || args.displayName === undefined)) {
    throw new AdminCreateRefusal('--password-stdin requires --email and --display-name');
  }

  // Throws before any connection when the target is not allowed.
  const { pool, label } = await resolveCliTarget(process.env['DATABASE_URL']);
  log(`target ${label} (password not shown)`);
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(pool) });
  try {
    const applied = await prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT COUNT(*) AS n FROM _prisma_migrations
      WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    if (Number(applied[0]?.n ?? 0) !== 1) {
      throw new AdminCreateRefusal(
        'the reviewed initial migration is not applied to tb_notice_dev; run yarn db:migrate:deploy dev',
      );
    }

    const email = acceptEmail(
      args.email ?? (await readVisibleLine(process.stdin, process.stdout, 'Email: ')),
    );
    await assertEmailAvailable(prisma, email);
    const displayName = acceptDisplayName(
      args.displayName ?? (await readVisibleLine(process.stdin, process.stdout, 'Display name: ')),
    );
    const password = args.passwordStdin
      ? await readPasswordFromStdin(process.stdin)
      : await promptNewPassword();

    const created = await createLocalAdmin(
      prisma,
      { email, displayName, password },
      { hasher: new PasswordHasher(), clock: systemClock, requestId: randomUUID() },
    );
    log(`created enabled application user ${created.id}`);
    log(`  email:        ${created.email}`);
    log(`  display name: ${created.displayName}`);
    log('  password:     Argon2id hash stored; the password itself was not stored or printed');
    log('This account is an application login only. It is not a Signer, confers no legal');
    log('authority and cannot sign, adopt or send anything.');
    return 0;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

/** Message safe to print: refusals and usage errors verbatim, anything else by class/code only. */
function safeMessage(error: unknown): string {
  if (
    error instanceof AdminCreateRefusal ||
    error instanceof PromptCancelled ||
    error instanceof CliUsageError
  ) {
    return error.message;
  }
  // runtimePoolConfig messages name the rule, never the password.
  if (error instanceof Error && error.message.startsWith('DATABASE_URL')) return error.message;
  const code = (error as { code?: unknown }).code;
  const name = error instanceof Error ? error.name : 'Error';
  return `${name}${typeof code === 'string' ? ` ${code}` : ''} (details withheld)`;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`[admin:create] refused: ${safeMessage(error)}\n`);
    process.exitCode = 1;
  },
);
