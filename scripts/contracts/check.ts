// yarn contracts:check — regenerates into a TEMPORARY directory and compares with the committed
// outputs (ADR-0002). Never writes to, repairs or updates committed files.
//   node scripts/contracts/check.ts [--committed-root <dir>]   (default: repository root)
// Exit 0: in sync. Exit 1: drift (missing, changed or unexpected files). Exit 2: error.
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { argValue, repoRoot } from './paths.ts';
import { GENERATED_DIRECTORIES, GENERATED_OUTPUTS, renderArtifacts } from './render.ts';

let temp: string | undefined;
try {
  const committedRoot = path.resolve(
    argValue(process.argv.slice(2), '--committed-root') ?? repoRoot,
  );
  temp = mkdtempSync(path.join(tmpdir(), 'tb-contracts-check-'));
  const rendered = renderArtifacts();
  for (const [relative, content] of rendered) {
    const target = path.join(temp, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const drift: string[] = [];
  for (const relative of GENERATED_OUTPUTS) {
    const committed = path.join(committedRoot, relative);
    if (!existsSync(committed)) {
      drift.push(`${relative}: missing`);
      continue;
    }
    const expected = readFileSync(path.join(temp, relative));
    if (!readFileSync(committed).equals(expected))
      drift.push(`${relative}: differs from freshly generated output`);
  }
  for (const directory of GENERATED_DIRECTORIES) {
    const absolute = path.join(committedRoot, directory);
    if (!existsSync(absolute)) continue;
    for (const entry of readdirSync(absolute, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const relative = path
        .relative(committedRoot, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/');
      if (!(GENERATED_OUTPUTS as readonly string[]).includes(relative))
        drift.push(`${relative}: unexpected file in generated directory`);
    }
  }
  if (drift.length > 0) {
    console.error(
      '[contracts:check] DRIFT — committed generated outputs do not match the active source:',
    );
    for (const line of drift) console.error(`  - ${line}`);
    console.error(
      '[contracts:check] Nothing was modified. Run `yarn contracts:generate` and review the diff.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      `[contracts:check] OK — ${GENERATED_OUTPUTS.length} generated outputs match the active source.`,
    );
  }
} catch (error) {
  console.error(
    `[contracts:check] error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
} finally {
  if (temp) rmSync(temp, { recursive: true, force: true });
}
