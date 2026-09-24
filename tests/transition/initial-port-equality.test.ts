// TRANSITION-ONLY historical check (ADR-0002 §6). NOT part of `yarn test` or CI.
//
// At the Zod-first transition (P0-D, accepted at R2) the one-time port output was byte-identical to
// the committed initial active source; that evidence is recorded in
// docs/verification/p0/P0_D_CONTRACTS.md and evidence/p0d-test-contracts.txt. After the first
// approved edit of packages/contracts/src this check is EXPECTED TO FAIL and must not be "fixed" by
// reverting the edit or re-running the port. Run it only to re-verify the transition at an old commit:
//   yarn test:transition-baseline
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const out = mkdtempSync(path.join(tmpdir(), 'tb-transition-port-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));
const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

const PORTED_FILES = [
  'api/catalog.ts',
  'api/openapi-document.ts',
  'api/operations.ts',
  'api/schemas/core.ts',
  'api/schemas/index.ts',
  'api/schemas/production-bound.ts',
  'production/pfc-youtube-email-v1_1/constants.ts',
  'production/pfc-youtube-email-v1_1/index.ts',
  'production/pfc-youtube-email-v1_1/production-context.ts',
];

it('one-time port output equals the committed active source (valid only before the first approved contract edit)', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts/migrations/port-frozen-contract-v1.ts'), '--out-root', out],
    { encoding: 'utf8' },
  );
  expect(result.status, result.stderr).toBe(0);
  for (const file of PORTED_FILES) {
    expect(sha(path.join(out, file)), file).toBe(
      sha(path.join(repoRoot, 'packages/contracts/src', file)),
    );
  }
});
