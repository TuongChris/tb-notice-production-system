// Guarded runner for database structural tests (P0-C7). Refuses to start unless
// TEST_DATABASE_URL is the loopback tb_notice_test schema with the tb_migrate account.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadRootEnv, repoRoot, resolveTarget } from './lib/targets.mjs';

loadRootEnv();
try {
  const target = resolveTarget('test', ['test']);
  console.log(`[guard] test:db target: ${target.label}`);
} catch (error) {
  console.error(`[guard] refused: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const result = spawnSync(
  path.join(repoRoot, 'node_modules/.bin/vitest'),
  ['run', '--config', 'vitest.db.config.ts', ...process.argv.slice(2)],
  { cwd: repoRoot, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
