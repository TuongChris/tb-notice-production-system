// Terminal input for the local admin CLI. Passwords are read either from an interactive TTY with
// echo disabled, or from standard input (`--password-stdin`); never from arguments or environment
// variables, which leak through shell history and process listings.
import { createInterface } from 'node:readline/promises';
import { StringDecoder } from 'node:string_decoder';

export class PromptCancelled extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptCancelled';
  }
}

/** The subset of a TTY read stream used here (tests pass a fake). */
export interface TtyInput {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  setRawMode(mode: boolean): unknown;
  on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  off(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

export interface TextOutput {
  write(text: string): unknown;
}

/**
 * Reads one line from a raw-mode TTY without echoing any character. Enter finishes; Backspace
 * deletes one character; Ctrl+C, or Ctrl+D on an empty line, cancels. Escape sequences (CSI and
 * SS3, e.g. arrow and function keys) and other control characters are ignored.
 */
export function readHiddenLine(
  input: TtyInput,
  output: TextOutput,
  prompt: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder('utf8');
    const characters: string[] = [];
    const wasRaw = input.isRaw === true;
    let escape: 'none' | 'start' | 'csi' | 'ss3' = 'none';
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      input.off('data', onData);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(characters.join(''));
    };

    const onData = (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
      for (const character of text) {
        if (settled) return;
        if (escape === 'start') {
          escape = character === '[' ? 'csi' : character === 'O' ? 'ss3' : 'none';
          continue;
        }
        if (escape === 'ss3') {
          escape = 'none'; // ESC O <final>: application-mode cursor and function keys
          continue;
        }
        if (escape === 'csi') {
          if (character >= '@' && character <= '~') escape = 'none';
          continue;
        }
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u0003') return finish(new PromptCancelled('cancelled (Ctrl+C)'));
        if (character === '\u0004') {
          if (characters.length === 0)
            return finish(new PromptCancelled('cancelled (end of input)'));
          continue;
        }
        if (character === '\u007f' || character === '\b') {
          characters.pop();
          continue;
        }
        if (character === '\u001b') {
          escape = 'start';
          continue;
        }
        if (character < ' ') continue;
        characters.push(character);
      }
    };

    output.write(prompt);
    input.setRawMode(true);
    input.on('data', onData);
    input.resume();
  });
}

/** Reads one visible line (email, display name) from an interactive terminal. */
export async function readVisibleLine(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  prompt: string,
): Promise<string> {
  const lines = createInterface({ input, output, terminal: true });
  try {
    return await lines.question(prompt);
  } finally {
    lines.close();
  }
}

/**
 * Reads the password from non-interactive standard input until end of input. Exactly one trailing
 * line break (LF or CRLF) is removed, like `docker login --password-stdin`; nothing else is trimmed.
 */
export async function readPasswordFromStdin(
  input: AsyncIterable<Buffer | string>,
  maxBytes = 4096,
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    size += bytes.length;
    if (size > maxBytes) throw new PromptCancelled(`standard input exceeds ${maxBytes} bytes`);
    chunks.push(bytes);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  return text.replace(/\r?\n$/, '');
}
