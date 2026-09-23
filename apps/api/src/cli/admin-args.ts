// Arguments of the local admin CLI: `admin.js <command> [options]`, reached through
// yarn admin:create | admin:password | admin:disable | admin:enable | admin:revoke-sessions.

export const ADMIN_COMMANDS = [
  'create',
  'password',
  'disable',
  'enable',
  'revoke-sessions',
] as const;
export type AdminCommand = (typeof ADMIN_COMMANDS)[number];

/** Invalid invocation; the message never contains argument values. */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export interface AdminArgs {
  readonly command: AdminCommand;
  readonly email?: string;
  readonly displayName?: string;
  readonly reason?: string;
  readonly passwordStdin: boolean;
  readonly help: boolean;
}

const VALUE_FLAGS: Readonly<Record<AdminCommand, readonly string[]>> = {
  create: ['--email', '--display-name'],
  password: ['--email', '--reason'],
  disable: ['--email', '--reason'],
  enable: ['--email', '--reason'],
  'revoke-sessions': ['--email', '--reason'],
};

/** Commands that read a new password (hidden prompt or --password-stdin). */
export const PASSWORD_COMMANDS: ReadonlySet<AdminCommand> = new Set(['create', 'password']);

export function isAdminCommand(value: string | undefined): value is AdminCommand {
  return (ADMIN_COMMANDS as readonly (string | undefined)[]).includes(value);
}

const COMMON_NOTE = `A password is never accepted as an argument or environment variable. Target: tb_notice_dev only,
through the runtime account (never root, never tb_migrate). Application login state only: not a
Signer, no authority or business record is touched, and no legal authority is conferred.`;

const USAGE: Readonly<Record<AdminCommand, string>> = {
  create: `Usage: yarn admin:create [--email <email>] [--display-name <name>] [--password-stdin]

Creates one enabled local application user. Interactive by default: prompts for missing values and
reads the password twice without echo; --password-stdin reads it from a pipe or file instead.
An existing user is never modified.`,
  password: `Usage: yarn admin:password --email <email> [--password-stdin] [--reason <text>]

Replaces the password of one existing application user (same policy, normalization and Argon2id
parameters as admin:create). Reads the new password twice without echo, or from a pipe or file with
--password-stdin. Increments the session epoch and revokes every active session in one transaction.
The enabled/disabled state is unchanged. Never creates a user.`,
  disable: `Usage: yarn admin:disable --email <email> [--reason <text>]

Disables one existing application user (enabled=false, disabled_at=now), increments the session
epoch and revokes every active session in one transaction. Never deletes the user. An already
disabled user is reported and left unchanged.`,
  enable: `Usage: yarn admin:enable --email <email> [--reason <text>]

Enables one existing application user and increments the session epoch, so sessions from before
remain unusable; the unchanged password works again. An already enabled user is reported and left
unchanged. The P0 synthetic actor and other non-credential fixtures can never be enabled.`,
  'revoke-sessions': `Usage: yarn admin:revoke-sessions --email <email> [--reason <text>]

Ends every session of one existing application user: increments the session epoch and revokes all
active sessions in one transaction (zero sessions is fine). Historical rows are kept; other users
are not affected.`,
};

export function adminUsage(command: AdminCommand): string {
  return `${USAGE[command]}\n  --reason <text>   optional context stored in the audit event (not for create)\n${COMMON_NOTE}`;
}

/** Parses `<command> [options]`; throws CliUsageError without echoing any value. */
export function parseAdminArgs(argv: readonly string[]): AdminArgs {
  const [command, ...rest] = argv;
  if (!isAdminCommand(command)) {
    throw new CliUsageError(
      `missing or unknown admin command (expected one of: ${ADMIN_COMMANDS.join(', ')})`,
    );
  }
  const values = new Map<string, string>();
  let passwordStdin = false;
  let help = false;
  for (let index = 0; index < rest.length; index += 1) {
    const raw = rest[index] ?? '';
    const separator = raw.indexOf('=');
    const flag = raw.startsWith('--') && separator > 0 ? raw.slice(0, separator) : raw;
    const inline = raw.startsWith('--') && separator > 0 ? raw.slice(separator + 1) : undefined;
    if (flag === '--password') {
      throw new CliUsageError(
        'passwords are never accepted on the command line; use the hidden prompt or --password-stdin',
      );
    }
    if (flag === '--help' || flag === '-h') {
      help = true;
    } else if (flag === '--password-stdin' && PASSWORD_COMMANDS.has(command)) {
      if (inline !== undefined) throw new CliUsageError('--password-stdin takes no value');
      passwordStdin = true;
    } else if (VALUE_FLAGS[command].includes(flag)) {
      let value = inline;
      if (value === undefined) {
        const next = rest[index + 1];
        if (next === undefined || next.startsWith('--')) {
          throw new CliUsageError(`${flag} requires a value`);
        }
        value = next;
        index += 1;
      }
      values.set(flag, value);
    } else {
      // Values are never echoed: a mistyped password must not reach the terminal log.
      throw new CliUsageError(
        flag.startsWith('-')
          ? `unknown option ${JSON.stringify(flag)} for admin:${command}`
          : 'unexpected positional argument (not echoed)',
      );
    }
  }
  const email = values.get('--email');
  const displayName = values.get('--display-name');
  const reason = values.get('--reason');
  return {
    command,
    passwordStdin,
    help,
    ...(email === undefined ? {} : { email }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(reason === undefined ? {} : { reason }),
  };
}
