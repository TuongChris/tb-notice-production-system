// yarn ui:sandbox --password-file <path> — a disposable local UI sandbox for manual or browser-
// automation checks of the Directory, Sources and Routes pages (P2, P3A) WITHOUT touching
// tb_notice_dev.
//
//  1. Guards: the target is the allowlisted disposable tb_notice_test schema (tooling account,
//     loopback port 3307, never tb_notice_dev); every table the sandbox can write must be empty
//     (it fails closed, like the database test suites); ports 3000 and 5173 must be free.
//  2. `yarn build`, then the COMPILED AppModule runs in-process on 127.0.0.1:3000 with Prisma pointed
//     at tb_notice_test (the real auth, guard, origin/CSRF policy, write layer and directory code) and
//     `vite preview` serves the built web app on 127.0.0.1:5173 (proxying /api).
//  3. One synthetic application User is created. Its generated password is written only to the
//     given file (mode 600, outside the repository); it is never printed.
//  4. On Ctrl+C / SIGTERM (or any failure) both servers stop and every row the sandbox could have
//     written is deleted in foreign-key order; the tables are verified empty again.
// No external request is made. The account is a synthetic sandbox login, not a Signer.
import 'reflect-metadata';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { argValue, repoRoot } from '../contracts/paths.ts';
import { driverConfig, loadRootEnv, resolveTarget } from '../db/lib/targets.mjs';

const API_PORT = 3000;
const WEB_PORT = 5173;
const SANDBOX_EMAIL = 'p2-ui-sandbox@example.invalid';
/**
 * Every table the running app can write (P2 directory, P3A sources and routes), in foreign-key
 * deletion order. Source references and the records that point at them reference each other
 * (canonical bindings, revision chains), so those pointers are cleared first (see cleanup).
 */
const TABLES = [
  'idempotency_records',
  'audit_events',
  'routes',
  'owner_subjects',
  'signers',
  'legal_subjects',
  'owners',
  'source_references',
  'agencies',
  'auth_sessions',
  'users',
] as const;

/** Source pointers cleared before deleting rows (canonical bindings, citations, revision chains). */
const SOURCE_POINTERS = [
  'UPDATE `agencies` SET `canonical_source_id` = NULL',
  'UPDATE `owners` SET `canonical_source_id` = NULL',
  'UPDATE `legal_subjects` SET `canonical_source_id` = NULL',
  'UPDATE `signers` SET `canonical_source_id` = NULL, `identity_source_id` = NULL, `delegation_source_id` = NULL',
  'UPDATE `routes` SET `canonical_source_id` = NULL',
  'UPDATE `owner_subjects` SET `source_id` = NULL',
  'UPDATE `source_references` SET `supersedes_source_id` = NULL',
] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message: string): void {
  console.log(`[ui:sandbox] ${message}`);
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

// Compiled modules are loaded by path at run time (they exist only after `yarn build`).
const load = (relative: string) =>
  import(pathToFileURL(path.join(repoRoot, relative)).href) as Promise<Record<string, any>>;

interface SandboxPrisma {
  $queryRawUnsafe<T>(sql: string): Promise<T>;
  $executeRawUnsafe(sql: string): Promise<number>;
  $disconnect(): Promise<void>;
  user: { create(args: unknown): Promise<{ id: string }> };
}

async function countRows(prisma: SandboxPrisma, table: string): Promise<number> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM \`${table}\``,
  );
  return Number(row?.n ?? -1);
}

async function assertEmpty(prisma: SandboxPrisma, when: string): Promise<void> {
  const [session] = await prisma.$queryRawUnsafe<Array<{ db: string }>>('SELECT DATABASE() AS db');
  if (session?.db !== 'tb_notice_test')
    throw new Error(`connected to ${session?.db}, not tb_notice_test`);
  const nonEmpty: string[] = [];
  for (const table of TABLES) {
    const count = await countRows(prisma, table);
    if (count !== 0) nonEmpty.push(`${table}=${count}`);
  }
  if (nonEmpty.length > 0) {
    throw new Error(`tb_notice_test is not empty ${when} (${nonEmpty.join(', ')}); refusing`);
  }
}

async function cleanup(prisma: SandboxPrisma): Promise<void> {
  for (const statement of SOURCE_POINTERS) await prisma.$executeRawUnsafe(statement);
  for (const table of TABLES) await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
}

async function main(): Promise<void> {
  loadRootEnv();
  const passwordFile = argValue(process.argv.slice(2), '--password-file');
  if (!passwordFile) throw new Error('--password-file <path outside the repository> is required');
  const passwordPath = path.resolve(passwordFile);
  if (passwordPath.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error('--password-file must be outside the repository');
  }
  const target = resolveTarget('test', ['test']);
  log(`database target: ${target.label}`);
  for (const port of [API_PORT, WEB_PORT]) {
    if (await listening(port)) throw new Error(`port ${port} is already in use`);
  }
  log('building (yarn build)…');
  const build = spawnSync('yarn', ['build'], { cwd: repoRoot, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('yarn build failed');

  const { PrismaClient } = await load('apps/api/dist/generated/prisma/client.js');
  const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb({ ...driverConfig(target), connectionLimit: 5 }),
  }) as SandboxPrisma;

  let app: { close(): Promise<void> } | undefined;
  let web: ChildProcess | undefined;
  let stopping = false;
  const stop = async (code: number) => {
    if (stopping) return;
    stopping = true;
    log('stopping…');
    if (web && web.exitCode === null) {
      web.kill('SIGTERM');
      for (let waited = 0; web.exitCode === null && waited < 5000; waited += 100) await sleep(100);
      if (web.exitCode === null) web.kill('SIGKILL');
    }
    await app?.close().catch(() => undefined);
    try {
      await cleanup(prisma);
      await assertEmpty(prisma, 'after cleanup');
      log('sandbox rows deleted; tb_notice_test is empty again');
    } catch (error) {
      console.error(
        `[ui:sandbox] cleanup FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
      code = 1;
    }
    await prisma.$disconnect();
    process.exit(code);
  };
  process.on('SIGINT', () => void stop(0));
  process.on('SIGTERM', () => void stop(0));

  try {
    await assertEmpty(prisma, 'before start');
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await load('apps/api/dist/src/app.module.js');
    const { PrismaService } = await load(
      'apps/api/dist/src/infrastructure/database/prisma.service.js',
    );
    const { configureApp } = await load('apps/api/dist/src/infrastructure/http/configure-app.js');
    const { PasswordHasher } = await load('apps/api/dist/src/modules/auth/password-hasher.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    const nest = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(nest);
    await nest.listen(API_PORT, '127.0.0.1');
    app = nest;
    log(`compiled API on http://127.0.0.1:${API_PORT}/api/v1 (database: tb_notice_test)`);

    const password = randomBytes(24).toString('base64url');
    await prisma.user.create({
      data: {
        email: SANDBOX_EMAIL,
        displayName: 'P2 UI sandbox user (synthetic, disposable)',
        passwordHash: await new PasswordHasher().hash(password),
        enabled: true,
      },
    });
    writeFileSync(passwordPath, `${password}\n`, { mode: 0o600 });
    log(`synthetic user ${SANDBOX_EMAIL}; password written to ${passwordPath} (mode 600)`);

    const vite = path.join(repoRoot, 'node_modules/vite/bin/vite.js');
    if (!existsSync(vite)) throw new Error('vite is not installed');
    web = spawn(process.execPath, [vite, 'preview'], {
      cwd: path.join(repoRoot, 'apps/web'),
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    for (let waited = 0; !(await listening(WEB_PORT)); waited += 250) {
      if (waited > 30_000 || web.exitCode !== null) throw new Error('vite preview did not start');
      await sleep(250);
    }
    log(`web app on http://localhost:${WEB_PORT}/ and http://127.0.0.1:${WEB_PORT}/`);
    log('press Ctrl+C to stop and delete every sandbox row');
  } catch (error) {
    console.error(`[ui:sandbox] FAIL ${error instanceof Error ? error.message : String(error)}`);
    await stop(1);
  }
}

try {
  await main();
} catch (error) {
  console.error(`[ui:sandbox] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
