// Admin CLI pieces that need no database: argument parsing for every command, hidden TTY input and
// --password-stdin reading. (Runner: admin-cli-runner.test.ts; database behaviour:
// tests/db/admin-create.test.ts and tests/db/admin-recovery.test.ts.)
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_COMMANDS,
  adminUsage,
  isAdminCommand,
  parseAdminArgs,
} from '../../apps/api/src/cli/admin-args.js';
import {
  PromptCancelled,
  readHiddenLine,
  readPasswordFromStdin,
  type TtyInput,
} from '../../apps/api/src/cli/terminal-input.js';

class FakeTty extends EventEmitter implements TtyInput {
  readonly isTTY = true;
  isRaw = false;
  rawModes: boolean[] = [];
  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    this.rawModes.push(mode);
    return this;
  }
  resume(): this {
    return this;
  }
  pause(): this {
    return this;
  }
  type(...chunks: Array<string | Buffer>): void {
    for (const chunk of chunks) this.emit('data', chunk);
  }
}

class Capture {
  text = '';
  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
}

describe('parseAdminArgs', () => {
  it('parses each command with its own flags, in both forms', () => {
    expect(parseAdminArgs(['create'])).toEqual({
      command: 'create',
      passwordStdin: false,
      help: false,
    });
    expect(
      parseAdminArgs([
        'create',
        '--email',
        'a@b.co',
        '--display-name=Synthetic Operator',
        '--password-stdin',
      ]),
    ).toEqual({
      command: 'create',
      email: 'a@b.co',
      displayName: 'Synthetic Operator',
      passwordStdin: true,
      help: false,
    });
    expect(
      parseAdminArgs(['password', '--email=a@b.co', '--password-stdin', '--reason', 'lost']),
    ).toEqual({
      command: 'password',
      email: 'a@b.co',
      reason: 'lost',
      passwordStdin: true,
      help: false,
    });
    for (const command of ['disable', 'enable', 'revoke-sessions'] as const) {
      expect(parseAdminArgs([command, '--email', 'a@b.co'])).toEqual({
        command,
        email: 'a@b.co',
        passwordStdin: false,
        help: false,
      });
    }
    expect(parseAdminArgs(['disable', '--help']).help).toBe(true);
  });

  it('rejects flags that do not belong to the command', () => {
    expect(() => parseAdminArgs(['disable', '--password-stdin'])).toThrow(/unknown option/);
    expect(() => parseAdminArgs(['revoke-sessions', '--display-name', 'x'])).toThrow(
      /unknown option/,
    );
    expect(() => parseAdminArgs(['create', '--reason', 'x'])).toThrow(/unknown option/);
  });

  it('requires a known command without echoing unknown input', () => {
    for (const argv of [[], ['delete'], ['synthetic-secret-value']]) {
      let message = '';
      try {
        parseAdminArgs(argv);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/missing or unknown admin command/);
      expect(message).not.toContain('synthetic-secret-value');
      expect(message).not.toContain('delete');
    }
    expect(ADMIN_COMMANDS).toEqual(['create', 'password', 'disable', 'enable', 'revoke-sessions']);
    expect(isAdminCommand('revoke-sessions')).toBe(true);
    expect(isAdminCommand('signup')).toBe(false);
  });

  it('never accepts a password argument and never echoes unexpected values', () => {
    for (const command of ['create', 'password'] as const) {
      expect(() => parseAdminArgs([command, '--password', 'synthetic-secret-value'])).toThrow(
        /never accepted on the command line/,
      );
      expect(() => parseAdminArgs([command, '--password=synthetic-secret-value'])).toThrow(
        /never accepted on the command line/,
      );
    }
    let message = '';
    try {
      parseAdminArgs(['password', '--email', 'a@b.co', 'synthetic-secret-value']);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('unexpected positional argument (not echoed)');
    expect(() => parseAdminArgs(['disable', '--email'])).toThrow(/requires a value/);
    expect(() => parseAdminArgs(['create', '--password-stdin=yes'])).toThrow(/takes no value/);
  });

  it('documents every command and states the application-login boundary', () => {
    for (const command of ADMIN_COMMANDS) {
      const usage = adminUsage(command);
      expect(usage).toContain(`yarn admin:${command}`);
      expect(usage).toMatch(/not a\s+Signer/);
      expect(usage).toMatch(/never accepted as an argument or environment variable/);
    }
  });
});

describe('readHiddenLine', () => {
  it('reads a line without echoing it and restores the terminal mode', async () => {
    const tty = new FakeTty();
    const output = new Capture();
    const line = readHiddenLine(tty, output, 'Password: ');
    tty.type('synthetic', Buffer.from(' pässword'), '\r');
    await expect(line).resolves.toBe('synthetic pässword');
    expect(output.text).toBe('Password: \n');
    expect(tty.rawModes).toEqual([true, false]);
    expect(tty.listenerCount('data')).toBe(0);
  });

  it('handles backspace, multi-byte characters split across chunks and escape sequences', async () => {
    const tty = new FakeTty();
    const line = readHiddenLine(tty, new Capture(), '');
    const bytes = Buffer.from('mật');
    tty.type('abX\u007f', bytes.subarray(0, 2), bytes.subarray(2), '\u001b[A', '\n');
    await expect(line).resolves.toBe('abmật');
  });

  it('ignores SS3 (ESC O x) application-mode keys and CSI sequences with parameters', async () => {
    const tty = new FakeTty();
    const line = readHiddenLine(tty, new Capture(), '');
    tty.type('a', '\u001bOA', 'b', '\u001bOP', '\u001b[1;5C', 'c', '\r');
    await expect(line).resolves.toBe('abc');
  });

  it('cancels on Ctrl+C and on Ctrl+D with empty input', async () => {
    const first = new FakeTty();
    const cancelled = readHiddenLine(first, new Capture(), '');
    first.type('partial\u0003');
    await expect(cancelled).rejects.toBeInstanceOf(PromptCancelled);
    expect(first.isRaw).toBe(false);

    const second = new FakeTty();
    const eof = readHiddenLine(second, new Capture(), '');
    second.type('\u0004');
    await expect(eof).rejects.toBeInstanceOf(PromptCancelled);
  });
});

describe('readPasswordFromStdin', () => {
  it('reads until end of input and removes exactly one trailing line break', async () => {
    await expect(readPasswordFromStdin(Readable.from(['synthetic ', 'secret\n']))).resolves.toBe(
      'synthetic secret',
    );
    await expect(readPasswordFromStdin(Readable.from(['synthetic secret\r\n']))).resolves.toBe(
      'synthetic secret',
    );
    await expect(readPasswordFromStdin(Readable.from(['  spaced  \n\n']))).resolves.toBe(
      '  spaced  \n',
    );
  });

  it('refuses oversized or invalid UTF-8 input', async () => {
    await expect(readPasswordFromStdin(Readable.from(['x'.repeat(5000)]))).rejects.toThrow(
      /exceeds/,
    );
    await expect(
      readPasswordFromStdin(Readable.from([Buffer.from([0xff, 0xfe])])),
    ).rejects.toThrow();
  });
});

describe('createLocalAdmin race handling (no database)', () => {
  it('turns a unique-index violation between check and insert into the duplicate refusal', async () => {
    const { createLocalAdmin, DUPLICATE_EMAIL_MESSAGE } =
      await import('../../apps/api/src/cli/admin-create-core.js');
    const { PasswordHasher } = await import('../../apps/api/src/modules/auth/password-hasher.js');
    const store = {
      user: { findUnique: async () => null },
      $transaction: async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      },
    };
    await expect(
      createLocalAdmin(
        store as never,
        {
          email: 'p1-race@example.invalid',
          displayName: 'Synthetic',
          password: 'synthetic race passphrase',
        },
        { hasher: new PasswordHasher(), clock: { now: () => new Date() }, requestId: 'r' },
      ),
    ).rejects.toThrow(DUPLICATE_EMAIL_MESSAGE);
  });
});
