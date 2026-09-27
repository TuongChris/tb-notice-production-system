// Gate terminology in the active guidance (R14-AUD-008): G6 is the exact candidate artifact
// consistency, traceability and whole-artifact QA gate; personal human adoption, signature and
// sending are G7, outside the application. A narrow guard against the known misassignments of
// adoption to G6 — the frozen reference (docs/reference) and recorded evidence logs are not scanned.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');

/** Phrasings that assign personal adoption to G6 (each seen in, or a variant of, earlier text). */
const MISASSIGNED = [
  /\bG6\s*(?:=|:|—|–|-)\s*(?:personal |human )?(?:semantic )?adoption\b/i,
  /\bG6 (?:human |personal )?(?:semantic )?(?:review\/)?adoption\b/i,
  /\badoption[^,;.()\n]{0,40}\(G6\)/i,
  /permission or exceptions, human adoption\)/i,
  /\bthrough G6 human\b/i,
];

function files(directory: string, keep: (file: string) => boolean): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) {
      return ['node_modules', 'dist', 'reference', 'evidence'].includes(name)
        ? []
        : files(full, keep);
    }
    return keep(full) ? [full] : [];
  });
}

const ACTIVE = [
  path.join(repoRoot, 'CLAUDE.md'),
  ...files(path.join(repoRoot, 'docs'), (file) => file.endsWith('.md')),
  ...files(path.join(repoRoot, 'apps/api/src'), (file) => file.endsWith('.ts')),
  ...files(path.join(repoRoot, 'apps/web/src'), (file) => /\.tsx?$/.test(file)),
];

describe('gate terminology — personal adoption is G7, never G6 (R14-AUD-008)', () => {
  it('scans the active guidance, not the frozen reference or evidence logs', () => {
    const relative = ACTIVE.map((file) => path.relative(repoRoot, file));
    expect(relative).toContain('CLAUDE.md');
    expect(relative).toContain('docs/CURRENT_STATE.md');
    expect(relative).toContain('docs/verification/p4g/P4G_TECHNICAL_VALIDATION.md');
    expect(relative).toContain('apps/api/src/modules/validation/technical-ruleset.ts');
    expect(relative.some((file) => file.startsWith('docs/reference/'))).toBe(false);
    expect(relative.some((file) => file.includes('/evidence/'))).toBe(false);
  });

  it('no active document or source assigns personal human adoption to G6', () => {
    const found: string[] = [];
    for (const file of ACTIVE) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          for (const pattern of MISASSIGNED) {
            if (pattern.test(line)) found.push(`${path.relative(repoRoot, file)}:${index + 1}`);
          }
        });
    }
    expect(found).toEqual([]);
  });

  it('the guard recognises the misassignments it exists for, and not the correct wording', () => {
    const misassigned = [
      'no permission or exceptions (G5), human adoption of the text (G6), legal validity',
      'decides no G1–G6 gate (authority, rights, identification, evidence, permission or exceptions, human adoption)',
      'assessments (G1 authority through G6 human adoption)',
      'G6 = human adoption',
      'G6 review/adoption',
      'G6 human semantic adoption',
    ];
    for (const text of misassigned) {
      expect(
        MISASSIGNED.some((pattern) => pattern.test(text)),
        text,
      ).toBe(true);
    }
    const correct = [
      'G6 exact candidate artifact consistency, traceability and whole-artifact QA · G7 the actual authorized human review, adoption, signature and sending act',
      'AI cannot satisfy G7; personal adoption is G7, never G6.',
      'no personal adoption (G7), no artifact QA decision (G6)',
      'G6 requires human semantic QA of the exact artifact; G7 requires personal adoption and signature.',
    ];
    for (const text of correct) {
      expect(
        MISASSIGNED.some((pattern) => pattern.test(text)),
        text,
      ).toBe(false);
    }
  });
});
