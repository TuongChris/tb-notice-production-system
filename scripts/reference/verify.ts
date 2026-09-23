// Read-only integrity verification of the two frozen reference trees (AR-008).
// Checks: every MANIFEST.sha256 entry, no unlisted files, no symlinks, manifest.json agreement,
// the Database/API manifest identity pinned by the architecture pack (REFERENCE_BASELINE.json) and
// the architecture pack manifest identity recorded at import. Never writes anything.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DATABASE_API_DIR = 'docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1';
export const ARCHITECTURE_DIR =
  'docs/reference/architecture-v1/TB_ARCHITECTURE_SPECIFICATION_PACK_v1';
/** sha256 of the architecture pack MANIFEST.sha256 as imported (commit 1d665ad). */
export const ARCHITECTURE_MANIFEST_SHA256 =
  '62b4d1136db81d31cf91dbd38a59c4ba57af265b228b479c909e0dbce693c3de';

export interface ReferenceReport {
  readonly ok: boolean;
  readonly findings: string[];
  readonly summary: string[];
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function parseManifest(bytes: Buffer, where: string, findings: string[]): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of bytes.toString('utf8').split('\n')) {
    if (line === '') continue;
    const match = /^([0-9a-f]{64}) {2}([A-Za-z0-9_./-]+)$/.exec(line);
    if (!match || match[2]?.split('/').includes('..')) {
      findings.push(`${where}: invalid manifest line ${JSON.stringify(line)}`);
      continue;
    }
    entries.set(match[2] as string, match[1] as string);
  }
  return entries;
}

function listFiles(root: string, findings: string[], where: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    const absolute = path.join(entry.parentPath, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (entry.isSymbolicLink() || lstatSync(absolute).isSymbolicLink())
      findings.push(`${where}: symlink ${relative}`);
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

function verifyTree(
  root: string,
  where: string,
  exempt: readonly string[],
  findings: string[],
): { manifestSha: string; entries: Map<string, string> } | undefined {
  const manifestPath = path.join(root, 'MANIFEST.sha256');
  if (!existsSync(manifestPath)) {
    findings.push(`${where}: MANIFEST.sha256 missing`);
    return undefined;
  }
  const manifestBytes = readFileSync(manifestPath);
  const entries = parseManifest(manifestBytes, where, findings);
  const files = listFiles(root, findings, where);
  for (const [relative, digest] of entries) {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) findings.push(`${where}: listed file missing ${relative}`);
    else if (sha256(readFileSync(absolute)) !== digest)
      findings.push(`${where}: checksum mismatch ${relative}`);
  }
  for (const relative of files) {
    if (!entries.has(relative) && !exempt.includes(relative))
      findings.push(`${where}: unlisted file ${relative}`);
  }
  return { manifestSha: sha256(manifestBytes), entries };
}

function verifyManifestJson(
  root: string,
  where: string,
  key: 'files' | 'payload_files',
  entries: Map<string, string>,
  findings: string[],
): void {
  const file = path.join(root, 'manifest.json');
  if (!existsSync(file)) {
    findings.push(`${where}: manifest.json missing`);
    return;
  }
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const listed = manifest[key] as Array<{ path: string; sha256: string; bytes: number }>;
  for (const item of listed) {
    if (entries.get(item.path) !== item.sha256)
      findings.push(`${where}: manifest.json disagrees with MANIFEST.sha256 for ${item.path}`);
    const absolute = path.join(root, item.path);
    if (existsSync(absolute) && readFileSync(absolute).length !== item.bytes)
      findings.push(`${where}: size mismatch ${item.path}`);
  }
}

export function verifyReferences(repoRoot: string): ReferenceReport {
  const findings: string[] = [];
  const summary: string[] = [];
  const dbRoot = path.join(repoRoot, DATABASE_API_DIR);
  const archRoot = path.join(repoRoot, ARCHITECTURE_DIR);

  const db = verifyTree(dbRoot, 'database-api-v1', ['MANIFEST.sha256', 'manifest.json'], findings);
  if (db) {
    verifyManifestJson(dbRoot, 'database-api-v1', 'files', db.entries, findings);
    summary.push(
      `database-api-v1: ${db.entries.size} manifest entries, MANIFEST.sha256 ${db.manifestSha}`,
    );
  }
  const arch = verifyTree(archRoot, 'architecture-v1', ['MANIFEST.sha256'], findings);
  if (arch) {
    verifyManifestJson(archRoot, 'architecture-v1', 'payload_files', arch.entries, findings);
    if (arch.manifestSha !== ARCHITECTURE_MANIFEST_SHA256)
      findings.push('architecture-v1: MANIFEST.sha256 identity changed');
    summary.push(
      `architecture-v1: ${arch.entries.size} manifest entries, MANIFEST.sha256 ${arch.manifestSha}`,
    );
  }
  // Pinned identity of the Database/API release, as recorded by the (itself verified) architecture pack.
  const baselinePath = path.join(archRoot, 'verification/REFERENCE_BASELINE.json');
  if (db && existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
      manifest_sha256: string;
      source_files: Array<{ path: string; sha256: string }>;
    };
    if (baseline.manifest_sha256 !== db.manifestSha)
      findings.push(
        'database-api-v1: MANIFEST.sha256 differs from the identity pinned in REFERENCE_BASELINE.json',
      );
    for (const file of baseline.source_files) {
      if (db.entries.get(file.path) !== file.sha256)
        findings.push(`database-api-v1: ${file.path} differs from REFERENCE_BASELINE.json`);
    }
    summary.push(
      `pinned identity (REFERENCE_BASELINE.json): ${baseline.manifest_sha256} ${baseline.manifest_sha256 === db.manifestSha ? 'matches' : 'MISMATCH'}`,
    );
  } else if (db) {
    findings.push('architecture-v1: verification/REFERENCE_BASELINE.json missing');
  }
  return { ok: findings.length === 0, findings, summary };
}
