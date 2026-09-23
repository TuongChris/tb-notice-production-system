// yarn contracts:generate — writes ONLY the designated generated contract outputs (ADR-0002).
//   node scripts/contracts/generate.ts [--out-root <dir>]   (default: repository root)
// Run after building @tb/contracts (the root script does both).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { argValue, assertOutsideReference, repoRoot } from './paths.ts';
import { renderArtifacts } from './render.ts';

try {
  const outRoot = path.resolve(argValue(process.argv.slice(2), '--out-root') ?? repoRoot);
  for (const [relative, content] of renderArtifacts()) {
    const target = path.join(outRoot, relative);
    assertOutsideReference(target, outRoot);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    console.log(`[contracts:generate] wrote ${relative} (${Buffer.byteLength(content)} bytes)`);
  }
} catch (error) {
  console.error(
    `[contracts:generate] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(2);
}
