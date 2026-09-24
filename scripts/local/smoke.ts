// yarn smoke:local — deterministic, non-interactive local smoke test (P0-E). No external requests.
//
//  1. Local MySQL reachable/healthy: Docker health of the compose service when Docker is present,
//     and a real query through the runtime account (DATABASE_URL, tb_dev) on the loopback dev schema.
//  2. `yarn build`: Prisma client generation, contracts, API and the web production bundle.
//  3. Start the compiled API on 127.0.0.1:3000 and `vite preview` of the built web on 127.0.0.1:5173.
//  4. Request through http://localhost: web shell, its script bundle, and /api/v1/health both
//     directly and through the web proxy; health must validate against the ACTIVE contract
//     (GetHealthResponseSchema) with status "ok" and Cache-Control: no-store.
//  5. P1 auth boundary of the compiled API, read-only (no user is created; a failed login writes
//     nothing): no-cookie session → 401, login without Origin → 403, login from the allowed origin
//     for a synthetic unknown account → generic 403 (runs Argon2id in the compiled process), logout
//     without a session → 401, proxied session check → 401 without CORS headers. Every response is
//     a valid contract OperationError with Cache-Control: no-store.
//  6. Business boundary of the compiled API, read-only: every directory (P2), source and route
//     (P3A) and representation-authority (P3B) collection is routed and session-protected (no
//     cookie → 401, also through the web proxy), unsafe writes without Origin → 403 before any
//     handler, canonical bindings and freezes are session-protected, and Case operations (a later
//     phase) are not routed (404).
//  7. Terminate both processes (SIGTERM, bounded wait, SIGKILL fallback) and verify ports 3000 and
//     5173 are released. Any failure exits non-zero.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import path from 'node:path';
import { createConnection } from 'mariadb';
import { assertLocalTarget } from '../db/allowlist.mjs';
import { repoRoot } from '../contracts/paths.ts';
import { loadRootEnv } from '../db/lib/targets.mjs';

const API_PORT = 3000;
const WEB_PORT = 5173;
const COMPOSE_CONTAINER_SERVICE = 'mysql';
const node = process.execPath;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const children: Array<{ name: string; process: ChildProcess; exited: boolean }> = [];
const checks: string[] = [];

function pass(message: string): void {
  checks.push(message);
  console.log(`[smoke] PASS ${message}`);
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

function run(label: string, command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) fail(`${label} failed (exit ${result.status ?? result.signal})`);
  pass(label);
}

async function checkDatabase(): Promise<void> {
  const docker = spawnSync(
    'docker',
    ['compose', 'ps', '--format', '{{.Health}}', COMPOSE_CONTAINER_SERVICE],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  if (docker.status === 0) {
    const health = docker.stdout.trim();
    if (health !== 'healthy')
      fail(
        `compose service "${COMPOSE_CONTAINER_SERVICE}" is not healthy (got "${health || 'not running'}"); run yarn db:up`,
      );
    pass('MySQL compose service is healthy');
  } else {
    console.log('[smoke] docker compose not available; relying on the direct database query');
  }
  const raw = process.env['DATABASE_URL'];
  const target = assertLocalTarget('DATABASE_URL', raw, {
    expectedSchema: 'tb_notice_dev',
    forbidUser: 'tb_migrate',
  });
  const url = new URL(raw as string);
  const conn = await createConnection({
    host: url.hostname,
    port: Number(url.port),
    user: target.user,
    password: decodeURIComponent(url.password),
    database: target.schema,
    connectTimeout: 5000,
    allowPublicKeyRetrieval: true,
  });
  try {
    const [row] = (await conn.query(
      'SELECT VERSION() AS version, DATABASE() AS db, CURRENT_USER() AS user',
    )) as Array<{
      version: string;
      db: string;
      user: string;
    }>;
    if (!row?.version.startsWith('8.4.') || row.db !== 'tb_notice_dev')
      fail(`unexpected database ${JSON.stringify(row)}`);
    pass(`database reachable as ${row.user} on ${row.db} (MySQL ${row.version})`);
  } finally {
    await conn.end();
  }
}

function start(name: string, args: string[], cwd: string): void {
  const child = spawn(node, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = { name, process: child, exited: false };
  child.on('exit', () => {
    entry.exited = true;
  });
  const log = (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split(/\r?\n/))
      if (line) console.log(`[smoke:${name}] ${line}`);
  };
  child.stdout?.on('data', log);
  child.stderr?.on('data', log);
  children.push(entry);
}

async function waitForPort(port: number, name: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (await listening(port)) {
      pass(`${name} listening on 127.0.0.1:${port}`);
      return;
    }
    if (children.find((c) => c.name === name)?.exited) fail(`${name} exited before listening`);
    await sleep(250);
  }
  fail(`${name} did not listen on port ${port} within 60 s`);
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  return response;
}

async function checkHealth(url: string, label: string): Promise<void> {
  // Imported after the build step so a fresh clone works; this is the ACTIVE contract schema.
  const { GetHealthResponseSchema } = await import('../../packages/contracts/dist/index.js');
  const response = await get(url);
  if (response.status !== 200) fail(`${label}: HTTP ${response.status}`);
  if (response.headers.get('cache-control') !== 'no-store')
    fail(`${label}: Cache-Control is ${response.headers.get('cache-control')}`);
  const body: unknown = await response.json();
  const parsed = GetHealthResponseSchema.safeParse(body);
  if (!parsed.success)
    fail(`${label}: response violates GetHealthResponse: ${JSON.stringify(parsed.error.issues)}`);
  if (parsed.data.data.status !== 'ok')
    fail(`${label}: health status is ${parsed.data.data.status}`);
  pass(`${label}: 200, no-store, valid GetHealthResponse, status ok`);
}

async function checkWeb(): Promise<void> {
  const response = await get(`http://localhost:${WEB_PORT}/`);
  if (response.status !== 200) fail(`web shell: HTTP ${response.status}`);
  const html = await response.text();
  if (
    !html.includes('<title>TB Notice Production System</title>') ||
    !html.includes('<div id="root"></div>')
  ) {
    fail('web shell: unexpected HTML');
  }
  const script = /<script type="module" crossorigin src="([^"]+)"><\/script>/.exec(html)?.[1];
  if (!script) fail('web shell: no module script reference');
  const bundle = await get(`http://localhost:${WEB_PORT}${script}`);
  const code = await bundle.text();
  if (
    bundle.status !== 200 ||
    !code.includes('TB Notice Production System') ||
    !code.includes('/api/v1/health') ||
    !code.includes('/api/v1/auth/session') ||
    !code.includes('/api/v1/agencies') ||
    !code.includes('/api/v1/owner-subjects/')
  ) {
    fail(`web shell: script bundle ${script} missing or unexpected (HTTP ${bundle.status})`);
  }
  pass(`web shell served on http://localhost:${WEB_PORT}/ with bundle ${script}`);
}

async function checkAuthBoundary(): Promise<void> {
  const { OperationErrorSchema } = await import('../../packages/contracts/dist/index.js');
  const origin = (process.env['TB_ALLOWED_WEB_ORIGINS'] ?? '').split(',')[0]?.trim() ?? '';
  if (!origin) fail('TB_ALLOWED_WEB_ORIGINS is not set; run yarn env:init');
  const api = `http://localhost:${API_PORT}/api/v1`;
  const loginBody = JSON.stringify({
    email: 'p1-smoke-nobody@example.invalid',
    password: 'synthetic-smoke-password-not-a-credential',
  });
  const cases: Array<[string, string, RequestInit, number, string]> = [
    ['GET /auth/session without a cookie', `${api}/auth/session`, {}, 401, 'SESSION_REQUIRED'],
    [
      'POST /auth/login without Origin',
      `${api}/auth/login`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: loginBody },
      403,
      'ORIGIN_REJECTED',
    ],
    [
      'POST /auth/login for a synthetic unknown account',
      `${api}/auth/login`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'X-Requested-With': 'TB-APP',
          'Content-Type': 'application/json',
        },
        body: loginBody,
      },
      403,
      'INVALID_CREDENTIALS',
    ],
    [
      'POST /auth/logout without a session',
      `${api}/auth/logout`,
      { method: 'POST', headers: { Origin: origin } },
      401,
      'SESSION_REQUIRED',
    ],
    [
      'GET /auth/session through the web proxy',
      `http://localhost:${WEB_PORT}/api/v1/auth/session`,
      { headers: { Origin: origin } },
      401,
      'SESSION_REQUIRED',
    ],
  ];
  for (const [label, url, init, status, code] of cases) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    const body: unknown = await response.json();
    const parsed = OperationErrorSchema.safeParse(body);
    if (response.status !== status || !parsed.success || parsed.data.error.code !== code) {
      fail(`${label}: expected ${status} ${code}, got ${response.status} ${JSON.stringify(body)}`);
    }
    if (response.headers.get('cache-control') !== 'no-store') fail(`${label}: missing no-store`);
    const cors = [...response.headers.keys()].filter((name) => name.startsWith('access-control-'));
    if (cors.length > 0) fail(`${label}: unexpected CORS headers ${cors.join(', ')}`);
    pass(`auth boundary: ${label} → ${status} ${code}, no-store, no CORS`);
  }
}

async function stopAll(): Promise<void> {
  for (const child of children) if (!child.exited) child.process.kill('SIGTERM');
  const started = Date.now();
  while (children.some((c) => !c.exited) && Date.now() - started < 10_000) await sleep(100);
  for (const child of children) {
    if (!child.exited) {
      console.error(`[smoke] ${child.name} did not stop within 10 s; killing`);
      child.process.kill('SIGKILL');
      process.exitCode = 1;
    }
  }
  await sleep(300);
}

async function main(): Promise<void> {
  loadRootEnv();
  for (const port of [API_PORT, WEB_PORT]) {
    if (await listening(port))
      fail(`port ${port} is already in use; stop the running process first`);
  }
  await checkDatabase();
  run('Prisma client, contracts, API and web built (yarn build)', 'yarn', ['build']);
  start('api', [path.join(repoRoot, 'apps/api/dist/src/main.js')], path.join(repoRoot, 'apps/api'));
  start(
    'web',
    [path.join(repoRoot, 'node_modules/vite/bin/vite.js'), 'preview'],
    path.join(repoRoot, 'apps/web'),
  );
  await waitForPort(API_PORT, 'api');
  await waitForPort(WEB_PORT, 'web');
  await checkHealth(`http://localhost:${API_PORT}/api/v1/health`, 'API /api/v1/health');
  await checkHealth(`http://localhost:${WEB_PORT}/api/v1/health`, 'web proxy /api/v1/health');
  await checkWeb();
  await checkAuthBoundary();
  await checkBusinessBoundary();
}

async function checkBusinessBoundary(): Promise<void> {
  const { OperationErrorSchema } = await import('../../packages/contracts/dist/index.js');
  const origin = (process.env['TB_ALLOWED_WEB_ORIGINS'] ?? '').split(',')[0]?.trim() ?? '';
  const api = `http://localhost:${API_PORT}/api/v1`;
  const id = '00000000-0000-4000-8000-00000000c0de';
  const json = { 'Content-Type': 'application/json' };
  const cases: Array<[string, string, RequestInit, number, string]> = [
    ['GET /agencies without a session', `${api}/agencies`, {}, 401, 'SESSION_REQUIRED'],
    ['GET /owners without a session', `${api}/owners`, {}, 401, 'SESSION_REQUIRED'],
    ['GET /legal-subjects without a session', `${api}/legal-subjects`, {}, 401, 'SESSION_REQUIRED'],
    ['GET /signers without a session', `${api}/signers`, {}, 401, 'SESSION_REQUIRED'],
    [
      'GET /owners/{ownerId}/subjects without a session',
      `${api}/owners/${id}/subjects`,
      {},
      401,
      'SESSION_REQUIRED',
    ],
    [
      'GET /owner-subjects/{id} through the web proxy without a session',
      `http://localhost:${WEB_PORT}/api/v1/owner-subjects/${id}`,
      {},
      401,
      'SESSION_REQUIRED',
    ],
    [
      'POST /agencies without Origin',
      `${api}/agencies`,
      { method: 'POST', headers: json, body: '{"displayName":"x"}' },
      403,
      'ORIGIN_REJECTED',
    ],
    [
      'POST /agencies/{id}/canonical-bindings without a session',
      `${api}/agencies/${id}/canonical-bindings`,
      { method: 'POST', headers: { ...json, Origin: origin }, body: '{}' },
      401,
      'SESSION_REQUIRED',
    ],
    // P3A: sources and routes are session-protected like the directory.
    ['GET /sources without a session', `${api}/sources`, {}, 401, 'SESSION_REQUIRED'],
    [
      'POST /sources/{id}/revisions without a session',
      `${api}/sources/${id}/revisions`,
      { method: 'POST', headers: { ...json, Origin: origin }, body: '{}' },
      401,
      'SESSION_REQUIRED',
    ],
    [
      'GET /routes through the web proxy without a session',
      `http://localhost:${WEB_PORT}/api/v1/routes`,
      {},
      401,
      'SESSION_REQUIRED',
    ],
    [
      'POST /routes without Origin',
      `${api}/routes`,
      { method: 'POST', headers: json, body: '{}' },
      403,
      'ORIGIN_REJECTED',
    ],
    [
      'POST /routes/{id}/canonical-bindings without a session',
      `${api}/routes/${id}/canonical-bindings`,
      { method: 'POST', headers: { ...json, Origin: origin }, body: '{}' },
      401,
      'SESSION_REQUIRED',
    ],
    // P3B: mandates, versions, coverages and coverage signers are session-protected too.
    ['GET /mandates without a session', `${api}/mandates`, {}, 401, 'SESSION_REQUIRED'],
    [
      'POST /mandates/{id}/versions without a session',
      `${api}/mandates/${id}/versions`,
      { method: 'POST', headers: { ...json, Origin: origin }, body: '{}' },
      401,
      'SESSION_REQUIRED',
    ],
    [
      'POST /mandate-versions/{id}/freeze without Origin',
      `${api}/mandate-versions/${id}/freeze`,
      { method: 'POST', headers: json, body: '{}' },
      403,
      'ORIGIN_REJECTED',
    ],
    [
      'GET /coverages/{id}/signers through the web proxy without a session',
      `http://localhost:${WEB_PORT}/api/v1/coverages/${id}/signers`,
      {},
      401,
      'SESSION_REQUIRED',
    ],
    [
      'GET /mandates/{id}/events without a session',
      `${api}/mandates/${id}/events`,
      {},
      401,
      'SESSION_REQUIRED',
    ],
    // Cases are a later phase: not routed at all.
    [
      'POST /cases (Case phase, not routed)',
      `${api}/cases`,
      { method: 'POST', headers: { ...json, Origin: origin }, body: '{}' },
      404,
      'NOT_FOUND',
    ],
  ];
  for (const [label, url, init, status, code] of cases) {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    const body: unknown = await response.json();
    const parsed = OperationErrorSchema.safeParse(body);
    if (response.status !== status || !parsed.success || parsed.data.error.code !== code) {
      fail(`${label}: expected ${status} ${code}, got ${response.status} ${JSON.stringify(body)}`);
    }
    if (response.headers.get('cache-control') !== 'no-store') fail(`${label}: missing no-store`);
    pass(`business boundary: ${label} → ${status} ${code}, no-store`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`[smoke] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await stopAll();
  const busy: number[] = [];
  // Only ports this run bound are checked (a pre-existing listener is reported by main()).
  if (children.length > 0) {
    for (const port of [API_PORT, WEB_PORT]) if (await listening(port)) busy.push(port);
  }
  if (busy.length > 0) {
    console.error(`[smoke] FAIL ports still in use after shutdown: ${busy.join(', ')}`);
    process.exitCode = 1;
  } else if (children.length > 0) {
    pass('processes stopped; ports 3000 and 5173 released');
  }
  console.log(`[smoke] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks.length} checks)`);
}
