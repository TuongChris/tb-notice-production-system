// yarn env:init — creates or completes the untracked root .env (decision D3).
// - No .env: creates it with random local secrets (mode 600).
// - Existing .env: adds missing P1 keys (TB_SESSION_SECRET, TB_ALLOWED_WEB_ORIGINS) and replaces an
//   empty or placeholder P1 value. No other line is changed, so database passwords that an
//   initialized MySQL volume depends on stay valid. Remove a line deliberately to regenerate it.
// - Always leaves the file at mode 600. Never prints secret values.
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { completeP1Keys, freshEnvContent } from './env-file.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(repoRoot, '.env');

if (!existsSync(target)) {
  writeFileSync(target, freshEnvContent(), { mode: 0o600, flag: 'wx' });
  console.log(`Created ${target} (mode 600). Secret values were not printed.`);
} else {
  const { content, added, replaced } = completeP1Keys(readFileSync(target, 'utf8'));
  if (added.length === 0 && replaced.length === 0) {
    console.log(`${target} already defines every required key; nothing changed.`);
  } else {
    writeFileSync(target, content);
    const changes = [
      added.length > 0 ? `added ${added.join(', ')}` : '',
      replaced.length > 0 ? `replaced empty/placeholder ${replaced.join(', ')}` : '',
    ].filter(Boolean);
    console.log(
      `Updated ${target}: ${changes.join('; ')}. Other lines were not changed; ` +
        'secret values were not printed.',
    );
  }
  const mode = statSync(target).mode & 0o777;
  if (mode !== 0o600) {
    chmodSync(target, 0o600);
    console.log(`Permissions of ${target} set to 600 (were ${mode.toString(8)}).`);
  }
}
