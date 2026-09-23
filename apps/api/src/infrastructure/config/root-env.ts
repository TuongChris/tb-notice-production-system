import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the single root `.env` regardless of the current working directory (AR-014).
 * The repository root is found by walking up to the directory that holds `.yarnrc.yml`.
 * Variables already present in the process environment are not overridden.
 */
export function loadRootEnv(): void {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(path.join(dir, '.yarnrc.yml'))) {
      const envFile = path.join(dir, '.env');
      if (existsSync(envFile)) {
        process.loadEnvFile(envFile);
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return;
    }
    dir = parent;
  }
}
