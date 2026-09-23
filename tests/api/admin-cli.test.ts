// admin:create CLI pieces that need no database: argument parsing, hidden TTY input and
// --password-stdin reading. (Database behaviour: tests/db/admin-create.test.ts.)
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { parseAdminCreateArgs } from '../../apps/api/src/cli/admin-create-args.js';
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

describe('parseAdminCreateArgs', () => {
  it('parses flags in both forms', () => {
    expect(parseAdminCreateArgs([])).toEqual({ passwordStdin: false, help: false });
    expect(
      parseAdminCreateArgs([
        '--email',
        'a@b.co',
        '--display-name=Synthetic Operator',
        '--password-stdin',
      ]),
    ).toEqual({
      email: 'a@b.co',
      displayName: 'Synthetic Operator',
      passwordStdin: true,
      help: false,
    });
    expect(parseAdminCreateArgs(['--help']).help).toBe(true);
  });

  it('never accepts a password argument and never echoes unexpected values', () => {
    expect(() => parseAdminCreateArgs(['--password', 'synthetic-secret-value'])).toThrow(
      /never accepted on the command line/,
    );
    expect(() => parseAdminCreateArgs(['--password=synthetic-secret-value'])).toThrow(
      /never accepted on the command line/,
    );
    let message = '';
    try {
      parseAdminCreateArgs(['synthetic-secret-value']);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('unexpected positional argument (not echoed)');
    expect(() => parseAdminCreateArgs(['--email'])).toThrow(/requires a value/);
    expect(() => parseAdminCreateArgs(['--unknown'])).toThrow(/unknown option/);
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
