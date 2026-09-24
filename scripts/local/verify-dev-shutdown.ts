// yarn dev:verify-shutdown — verifies that the dev orchestration starts API and web and shuts both
// down cleanly (P0-E). Scenarios, each in its own process group:
//   terminal-ctrl-c: SIGINT to the whole process group (what a terminal Ctrl+C does);
//   top-sigint:      SIGINT to the top process only (IDE stop button / supervisor);
//   top-sigterm:     SIGTERM to the top process only.
// Pass: both ports serve before the signal; the top process exits 0 within 10 s; ports 3000 and
// 5173 are released; no process of the group remains. Leftovers are killed and reported as FAIL.
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import path from 'node:path';
import { repoRoot } from '../contracts/paths.ts';

const PORTS = [3000, 5173];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const allListening = async () => (await Promise.all(PORTS.map(listening))).every(Boolean);
const anyListening = async () => (await Promise.all(PORTS.map(listening))).some(Boolean);

function groupMembers(pgid: number): string[] {
  const result = spawnSync('pgrep', ['-g', String(pgid), '-a'], { encoding: 'utf8' });
  return (result.stdout ?? '').split('\n').filter(Boolean);
}

type Scenario = 'terminal-ctrl-c' | 'top-sigint' | 'top-sigterm';

async function run(command: string[], scenario: Scenario): Promise<boolean> {
  const label = `${command.join(' ')} [${scenario}]`;
  if (await anyListening()) {
    console.error(`[verify-dev] ${label}: ports 3000/5173 already in use; refusing`);
    return false;
  }
  const child = spawn(command[0] as string, command.slice(1), {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
  });
  const pgid = child.pid as number;
  let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  child.on('exit', (code, signal) => {
    exit = { code, signal };
  });
  const started = Date.now();
  while (Date.now() - started < 120_000 && !(await allListening()) && exit === undefined)
    await sleep(250);
  const up = await allListening();
  if (up) {
    if (scenario === 'terminal-ctrl-c') process.kill(-pgid, 'SIGINT');
    else process.kill(pgid, scenario === 'top-sigint' ? 'SIGINT' : 'SIGTERM');
  }
  const signalled = Date.now();
  while (exit === undefined && Date.now() - signalled < 10_000) await sleep(100);
  await sleep(500);
  const portsFree = !(await anyListening());
  const leftovers = groupMembers(pgid);
  if (leftovers.length > 0) {
    process.kill(-pgid, 'SIGKILL');
    await sleep(500);
  }
  const ok = up && exit !== undefined && exit.code === 0 && portsFree && leftovers.length === 0;
  console.log(
    `[verify-dev] ${label}: started=${up} exit=${exit ? (exit.signal ?? exit.code) : 'none within 10s'} ` +
      `in ${exit ? Date.now() - signalled : '>10000'}ms portsReleased=${portsFree} leftovers=${leftovers.length} → ${ok ? 'PASS' : 'FAIL'}`,
  );
  for (const line of leftovers) console.log(`[verify-dev]   leftover: ${line}`);
  return ok;
}

const direct = [process.execPath, path.join(repoRoot, 'scripts/local/dev.ts')];
const results: boolean[] = [];
for (const scenario of ['terminal-ctrl-c', 'top-sigint', 'top-sigterm'] as const) {
  results.push(await run(direct, scenario));
}
// The `yarn dev` entry point (Yarn → Node wrapper) under a terminal Ctrl+C.
results.push(await run(['yarn', 'dev'], 'terminal-ctrl-c'));
const passed = results.every(Boolean);
console.log(
  `[verify-dev] ${passed ? 'PASS' : 'FAIL'} (${results.filter(Boolean).length}/${results.length} scenarios)`,
);
process.exit(passed ? 0 : 1);
