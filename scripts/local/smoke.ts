// yarn smoke:local — deterministic, non-interactive local smoke test (P0-E). No external requests.
//
//  1. Local MySQL reachable/healthy: Docker health of the compose service when Docker is present,
//     and a real query through the runtime account (DATABASE_URL, tb_dev) on the loopback dev schema.
//  2. `yarn build`: Prisma client generation, contracts, API and the web production bundle.
//  3. Start the compiled API on 127.0.0.1:3000 and `vite preview` of the built web on 127.0.0.1:5173.
//  4. Request through http://localhost: web shell, its script bundle, and /api/v1/health both
//     directly and through the web proxy; health must validate against the ACTIVE contract
//     (GetHealthResponseSchema) with status "ok" and Cache-Control: no-store.
//  5. Terminate both processes (SIGTERM, bounded wait, SIGKILL fallback) and verify ports 3000 and
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
    !code.includes('/api/v1/health')
  ) {
    fail(`web shell: script bundle ${script} missing or unexpected (HTTP ${bundle.status})`);
  }
  pass(`web shell served on http://localhost:${WEB_PORT}/ with bundle ${script}`);
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
