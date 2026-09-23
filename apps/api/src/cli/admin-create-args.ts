/** Invalid invocation; the message never contains argument values. */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export interface AdminCreateArgs {
  readonly email?: string;
  readonly displayName?: string;
  readonly passwordStdin: boolean;
  readonly help: boolean;
}

export const ADMIN_CREATE_USAGE = `Usage: yarn admin:create [--email <email>] [--display-name <name>] [--password-stdin]

Creates one enabled local application user in tb_notice_dev (runtime account; never root).
Interactive by default: prompts for missing values and reads the password twice without echo.
  --email <email>          account email (normalized to lowercase)
  --display-name <name>    display name shown in the application shell
  --password-stdin         read the password from standard input (non-interactive use)
A password is never accepted as an argument or environment variable. An existing user is never
modified. The account is an application login only: not a Signer and no legal authority.`;

/** Parses CLI arguments; throws with a usage hint on unknown or incomplete flags. */
export function parseAdminCreateArgs(argv: readonly string[]): AdminCreateArgs {
  let email: string | undefined;
  let displayName: string | undefined;
  let passwordStdin = false;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index] ?? '';
    const separator = raw.indexOf('=');
    const flag = raw.startsWith('--') && separator > 0 ? raw.slice(0, separator) : raw;
    const inline = raw.startsWith('--') && separator > 0 ? raw.slice(separator + 1) : undefined;
    const value = (): string => {
      if (inline !== undefined) return inline;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--'))
        throw new CliUsageError(`${flag} requires a value`);
      index += 1;
      return next;
    };
    switch (flag) {
      case '--email':
        email = value();
        break;
      case '--display-name':
        displayName = value();
        break;
      case '--password-stdin':
        if (inline !== undefined) throw new CliUsageError('--password-stdin takes no value');
        passwordStdin = true;
        break;
      case '--help':
      case '-h':
        help = true;
        break;
      case '--password':
        throw new CliUsageError(
          'passwords are never accepted on the command line; use the interactive prompt or --password-stdin',
        );
      default:
        // Positional values are not echoed: a mistyped password must not reach the terminal log.
        throw new CliUsageError(
          flag.startsWith('-')
            ? `unknown option ${JSON.stringify(flag)}`
            : 'unexpected positional argument (not echoed)',
        );
    }
  }
  return {
    passwordStdin,
    help,
    ...(email === undefined ? {} : { email }),
    ...(displayName === undefined ? {} : { displayName }),
  };
}
