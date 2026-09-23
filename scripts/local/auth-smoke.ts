// yarn smoke:auth --email <email> < password — P1 login round trip against the COMPILED API.
//
// For an account that already exists (CI creates a synthetic one with `yarn admin:create
// --password-stdin` in its disposable tb_notice_dev). The password is read from standard input,
// never from arguments. Requires a prior `yarn build` (smoke:local builds). Steps:
//   login from the allowed origin → 200 LoginResponse + tb_session_dev cookie attributes;
//   GET /auth/session → 200 with the same CSRF token; logout with X-CSRF-Token → 204 + cleared
//   cookie; GET /auth/session with the old cookie → 401. Writes one session row and two audit
//   events for that account. No external requests; ports are released at the end.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { argValue, repoRoot } from '../contracts/paths.ts';
import { loadRootEnv } from '../db/lib/targets.mjs';

const API = 'http://127.0.0.1:3000/api/v1';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let api: ChildProcess | undefined;
let exited = false;
let checks = 0;

function pass(message: string): void {
  checks += 1;
  console.log(`[smoke:auth] PASS ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.setTimeout(300);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

function sessionCookie(response: Response): { token: string; attributes: string[] } {
  const header = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('tb_session_dev='));
  if (!header) fail('no tb_session_dev cookie was set');
  const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
  return {
    token: pair.slice('tb_session_dev='.length),
    attributes: attributes.map((a) => a.toLowerCase()),
  };
}

async function main(): Promise<void> {
  loadRootEnv();
  const email = argValue(process.argv.slice(2), '--email');
  if (!email) fail('--email is required (the password is read from standard input)');
  const password = await readStdin();
  if (!password) fail('no password on standard input');
  const origin = (process.env['TB_ALLOWED_WEB_ORIGINS'] ?? '').split(',')[0]?.trim();
  if (!origin) fail('TB_ALLOWED_WEB_ORIGINS is not set; run yarn env:init');
  const entry = path.join(repoRoot, 'apps/api/dist/src/main.js');
  if (!existsSync(entry)) fail('compiled API missing; run yarn build first');
  if (await listening(3000)) fail('port 3000 is already in use');
  const { GetSessionResponseSchema, LoginResponseSchema } =
    await import('../../packages/contracts/dist/index.js');

  api = spawn(process.execPath, [entry], { cwd: path.join(repoRoot, 'apps/api'), stdio: 'ignore' });
  api.on('exit', () => {
    exited = true;
  });
  for (let waited = 0; !(await listening(3000)); waited += 250) {
    if (exited || waited > 30_000) fail('compiled API did not start');
    await sleep(250);
  }

  const loginResponse = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'X-Requested-With': 'TB-APP', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = LoginResponseSchema.safeParse(await loginResponse.json());
  if (loginResponse.status !== 200 || !loginBody.success)
    fail(`login: HTTP ${loginResponse.status}`);
  const { token, attributes } = sessionCookie(loginResponse);
  for (const expected of ['httponly', 'samesite=strict', 'path=/']) {
    if (!attributes.includes(expected)) fail(`cookie attribute ${expected} missing`);
  }
  if (attributes.some((a) => a === 'secure' || a.startsWith('domain'))) {
    fail('cookie must have neither Secure (loopback dev) nor Domain');
  }
  if (loginBody.data.data.csrfToken === token) fail('CSRF token equals the session token');
  pass(
    'login → 200 LoginResponse, tb_session_dev HttpOnly SameSite=Strict Path=/, no Domain/Secure',
  );

  const cookie = { Cookie: `tb_session_dev=${token}` };
  const session = await fetch(`${API}/auth/session`, { headers: cookie });
  const sessionBody = GetSessionResponseSchema.safeParse(await session.json());
  if (session.status !== 200 || !sessionBody.success) fail(`session: HTTP ${session.status}`);
  if (sessionBody.data.data.csrfToken !== loginBody.data.data.csrfToken) fail('CSRF token changed');
  if (session.headers.get('cache-control') !== 'no-store') fail('session: missing no-store');
  pass('GET /auth/session → 200 with the same session-bound CSRF token, no-store');

  const logout = await fetch(`${API}/auth/logout`, {
    method: 'POST',
    headers: { ...cookie, Origin: origin, 'X-CSRF-Token': sessionBody.data.data.csrfToken },
  });
  const cleared = logout.headers
    .getSetCookie()
    .some((value) => /^tb_session_dev=;.*Max-Age=0/.test(value));
  if (logout.status !== 204 || !cleared) fail(`logout: HTTP ${logout.status}, cleared=${cleared}`);
  pass('POST /auth/logout with X-CSRF-Token → 204 and cookie cleared');

  const after = await fetch(`${API}/auth/session`, { headers: cookie });
  if (after.status !== 401) fail(`old cookie after logout: HTTP ${after.status}`);
  pass('old cookie after logout → 401');
}

try {
  await main();
} catch (error) {
  console.error(`[smoke:auth] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (api && !exited) {
    api.kill('SIGTERM');
    for (let waited = 0; !exited && waited < 10_000; waited += 100) await sleep(100);
    if (!exited) {
      api.kill('SIGKILL');
      process.exitCode = 1;
    }
  }
  if (api && (await listening(3000))) {
    console.error('[smoke:auth] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:auth] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
