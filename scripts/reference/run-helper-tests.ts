// yarn reference:helper-tests — runs the ORIGINAL frozen Node pure-helper tests read-only
// (docs/reference/…/tests/consistency-reference.test.mjs, 27 tests). The references are verified
// immediately before and after; the process runs from a temporary working directory. The frozen
// Python verifier (tests/verify_contracts.py) writes files and is never executed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { repoRoot } from '../contracts/paths.ts';
import { DATABASE_API_DIR, verifyReferences } from './verify.ts';

const before = verifyReferences(repoRoot);
if (!before.ok) {
  console.error('[reference:helper-tests] references not intact before the run; refusing.');
  for (const finding of before.findings) console.error(`  - ${finding}`);
  process.exit(1);
}
const cwd = mkdtempSync(path.join(tmpdir(), 'tb-reference-helper-tests-'));
const testFile = path.join(repoRoot, DATABASE_API_DIR, 'tests/consistency-reference.test.mjs');
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], {
  cwd,
  encoding: 'utf8',
});
rmSync(cwd, { recursive: true, force: true });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
const after = verifyReferences(repoRoot);
const pass = /^# pass (\d+)$/m.exec(result.stdout ?? '')?.[1];
const fail = /^# fail (\d+)$/m.exec(result.stdout ?? '')?.[1];
console.log(
  `[reference:helper-tests] frozen helper tests: pass ${pass ?? '?'}, fail ${fail ?? '?'}; exit ${result.status}`,
);
console.log(`[reference:helper-tests] references after run: ${after.ok ? 'intact' : 'CHANGED'}`);
if (!after.ok) {
  for (const finding of after.findings) console.error(`  - ${finding}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
