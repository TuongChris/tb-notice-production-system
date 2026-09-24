// Process-level tests for the P0-D tooling: port and generation determinism, contracts:check drift
// detection (never repairing), and reference:check. Every write goes to a temporary directory;
// the real working tree and docs/reference are never modified (asserted at the end).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { repoRoot } from './oracle.js';

const temps: string[] = [];
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), `tb-p0d-${prefix}-`));
  temps.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const run = (script: string, args: string[]) =>
  spawnSync(process.execPath, [path.join(repoRoot, script), ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

function tree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath, entry.name);
    out[path.relative(root, absolute).split(path.sep).join('/')] = sha(absolute);
  }
  return out;
}

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
const GENERATED = [
  'packages/contracts/schemas/api-schemas.json',
  'packages/contracts/openapi/openapi.json',
  'packages/contracts/openapi/openapi.yaml',
];
const PORT = 'scripts/migrations/port-frozen-contract-v1.ts';
const referenceBefore = tree(path.join(repoRoot, 'docs/reference'));

describe('one-time port', () => {
  it('is deterministic: two runs into empty directories are byte-identical', () => {
    const a = tempDir('port-a');
    const b = tempDir('port-b');
    expect(run(PORT, ['--out-root', a]).status).toBe(0);
    expect(run(PORT, ['--out-root', b]).status).toBe(0);
    expect(Object.keys(tree(a)).sort()).toEqual([...PORTED_FILES].sort());
    expect(tree(a)).toEqual(tree(b));
  });

  it('refuses to write under docs/reference', () => {
    const target = path.join(repoRoot, 'docs/reference/p0d-port-probe');
    const result = run(PORT, ['--out-root', target]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('refusing to write under docs/reference');
    expect(existsSync(target)).toBe(false);
  });

  it('refuses to overwrite differing active source without --overwrite', () => {
    const out = tempDir('port-overwrite');
    expect(run(PORT, ['--out-root', out]).status).toBe(0);
    const edited = path.join(out, 'api/catalog.ts');
    writeFileSync(edited, `${readFileSync(edited, 'utf8')}// edited after transition\n`);
    const before = sha(edited);
    const result = run(PORT, ['--out-root', out]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('refusing to overwrite active source');
    expect(sha(edited)).toBe(before);
  });
});

describe('contracts:generate', () => {
  it('is deterministic and reproduces the committed generated outputs', () => {
    const a = tempDir('gen-a');
    const b = tempDir('gen-b');
    expect(run('scripts/contracts/generate.ts', ['--out-root', a]).status).toBe(0);
    expect(run('scripts/contracts/generate.ts', ['--out-root', b]).status).toBe(0);
    expect(tree(a)).toEqual(tree(b));
    for (const file of GENERATED)
      expect(sha(path.join(a, file)), file).toBe(sha(path.join(repoRoot, file)));
  });

  it('writes only the designated outputs', () => {
    const out = tempDir('gen-only');
    expect(run('scripts/contracts/generate.ts', ['--out-root', out]).status).toBe(0);
    expect(Object.keys(tree(out)).sort()).toEqual([...GENERATED].sort());
  });
});

describe('contracts:check (drift detection, never repairs)', () => {
  const committedCopy = () => {
    const root = tempDir('check');
    for (const file of GENERATED) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      cpSync(path.join(repoRoot, file), path.join(root, file));
    }
    return root;
  };
  const check = (root: string) => run('scripts/contracts/check.ts', ['--committed-root', root]);

  it('passes on the committed outputs', () => {
    const result = check(committedCopy());
    expect(result.status, result.stderr).toBe(0);
    expect(check(repoRoot).status).toBe(0);
  });

  it('fails on a tampered JSON Schema artifact and leaves the tampered file untouched', () => {
    const root = committedCopy();
    const file = path.join(root, GENERATED[0] as string);
    writeFileSync(file, readFileSync(file, 'utf8').replace('"maxLength": 36', '"maxLength": 37'));
    const tampered = sha(file);
    const result = check(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('api-schemas.json: differs');
    expect(sha(file)).toBe(tampered);
  });

  it('fails on a whitespace-only YAML change, a missing output and an unexpected file', () => {
    const yamlRoot = committedCopy();
    const yamlFile = path.join(yamlRoot, GENERATED[2] as string);
    writeFileSync(yamlFile, `${readFileSync(yamlFile, 'utf8')}\n`);
    expect(check(yamlRoot).status).toBe(1);

    const missingRoot = committedCopy();
    rmSync(path.join(missingRoot, GENERATED[1] as string));
    const missing = check(missingRoot);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('openapi.json: missing');

    const extraRoot = committedCopy();
    writeFileSync(path.join(extraRoot, 'packages/contracts/openapi/hand-edited.json'), '{}');
    const extra = check(extraRoot);
    expect(extra.status).toBe(1);
    expect(extra.stderr).toContain('unexpected file');
  });
});

describe('reference:check', () => {
  const referenceCopy = () => {
    const root = tempDir('ref');
    cpSync(path.join(repoRoot, 'docs/reference'), path.join(root, 'docs/reference'), {
      recursive: true,
    });
    return root;
  };
  const check = (root: string) => run('scripts/reference/check.ts', ['--root', root]);
  const DB = 'docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1';
  const ARCH = 'docs/reference/architecture-v1/TB_ARCHITECTURE_SPECIFICATION_PACK_v1';

  it('passes on the real repository and on an exact copy', () => {
    expect(check(repoRoot).status).toBe(0);
    expect(check(referenceCopy()).status).toBe(0);
  });

  it('detects a changed byte, an unlisted file, a missing file and a re-signed manifest', () => {
    const changed = referenceCopy();
    const target = path.join(changed, DB, 'docs/INVARIANTS.md');
    writeFileSync(
      target,
      readFileSync(target, 'utf8').replace('READY_FOR_SIGNER', 'READY_FOR_SIGNEX'),
    );
    expect(check(changed).status).toBe(1);

    const unlisted = referenceCopy();
    writeFileSync(path.join(unlisted, ARCH, 'extra.md'), 'x');
    expect(check(unlisted).status).toBe(1);

    const missing = referenceCopy();
    rmSync(path.join(missing, DB, 'contracts/openapi.yaml'));
    expect(check(missing).status).toBe(1);

    // Tamper a file AND update its manifest line: the pinned manifest identity must still catch it.
    const resigned = referenceCopy();
    const file = path.join(resigned, DB, 'README.md');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n`);
    const manifest = path.join(resigned, DB, 'MANIFEST.sha256');
    const lines = readFileSync(manifest, 'utf8').replace(
      /^[0-9a-f]{64}(?= {2}README\.md$)/m,
      sha(file),
    );
    writeFileSync(manifest, lines);
    const result = check(resigned);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REFERENCE_BASELINE.json');
  });
});

describe('working tree safety', () => {
  it('no test modified docs/reference', () => {
    expect(tree(path.join(repoRoot, 'docs/reference'))).toEqual(referenceBefore);
  });
});
