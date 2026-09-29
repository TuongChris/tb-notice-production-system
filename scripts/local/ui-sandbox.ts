// yarn ui:sandbox --password-file <path> — a disposable local UI sandbox for manual or browser-
// automation checks of the Directory, Sources, Routes, representation-authority, Case, case
// intake, Correspondence, Production context, Prompt and Candidate pages with the candidates'
// technical validation and G1–G6 review records (P2, P3A, P3B, P4A, P4B, P4C, P4D, P4E, P4F, P4G,
// P4H) WITHOUT touching tb_notice_dev.
//
//  1. Guards: the target is the allowlisted disposable tb_notice_test schema (tooling account,
//     loopback port 3307, never tb_notice_dev); every table the sandbox can write must be empty
//     (it fails closed, like the database test suites); ports 3000 and 5173 must be free.
//  2. `yarn build`, then the COMPILED AppModule runs in-process on 127.0.0.1:3000 with Prisma pointed
//     at tb_notice_test (the real auth, guard, origin/CSRF policy, write layer and directory code) and
//     `vite preview` serves the built web app on 127.0.0.1:5173 (proxying /api).
//  3. One synthetic application User is created. Its generated password is written only to the
//     given file (mode 600, outside the repository); it is never printed.
//  4. On Ctrl+C / SIGTERM (or any failure) both servers stop. The cleanup is disarmed until this run
//     has verified an empty tb_notice_test itself (sandbox-lifecycle.ts, R14-AUD-004): before that,
//     no row is updated or deleted — a refused guard never cleans up rows that were already there.
//     Once armed, every row the sandbox could have written is deleted in foreign-key order and the
//     tables are verified empty again.
// No external request is made (captured correspondence is only recorded; nothing is sent; the
// production context is a read that writes nothing; prompts and candidates are stored text — no AI
// provider is called, nothing is signed or sent; a validation run is a technical result only, and
// a candidate assessment records one G1–G6 review — nothing is approved, made ready, adopted,
// signed or sent). The account is a synthetic sandbox login, not a Signer.
import 'reflect-metadata';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { argValue, repoRoot } from '../contracts/paths.ts';
import { driverConfig, loadRootEnv, resolveTarget } from '../db/lib/targets.mjs';
import { sandboxLifecycle, stopOnSignals, type SandboxDatabase } from './sandbox-lifecycle.ts';

const API_PORT = 3000;
const WEB_PORT = 5173;
const SANDBOX_EMAIL = 'p2-ui-sandbox@example.invalid';

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

interface SandboxPrisma extends SandboxDatabase {
  $disconnect(): Promise<void>;
  user: { create(args: unknown): Promise<{ id: string }> };
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
  // Cleanup stays disarmed until claimEmptyStart() has verified an empty tb_notice_test.
  const lifecycle = sandboxLifecycle({
    db: prisma,
    closeOwnResources: async () => {
      if (web && web.exitCode === null) {
        web.kill('SIGTERM');
        for (let waited = 0; web.exitCode === null && waited < 5000; waited += 100) {
          await sleep(100);
        }
        if (web.exitCode === null) web.kill('SIGKILL');
      }
      await app?.close().catch(() => undefined);
    },
    disconnect: () => prisma.$disconnect(),
    exit: (code) => process.exit(code),
    log,
    error: (message) => console.error(`[ui:sandbox] ${message}`),
  });
  stopOnSignals(process, lifecycle);

  try {
    await lifecycle.claimEmptyStart();
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
    await lifecycle.stop(1);
  }
}

try {
  await main();
} catch (error) {
  console.error(`[ui:sandbox] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
