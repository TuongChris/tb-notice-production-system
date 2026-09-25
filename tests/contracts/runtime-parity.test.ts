// Three-way runtime parity (P0-D): for every payload, the baseline JSON Schema (Ajv/full oracle),
// the generated JSON Schema (same oracle) and the active Zod schema must agree ACCEPT/REJECT.
// The baseline is the release TB-SCHEMA-API-v1.1.0 (ADR-0004): the frozen TB-SCHEMA-API-v1.0.0
// schemas, unchanged, plus the two schemas of the reviewed additive amendment (./release.ts); the
// 31 frozen fixtures are also checked against the frozen bundle itself.
// No exception list exists: any divergence fails with the payload and all three results.
import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { apiSchemaCatalog } from '../../packages/contracts/src/index.js';
import {
  createOracle,
  FROZEN_FIXTURES,
  frozenBundle,
  generatedBundle,
  readJson,
  type OracleResult,
} from './oracle.js';
import { PayloadEngine, type ParityCase } from './payload-engine.js';
import { releaseBaseline } from './release.js';

const baselineBundle = releaseBaseline().bundle;
const frozenOnly = createOracle(frozenBundle(), 'frozen v1.0.0');
const frozen = createOracle(baselineBundle, 'baseline (frozen v1.0.0 + amendment)');
const generated = createOracle(generatedBundle(), 'generated');
const zodByName = new Map<string, z.ZodType>(
  apiSchemaCatalog.map(([name, schema]) => [name, schema]),
);
const engine = new PayloadEngine(baselineBundle.$defs);

interface Outcome {
  readonly frozen: OracleResult;
  readonly generated: OracleResult;
  readonly zod: { success: boolean; issues: unknown[] };
}

function evaluate(schema: string, payload: unknown): Outcome {
  const zodSchema = zodByName.get(schema);
  if (!zodSchema) throw new Error(`no active Zod schema ${schema}`);
  const parsed = zodSchema.safeParse(payload);
  return {
    frozen: frozen.validate(schema, payload),
    generated: generated.validate(schema, payload),
    zod: { success: parsed.success, issues: parsed.success ? [] : parsed.error.issues },
  };
}

const truncate = (value: unknown): string => {
  const text = JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'string' && v.length > 120 ? `${v.slice(0, 60)}…(${v.length} chars)` : v,
  );
  return text === undefined ? String(value) : text.length > 1500 ? `${text.slice(0, 1500)}…` : text;
};

function divergenceReport(testCase: ParityCase, outcome: Outcome): string {
  return [
    `schema: ${testCase.schema}`,
    `case: ${testCase.label}`,
    `payload: ${truncate(testCase.payload)}`,
    `baseline Ajv: ${outcome.frozen.valid ? 'ACCEPT' : `REJECT ${truncate(outcome.frozen.errors)}`}`,
    `generated Ajv: ${outcome.generated.valid ? 'ACCEPT' : `REJECT ${truncate(outcome.generated.errors)}`}`,
    `Zod: ${outcome.zod.success ? 'ACCEPT' : `REJECT ${truncate(outcome.zod.issues)}`}`,
  ].join('\n    ');
}

const stats = { payloads: 0, accepted: 0, rejected: 0, divergences: 0, schemas: 0, fixtures: 0 };

afterAll(() => {
  // Optional evidence output (e.g. TB_PARITY_STATS_FILE=/tmp/parity.json yarn test:contracts).
  const target = process.env['TB_PARITY_STATS_FILE'];
  if (target) writeFileSync(target, `${JSON.stringify(stats, null, 2)}\n`);
});

function runCases(cases: readonly ParityCase[]): string[] {
  const divergences: string[] = [];
  for (const testCase of cases) {
    const outcome = evaluate(testCase.schema, testCase.payload);
    stats.payloads += 1;
    const verdicts = [outcome.frozen.valid, outcome.generated.valid, outcome.zod.success];
    if (verdicts.every((v) => v === verdicts[0])) {
      if (verdicts[0]) stats.accepted += 1;
      else stats.rejected += 1;
    } else {
      stats.divergences += 1;
      divergences.push(divergenceReport(testCase, outcome));
    }
  }
  return divergences;
}

describe('frozen request-validation fixtures (31)', () => {
  const fixtures =
    readJson<Array<{ name: string; schema: string; expectedValid: boolean; payload: unknown }>>(
      FROZEN_FIXTURES,
    );

  it('contains the 31 frozen fixtures', () => {
    expect(fixtures).toHaveLength(31);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))('%s', (_name, fixture) => {
    stats.fixtures += 1;
    const [divergence] = runCases([
      { schema: fixture.schema, label: `fixture ${fixture.name}`, payload: fixture.payload },
    ]);
    expect(divergence, divergence).toBeUndefined();
    expect(evaluate(fixture.schema, fixture.payload).frozen.valid).toBe(fixture.expectedValid);
    expect(frozenOnly.validate(fixture.schema, fixture.payload).valid).toBe(fixture.expectedValid);
  });
});

describe('schema-driven synthetic payloads for all 286 schemas (284 frozen + 2 of the v1.1.0 amendment)', () => {
  it('synthetic base instances are valid under the baseline oracle (generator self-check)', () => {
    const invalid: string[] = [];
    for (const [name] of apiSchemaCatalog) {
      const [base] = engine.casesFor(name);
      const result = frozen.validate(name, base?.payload);
      if (!result.valid) invalid.push(`${name}: ${truncate(result.errors)}`);
    }
    expect(invalid, invalid.join('\n')).toEqual([]);
  });

  it.each(apiSchemaCatalog.map(([name]) => [name] as const))(
    '%s — baseline Ajv, generated Ajv and Zod agree',
    (name) => {
      stats.schemas += 1;
      const divergences = runCases(engine.casesFor(name));
      expect(divergences, `\n  ${divergences.slice(0, 5).join('\n  ')}`).toEqual([]);
    },
  );
});
