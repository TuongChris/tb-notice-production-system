import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository root: the nearest ancestor of this module that holds `.yarnrc.yml`, or undefined.
 * Works for both the TypeScript source and the compiled `dist` output.
 */
export function repositoryRoot(): string | undefined {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(dir, '.yarnrc.yml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Loads the single root `.env` regardless of the current working directory (AR-014).
 * The repository root is found by walking up to the directory that holds `.yarnrc.yml`.
 * Variables already present in the process environment are not overridden.
 */
export function loadRootEnv(): void {
  const root = repositoryRoot();
  if (root === undefined) return;
  const envFile = path.join(root, '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}
