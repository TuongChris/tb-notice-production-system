// Runner of the local admin CLI (`admin.js <command>`). Dependencies are injected so the full
// command surface can be tested against tb_notice_test; the compiled entry (admin.ts) always uses
// productionAdminCliDeps(), whose target resolver applies the shared allowlist and the runtime
// boundary before any connection.
//
// Order of checks for every command: arguments → password-input safety → email and reason format →
// database target guard → connection → reviewed migration applied → command.
import type { Clock } from '../infrastructure/time/clock.js';
import type { PasswordHasher } from '../modules/auth/password-hasher.js';
import {
  adminUsage,
  CliUsageError,
  parseAdminArgs,
  PASSWORD_COMMANDS,
  type AdminArgs,
} from './admin-args.js';
import { acceptEmail, acceptReason, AdminRefusal, type AdminStore } from './admin-common.js';
import { acceptDisplayName, assertEmailAvailable, createLocalAdmin } from './admin-create-core.js';
import {
  disableUser,
  enableUser,
  findModifiableUser,
  resetPassword,
  revokeUserSessions,
  type RecoveryOutcome,
} from './admin-recovery-core.js';
import type { CliTarget } from './cli-target.js';
import {
  PromptCancelled,
  readHiddenLine,
  readPasswordFromStdin,
  readVisibleLine,
  type TtyInput,
} from './terminal-input.js';

const MIGRATION_NAME = '20260923103912_initial_schema';

const BOUNDARY_NOTE =
  'Application login state only: no Signer, authority or business record was changed, and this confers no legal authority.';

export interface AdminDatabase {
  readonly client: AdminStore;
  close(): Promise<void>;
}

export interface AdminCliDeps {
  readonly env: NodeJS.ProcessEnv;
  readonly stdin: NodeJS.ReadableStream & { readonly isTTY?: boolean };
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: { write(text: string): unknown };
  /** Throws (without connecting) unless the target is allowed. */
  readonly resolveTarget: (rawUrl: string | undefined) => Promise<CliTarget>;
  readonly openDatabase: (target: CliTarget) => AdminDatabase;
  readonly clock: Clock;
  readonly hasher: PasswordHasher;
  readonly newRequestId: () => string;
}

/** Runs one admin command and returns the process exit code (0 success, 1 refused/failed). */
export async function runAdminCli(argv: readonly string[], deps: AdminCliDeps): Promise<number> {
  let label = 'admin';
  try {
    const args = parseAdminArgs(argv);
    label = `admin:${args.command}`;
    if (args.help) {
      deps.stdout.write(`${adminUsage(args.command)}\n`);
      return 0;
    }
    const log = (message: string) => deps.stdout.write(`[${label}] ${message}\n`);
    checkInvocation(args, deps.stdin.isTTY === true);
    if (args.email !== undefined) acceptEmail(args.email);
    const reason = args.reason === undefined ? undefined : acceptReason(args.reason);

    const target = await deps.resolveTarget(deps.env['DATABASE_URL']);
    log(`target ${target.label} (password not shown)`);
    const database = deps.openDatabase(target);
    try {
      await assertMigrationApplied(database.client);
      if (args.command === 'create') {
        await runCreate(args, database.client, deps, log);
      } else {
        const outcome = await runRecovery(args, reason, database.client, deps);
        for (const line of describeOutcome(args.command, outcome)) log(line);
      }
      log(BOUNDARY_NOTE);
      return 0;
    } finally {
      await database.close().catch(() => undefined);
    }
  } catch (error) {
    deps.stderr.write(`[${label}] refused: ${safeMessage(error)}\n`);
    return 1;
  }
}

function checkInvocation(args: AdminArgs, interactive: boolean): void {
  if (args.command !== 'create' && args.email === undefined) {
    throw new AdminRefusal(`--email is required for admin:${args.command}`);
  }
  if (!PASSWORD_COMMANDS.has(args.command)) return;
  if (args.passwordStdin && interactive) {
    // Reading a terminal in normal mode would echo the password and keep it in the scrollback.
    throw new AdminRefusal(
      '--password-stdin reads a pipe or file; at a terminal omit it and use the hidden prompt',
    );
  }
  if (!args.passwordStdin && !interactive) {
    throw new AdminRefusal(
      'standard input is not a terminal; pass --password-stdin to supply the password on stdin',
    );
  }
  if (
    args.command === 'create' &&
    args.passwordStdin &&
    (args.email === undefined || args.displayName === undefined)
  ) {
    throw new AdminRefusal('--password-stdin requires --email and --display-name');
  }
}

async function assertMigrationApplied(store: AdminStore): Promise<void> {
  const applied = await store.$queryRaw<Array<{ n: bigint | number }>>`
    SELECT COUNT(*) AS n FROM _prisma_migrations
    WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  if (Number(applied[0]?.n ?? 0) !== 1) {
    throw new AdminRefusal(
      'the reviewed initial migration is not applied to the target schema; run yarn db:migrate:deploy dev',
    );
  }
}

async function readNewPassword(passwordStdin: boolean, deps: AdminCliDeps): Promise<string> {
  if (passwordStdin) return readPasswordFromStdin(deps.stdin as AsyncIterable<Buffer | string>);
  const input = deps.stdin as unknown as TtyInput;
  const first = await readHiddenLine(input, deps.stdout, 'New password (not echoed): ');
  const second = await readHiddenLine(input, deps.stdout, 'Repeat new password: ');
  if (first !== second) throw new AdminRefusal('the two passwords do not match');
  return first;
}

async function runCreate(
  args: AdminArgs,
  store: AdminStore,
  deps: AdminCliDeps,
  log: (message: string) => void,
): Promise<void> {
  const email = acceptEmail(
    args.email ?? (await readVisibleLine(deps.stdin, deps.stdout, 'Email: ')),
  );
  await assertEmailAvailable(store, email);
  const displayName = acceptDisplayName(
    args.displayName ?? (await readVisibleLine(deps.stdin, deps.stdout, 'Display name: ')),
  );
  const password = await readNewPassword(args.passwordStdin, deps);
  const created = await createLocalAdmin(
    store,
    { email, displayName, password },
    { hasher: deps.hasher, clock: deps.clock, requestId: deps.newRequestId() },
  );
  log(`created enabled application user ${created.id}`);
  log(`  email:        ${created.email}`);
  log(`  display name: ${created.displayName}`);
  log('  password:     Argon2id hash stored; the password itself was not stored or printed');
}

async function runRecovery(
  args: AdminArgs,
  reason: string | undefined,
  store: AdminStore,
  deps: AdminCliDeps,
): Promise<RecoveryOutcome> {
  const email = args.email ?? '';
  const context = {
    clock: deps.clock,
    requestId: deps.newRequestId(),
    ...(reason === undefined ? {} : { reason }),
  };
  switch (args.command) {
    case 'password': {
      // Refuse unknown or protected targets before asking for a password.
      await findModifiableUser(store, email);
      const password = await readNewPassword(args.passwordStdin, deps);
      return resetPassword(store, { email, password }, { ...context, hasher: deps.hasher });
    }
    case 'disable':
      return disableUser(store, { email }, context);
    case 'enable':
      return enableUser(store, { email }, context);
    case 'revoke-sessions':
      return revokeUserSessions(store, { email }, context);
    case 'create':
      throw new AdminRefusal('admin:create is not a recovery command');
  }
}

function describeOutcome(command: AdminArgs['command'], outcome: RecoveryOutcome): string[] {
  const who = `application user ${outcome.userId} (${outcome.email})`;
  const epoch = `session epoch ${outcome.sessionEpochBefore} → ${outcome.sessionEpochAfter}`;
  const revoked = `${outcome.revokedSessions} active session(s) revoked`;
  if (!outcome.changed) {
    const state = command === 'enable' ? 'already enabled' : 'already disabled';
    return [
      `${who} is ${state}; nothing changed.` +
        (outcome.protectedFixture ? ' (protected P0 synthetic actor: never modified)' : ''),
    ];
  }
  switch (command) {
    case 'password':
      return [
        `password replaced for ${who}; ${epoch}; ${revoked}.`,
        `The account stays ${outcome.enabled ? 'enabled' : 'disabled'}; the new password was not stored or printed.`,
      ];
    case 'disable':
      return [`disabled ${who}; ${epoch}; ${revoked}. The user row is kept.`];
    case 'enable':
      return [`enabled ${who}; ${epoch} (sessions from before stay unusable); ${revoked}.`];
    default:
      return [`${revoked} for ${who}; ${epoch} (every earlier session is unusable).`];
  }
}

/** Message safe to print: refusals and usage errors verbatim, anything else by class/code only. */
function safeMessage(error: unknown): string {
  if (
    error instanceof AdminRefusal ||
    error instanceof PromptCancelled ||
    error instanceof CliUsageError
  ) {
    return error.message;
  }
  // Target-guard messages (allowlist and runtime boundary) name the rule, never the password.
  if (error instanceof Error && error.message.startsWith('DATABASE_URL')) return error.message;
  const code = (error as { code?: unknown }).code;
  const name = error instanceof Error ? error.name : 'Error';
  return `${name}${typeof code === 'string' ? ` ${code}` : ''} (details withheld)`;
}
