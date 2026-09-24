// yarn smoke:directory --email <email> < password — P2 directory round trip against the COMPILED
// API, for CI only.
//
// It writes directory records (one synthetic Agency, created and then deleted) and leaves their
// append-only audit events and idempotency records in the target database, so it refuses to run
// unless CI=true: CI's tb_notice_dev is disposable, the operator's is not. The account is the
// synthetic CI admin created by `yarn admin:create`; the password is read from standard input.
// Requires a prior `yarn build`. No external requests; port 3000 is released at the end.
//
// Steps (every response is checked against the ACTIVE contract and for Cache-Control: no-store):
//   login → create (201, ETag v1) → exact replay with the same Idempotency-Key (same result, no
//   second record) → GET (same ETag) → PATCH without If-Match (428) → PATCH with a stale ETag (412)
//   → PATCH with the current ETag (200, v2) → search → archive (v3) → restore (v4, DRAFT) → delete
//   (204) → GET (404) → deferred canonical binding (404, not routed) → logout.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
  console.log(`[smoke:directory] PASS ${message}`);
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

interface Parser {
  safeParse(value: unknown): { success: boolean };
}

async function main(): Promise<void> {
  if (process.env['CI'] !== 'true') {
    fail(
      'smoke:directory writes directory records into the target database; it runs only in CI ' +
        '(CI=true) against the disposable CI database',
    );
  }
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
  const contracts = await import('../../packages/contracts/dist/index.js');

  api = spawn(process.execPath, [entry], { cwd: path.join(repoRoot, 'apps/api'), stdio: 'ignore' });
  api.on('exit', () => {
    exited = true;
  });
  for (let waited = 0; !(await listening(3000)); waited += 250) {
    if (exited || waited > 30_000) fail('compiled API did not start');
    await sleep(250);
  }

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'X-Requested-With': 'TB-APP', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = contracts.LoginResponseSchema.safeParse(await login.json());
  if (login.status !== 200 || !loginBody.success) fail(`login: HTTP ${login.status}`);
  const cookieHeader = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('tb_session_dev='));
  if (!cookieHeader) fail('login set no session cookie');
  const cookie = cookieHeader.split(';')[0] ?? '';
  const csrf = loginBody.data.data.csrfToken;
  pass('login → 200 with a session cookie and CSRF token');

  async function call(
    label: string,
    method: string,
    route: string,
    expected: number,
    schema: Parser | null,
    options: { body?: unknown; ifMatch?: string; key?: string } = {},
  ): Promise<{ body: unknown; etag: string | null }> {
    const headers: Record<string, string> = { Cookie: cookie, 'X-Requested-With': 'TB-APP' };
    if (method !== 'GET') {
      headers['Origin'] = origin as string;
      headers['X-CSRF-Token'] = csrf;
      headers['Idempotency-Key'] = options.key ?? `p2-ci-${randomUUID()}`;
    }
    if (options.ifMatch !== undefined) headers['If-Match'] = options.ifMatch;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API}${route}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    const body: unknown = text === '' ? undefined : JSON.parse(text);
    if (response.status !== expected) {
      fail(`${label}: expected ${expected}, got ${response.status} ${text.slice(0, 300)}`);
    }
    if (response.headers.get('cache-control') !== 'no-store') fail(`${label}: missing no-store`);
    const checker = schema ?? (expected >= 400 ? contracts.OperationErrorSchema : null);
    if (checker && !checker.safeParse(body).success)
      fail(`${label}: response violates the contract`);
    pass(`${label} → ${expected}`);
    return { body, etag: response.headers.get('etag') };
  }

  const name = `P2 CI synthetic agency ${randomUUID().slice(0, 8)} (disposable)`;
  const createKey = `p2-ci-create-${randomUUID()}`;
  const created = await call(
    'POST /agencies',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    {
      body: { displayName: name },
      key: createKey,
    },
  );
  const agency = (created.body as { data: { id: string; recordState: string } }).data;
  if (agency.recordState !== 'DRAFT') fail('a new agency must be DRAFT');
  const v1 = `"Agency:${agency.id}:v1"`;
  if (created.etag !== v1) fail(`create ETag ${created.etag}`);
  const replay = await call(
    'POST /agencies (exact replay, same key)',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    {
      body: { displayName: name },
      key: createKey,
    },
  );
  if ((replay.body as { data: { id: string } }).data.id !== agency.id || replay.etag !== v1) {
    fail('the replay did not return the stored result');
  }
  const read = await call(
    'GET /agencies/{id}',
    'GET',
    `/agencies/${agency.id}`,
    200,
    contracts.GetAgencyResponseSchema,
  );
  if (read.etag !== v1) fail('GET ETag differs');
  await call('PATCH without If-Match', 'PATCH', `/agencies/${agency.id}`, 428, null, {
    body: { phone: '0' },
  });
  await call('PATCH with a stale If-Match', 'PATCH', `/agencies/${agency.id}`, 412, null, {
    body: { phone: '0' },
    ifMatch: `"Agency:${agency.id}:v999"`,
  });
  const patched = await call(
    'PATCH with the current If-Match',
    'PATCH',
    `/agencies/${agency.id}`,
    200,
    contracts.PatchAgencyResponseSchema,
    {
      body: { phone: '+00 synthetic' },
      ifMatch: v1,
    },
  );
  const v2 = `"Agency:${agency.id}:v2"`;
  if (patched.etag !== v2) fail(`PATCH ETag ${patched.etag}`);
  const listed = await call(
    'GET /agencies?q=',
    'GET',
    `/agencies?q=${encodeURIComponent(name)}`,
    200,
    contracts.ListAgenciesResponseSchema,
  );
  if (
    !(listed.body as { data: { items: Array<{ id: string }> } }).data.items.some(
      (item) => item.id === agency.id,
    )
  ) {
    fail('search did not find the agency');
  }
  const archived = await call(
    'POST /agencies/{id}/archive',
    'POST',
    `/agencies/${agency.id}/archive`,
    200,
    contracts.ArchiveAgencyResponseSchema,
    {
      body: { reason: 'P2 CI synthetic check' },
      ifMatch: v2,
    },
  );
  const restored = await call(
    'POST /agencies/{id}/restore',
    'POST',
    `/agencies/${agency.id}/restore`,
    200,
    contracts.RestoreAgencyResponseSchema,
    {
      body: { reason: 'P2 CI synthetic check' },
      ifMatch: archived.etag ?? '',
    },
  );
  if ((restored.body as { data: { recordState: string } }).data.recordState !== 'DRAFT')
    fail('restore must return DRAFT');
  await call(
    'DELETE /agencies/{id} (unused draft)',
    'DELETE',
    `/agencies/${agency.id}`,
    204,
    null,
    {
      ifMatch: restored.etag ?? '',
    },
  );
  await call('GET /agencies/{id} after delete', 'GET', `/agencies/${agency.id}`, 404, null);
  await call(
    'POST /agencies/{id}/canonical-bindings (deferred)',
    'POST',
    `/agencies/${agency.id}/canonical-bindings`,
    404,
    null,
    {
      body: { canonicalCode: 'x', sourceId: agency.id, reason: 'x' },
      ifMatch: v1,
    },
  );
  const logout = await fetch(`${API}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': csrf },
  });
  if (logout.status !== 204) fail(`logout: HTTP ${logout.status}`);
  pass('logout → 204');
}

try {
  await main();
} catch (error) {
  console.error(`[smoke:directory] FAIL ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('[smoke:directory] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:directory] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
