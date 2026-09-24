// yarn reference:check — read-only integrity check of both frozen reference trees.
//   node scripts/reference/check.ts [--root <repository root>]
// Exit 0: intact. Exit 1: integrity finding(s). Exit 2: error.
import path from 'node:path';
import { argValue, repoRoot } from '../contracts/paths.ts';
import { verifyReferences } from './verify.ts';

try {
  const root = path.resolve(argValue(process.argv.slice(2), '--root') ?? repoRoot);
  const report = verifyReferences(root);
  for (const line of report.summary) console.log(`[reference:check] ${line}`);
  if (report.ok) {
    console.log('[reference:check] OK — frozen references intact.');
  } else {
    for (const finding of report.findings) console.error(`[reference:check] FAIL ${finding}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `[reference:check] error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 2;
}
