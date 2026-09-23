// The admin CLI runner without a database: every command is refused at the target guard before a
// connection is opened, and password-input safety checks run before the guard. The same resolver
// (resolveCliTarget) is what the compiled entry uses; tests/db/admin-recovery.test.ts checks that
// wiring and the database behaviour.
import { Readable, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_COMMANDS, type AdminCommand } from '../../apps/api/src/cli/admin-args.js';
import { runAdminCli, type AdminCliDeps } from '../../apps/api/src/cli/admin-cli.js';
import { resolveCliTarget } from '../../apps/api/src/cli/cli-target.js';
import { PasswordHasher } from '../../apps/api/src/modules/auth/password-hasher.js';

const EMAIL = 'p1-runner@example.invalid';
const SECRET = 'syntheticNotARealPassword0000000000';
const url = (user: string, host: string, port: number, schema: string) =>
  `mysql://${user}:${SECRET}@${host}:${port}/${schema}`;

/** Arguments that pass argument parsing and input checks for each command. */
const VALID_ARGS: Readonly<Record<AdminCommand, string[]>> = {
  create: ['create', '--email', EMAIL, '--display-name', 'Synthetic Runner', '--password-stdin'],
  password: ['password', '--email', EMAIL, '--password-stdin'],
  disable: ['disable', '--email', EMAIL],
  enable: ['enable', '--email', EMAIL],
  'revoke-sessions': ['revoke-sessions', '--email', EMAIL],
};

function harness(options: {
  tty?: boolean;
  env?: NodeJS.ProcessEnv;
  resolveTarget?: AdminCliDeps['resolveTarget'];
}) {
  const out: string[] = [];
  const err: string[] = [];
  const openDatabase = vi.fn<AdminCliDeps['openDatabase']>(() => {
    throw new Error('the database must not be opened');
  });
  const resolveTarget = vi.fn<AdminCliDeps['resolveTarget']>(
    options.resolveTarget ??
      (async () => {
        throw new Error('DATABASE_URL rejected: synthetic guard refusal.');
      }),
  );
  const stdin = Object.assign(Readable.from(['synthetic runner password 0001\n']), {
    isTTY: options.tty,
  });
  const deps: AdminCliDeps = {
    env: options.env ?? {},
    stdin,
    stdout: new Writable({
      write(chunk, _encoding, callback) {
        out.push(String(chunk));
        callback();
      },
    }),
    stderr: { write: (text: string) => err.push(text) },
    resolveTarget,
    openDatabase,
    clock: { now: () => new Date() },
    hasher: new PasswordHasher(),
    newRequestId: () => 'synthetic-request',
  };
  return { deps, out, err, openDatabase, resolveTarget };
}

describe('admin CLI runner (no database)', () => {
  it.each(ADMIN_COMMANDS)(
    '%s: a guard refusal stops the command before any connection',
    async (command) => {
      const h = harness({});
      expect(await runAdminCli(VALID_ARGS[command], h.deps)).toBe(1);
      expect(h.resolveTarget).toHaveBeenCalledTimes(1);
      expect(h.openDatabase).not.toHaveBeenCalled();
      expect(h.err.join('')).toBe(
        `[admin:${command}] refused: DATABASE_URL rejected: synthetic guard refusal.\n`,
      );
    },
  );

  it.each([
    ['another local MySQL port', url('tb_dev', '127.0.0.1', 3306, 'tb_notice_dev'), /is not 3307/],
    ['root', url('root', '127.0.0.1', 3307, 'tb_notice_dev'), /root credentials/],
    ['tooling account', url('tb_migrate', '127.0.0.1', 3307, 'tb_notice_dev'), /tb_migrate/],
    ['test schema', url('tb_dev', '127.0.0.1', 3307, 'tb_notice_test'), /tb_notice_dev/],
    ['remote host', url('tb_dev', '10.0.0.5', 3307, 'tb_notice_dev'), /not loopback/],
    ['unset', undefined, /DATABASE_URL is not set/],
  ])(
    'the production resolver refuses %s for every command',
    async (_label, databaseUrl, message) => {
      for (const command of ADMIN_COMMANDS) {
        const h = harness({ env: { DATABASE_URL: databaseUrl }, resolveTarget: resolveCliTarget });
        expect(await runAdminCli(VALID_ARGS[command], h.deps)).toBe(1);
        expect(h.openDatabase).not.toHaveBeenCalled();
        expect(h.err.join('')).toMatch(message);
        expect(`${h.out.join('')}${h.err.join('')}`).not.toContain(SECRET);
      }
    },
  );

  it('refuses --password-stdin at a terminal, and a pipe without it, before the guard', async () => {
    for (const command of ['create', 'password'] as const) {
      const atTerminal = harness({ tty: true });
      expect(await runAdminCli(VALID_ARGS[command], atTerminal.deps)).toBe(1);
      expect(atTerminal.err.join('')).toMatch(/--password-stdin reads a pipe or file/);
      expect(atTerminal.resolveTarget).not.toHaveBeenCalled();
    }
    const piped = harness({ tty: false });
    expect(await runAdminCli(['password', '--email', EMAIL], piped.deps)).toBe(1);
    expect(piped.err.join('')).toMatch(/pass --password-stdin/);
    expect(piped.resolveTarget).not.toHaveBeenCalled();
  });

  it('requires a valid --email (and a valid optional --reason) before the guard', async () => {
    const cases: Array<[string[], RegExp]> = [
      [['disable'], /--email is required/],
      [['enable', '--email', 'not-an-email'], /email must be a valid address/],
      [['revoke-sessions', '--email', EMAIL, '--reason', '   '], /--reason must be/],
      [['disable', '--email', EMAIL, '--reason', 'x'.repeat(501)], /--reason must be/],
      [['disable', '--email', EMAIL, '--reason', 'tab\there'], /--reason must be/],
    ];
    for (const [argv, message] of cases) {
      const h = harness({});
      expect(await runAdminCli(argv, h.deps)).toBe(1);
      expect(h.err.join('')).toMatch(message);
      expect(h.resolveTarget).not.toHaveBeenCalled();
    }
  });

  it('prints help without touching the target and refuses unknown commands without echo', async () => {
    for (const command of ADMIN_COMMANDS) {
      const h = harness({});
      expect(await runAdminCli([command, '--help'], h.deps)).toBe(0);
      expect(h.out.join('')).toContain(`yarn admin:${command}`);
      expect(h.resolveTarget).not.toHaveBeenCalled();
    }
    const unknown = harness({});
    expect(await runAdminCli(['synthetic-secret-command'], unknown.deps)).toBe(1);
    expect(unknown.err.join('')).toMatch(/^\[admin\] refused: missing or unknown admin command/);
    expect(unknown.err.join('')).not.toContain('synthetic-secret-command');
  });
});
