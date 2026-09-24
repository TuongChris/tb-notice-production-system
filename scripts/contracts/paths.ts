// Path helpers shared by the contract scripts: repository root and the frozen-reference guard.
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Throws if `target` is (or is inside) docs/reference of the given repository root. */
export function assertOutsideReference(target: string, root: string = repoRoot): void {
  const referenceDir = path.join(root, 'docs', 'reference');
  const reference = existsSync(referenceDir) ? realpathSync(referenceDir) : referenceDir;
  let probe = path.resolve(target);
  while (!existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
  const resolved = path.join(realpathSync(probe), path.relative(probe, path.resolve(target)));
  if (resolved === reference || resolved.startsWith(`${reference}${path.sep}`)) {
    throw new Error(`refusing to write under frozen docs/reference: ${target}`);
  }
}

export function argValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}
