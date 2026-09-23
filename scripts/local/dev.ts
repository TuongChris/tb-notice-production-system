// yarn dev — local development orchestration (P0-E). Smallest deterministic wrapper, no framework.
//
// 1. Synchronous preparation: generate the Prisma client if missing, build @tb/contracts and the API.
// 2. Start two direct child processes: the compiled Nest API (127.0.0.1:3000) and the Vite dev server
//    (127.0.0.1:5173, strict port).
// 3. Shutdown: on SIGINT/SIGTERM/SIGHUP (terminal Ctrl+C reaches the whole process group; a
//    supervisor may signal only this process) every child receives SIGTERM, is awaited, and after a
//    bounded grace period is killed. If either child exits on its own, the other is stopped too.
//    Exit code 0 only when a requested shutdown completed with every child exited within the grace
//    period; otherwise 1.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../contracts/paths.ts';

const GRACE_MS = 5000;
const node = process.execPath;
const bin = (name: string) => path.join(repoRoot, 'node_modules/.bin', name);

function step(label: string, command: string, args: string[]): void {
  console.log(`[dev] ${label}`);
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[dev] ${label} failed (exit ${result.status ?? result.signal})`);
    process.exit(1);
  }
}

if (!existsSync(path.join(repoRoot, 'apps/api/generated/prisma/client.ts'))) {
  step('generating Prisma client', node, [
    path.join(repoRoot, 'scripts/db/prisma-guarded.mjs'),
    'generate',
  ]);
}
step('building @tb/contracts', bin('tsc'), [
  '-p',
  path.join(repoRoot, 'packages/contracts/tsconfig.json'),
]);
step('building @tb/api', bin('tsc'), ['-p', path.join(repoRoot, 'apps/api/tsconfig.build.json')]);

interface Child {
  readonly name: string;
  readonly process: ChildProcess;
  exited: boolean;
}

function start(name: string, args: string[], cwd: string): Child {
  const child = spawn(node, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (chunk: Buffer, stream: NodeJS.WriteStream) => {
    for (const line of chunk.toString('utf8').split(/\r?\n/))
      if (line) stream.write(`[${name}] ${line}\n`);
  };
  child.stdout?.on('data', (chunk: Buffer) => prefix(chunk, process.stdout));
  child.stderr?.on('data', (chunk: Buffer) => prefix(chunk, process.stderr));
  return { name, process: child, exited: false };
}

const children = [
  start('api', [path.join(repoRoot, 'apps/api/dist/src/main.js')], path.join(repoRoot, 'apps/api')),
  start(
    'web',
    [path.join(repoRoot, 'node_modules/vite/bin/vite.js')],
    path.join(repoRoot, 'apps/web'),
  ),
];

let stopping = false;
let requested = false;

function stopAll(reason: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`[dev] stopping (${reason})`);
  for (const child of children) if (!child.exited) child.process.kill('SIGTERM');
  const deadline = setTimeout(() => {
    for (const child of children) {
      if (!child.exited) {
        console.error(`[dev] ${child.name} did not exit within ${GRACE_MS} ms; killing`);
        child.process.kill('SIGKILL');
      }
    }
    process.exitCode = 1;
  }, GRACE_MS);
  deadline.unref();
}

for (const child of children) {
  child.process.on('exit', (code, signal) => {
    child.exited = true;
    console.log(`[dev] ${child.name} exited (${signal ?? `code ${code}`})`);
    if (!stopping) {
      process.exitCode = 1;
      stopAll(`${child.name} exited unexpectedly`);
    }
    if (children.every((c) => c.exited)) {
      if (!requested) process.exitCode = 1;
      process.exit(process.exitCode ?? 0);
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    requested = true;
    stopAll(signal);
  });
}
