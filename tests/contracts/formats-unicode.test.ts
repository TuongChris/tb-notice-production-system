// Format and Unicode primitives versus the frozen Ajv/full oracle (decision D1, TECH §9).
import ucs2lengthModule from 'ajv/dist/runtime/ucs2length.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  codePointLength,
  matchesWireFormat,
  tb,
  WIRE_FORMATS,
} from '../../packages/contracts/src/index.js';
import { FORMAT_CASES, SUPPLEMENTARY } from './edge-cases.js';
import { createOracle, frozenBundle } from './oracle.js';

// Node returns module.exports ({ default: fn }); Vitest's interop returns exports.default (fn).
type Ucs2Length = (value: string) => number;
const ucs2length: Ucs2Length =
  typeof ucs2lengthModule === 'function'
    ? (ucs2lengthModule as Ucs2Length)
    : (ucs2lengthModule as unknown as { default: Ucs2Length }).default;
const oracle = createOracle(frozenBundle(), 'frozen');
const accepts = (schema: object, value: unknown) => oracle.validateSchema(schema, value).valid;

describe('Unicode code-point length', () => {
  const fixed = [
    '',
    'a',
    SUPPLEMENTARY,
    `${SUPPLEMENTARY}${SUPPLEMENTARY}`,
    'é',
    '👩‍💻',
    '\ud800',
    '\udc00',
    'a\ud800',
    '\udc00\ud800',
    `\ud800${SUPPLEMENTARY}\udfff`,
    '著作権 עברית',
  ];

  it.each(fixed.map((s) => [JSON.stringify(s), s] as const))(
    'matches Ajv ucs2length for %s',
    (_label, value) => {
      expect(codePointLength(value)).toBe(ucs2length(value));
    },
  );

  it('matches Ajv ucs2length on 5000 deterministic pseudo-random UTF-16 strings (incl. lone surrogates)', () => {
    let seed = 0x7b5eed;
    const next = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const pool = [0x61, 0xe9, 0x4e2d, 0xd83d, 0xde00, 0xd800, 0xdfff, 0xdbff, 0xdc00, 0x301];
    for (let i = 0; i < 5000; i += 1) {
      const units = Array.from({ length: next() % 12 }, () => pool[next() % pool.length] as number);
      const value = String.fromCharCode(...units);
      expect(codePointLength(value), JSON.stringify(value)).toBe(ucs2length(value));
    }
  });

  it('tb.string length bounds count Unicode code points exactly as the oracle', () => {
    const bounded = tb.string({ maxLength: 3, minLength: 2 });
    const oracleSchema = { type: 'string', maxLength: 3, minLength: 2 };
    const cases = [
      SUPPLEMENTARY.repeat(3), // 3 code points, 6 UTF-16 units
      SUPPLEMENTARY.repeat(4),
      SUPPLEMENTARY,
      SUPPLEMENTARY.repeat(2),
      'abc',
      'abcd',
    ];
    for (const value of cases) {
      expect(bounded.safeParse(value).success, JSON.stringify(value)).toBe(
        accepts(oracleSchema, value),
      );
    }
    expect(accepts(oracleSchema, SUPPLEMENTARY.repeat(3))).toBe(true);
    expect(bounded.safeParse(SUPPLEMENTARY.repeat(3)).success).toBe(true);
    // Finding (Zod 4.6.5): built-in string .min()/.max() also measure code points. tb.string keeps its
    // own reviewed helper so oracle parity does not depend on Zod-version internals.
    expect(z.string().max(3).safeParse(SUPPLEMENTARY.repeat(3)).success).toBe(true);
  });
});

describe('wire format helpers equal the ajv-formats full oracle', () => {
  for (const format of WIRE_FORMATS) {
    it(`${format}: ${FORMAT_CASES[format].length} edge cases`, () => {
      const mismatches = FORMAT_CASES[format].filter(
        (value) => matchesWireFormat(format, value) !== accepts({ type: 'string', format }, value),
      );
      expect(mismatches).toEqual([]);
      const zodPrimitive = tb.string({ format });
      for (const value of FORMAT_CASES[format]) {
        expect(zodPrimitive.safeParse(value).success, `${format} ${JSON.stringify(value)}`).toBe(
          accepts({ type: 'string', format }, value),
        );
      }
    });
  }

  it('each case list exercises both accepted and rejected values', () => {
    for (const format of WIRE_FORMATS) {
      const verdicts = FORMAT_CASES[format].map((value) =>
        accepts({ type: 'string', format }, value),
      );
      expect(verdicts, format).toContain(true);
      expect(verdicts, format).toContain(false);
    }
  });
});

describe('negative control: Zod 4 built-in format validators diverge from the oracle', () => {
  // Documents why the built-ins are not used, and shows the parity method detects divergence.
  const builtIns: Record<(typeof WIRE_FORMATS)[number], z.ZodType> = {
    uuid: z.uuid(),
    uri: z.url(),
    email: z.email(),
    date: z.iso.date(),
    'date-time': z.iso.datetime({ offset: true }),
  };
  const divergences = Object.fromEntries(
    WIRE_FORMATS.map((format) => [
      format,
      FORMAT_CASES[format].filter(
        (value) =>
          builtIns[format].safeParse(value).success !== accepts({ type: 'string', format }, value),
      ),
    ]),
  );

  it('measured divergences on the edge-case lists (Zod 4.6.5; date has none on these cases)', () => {
    expect(divergences).toEqual({
      uuid: [
        '12345678-1234-0234-c234-123456789012',
        '12345678-1234-9234-7234-123456789012',
        'urn:uuid:11111111-1111-4111-8111-111111111111',
      ],
      uri: [
        'https://exämple.invalid/',
        'https://example.invalid/a b',
        'https://example.invalid/%zz',
        'https://',
        'https://[v1.x]/',
        'https://example.invalid:99999/',
        'http://example.invalid/😀',
        'https://example.invalid/<tag>',
        'https://example.invalid/back\\slash',
      ],
      email: ['a@example-.invalid'],
      date: [],
      'date-time': [
        '2026-09-23t10:00:00z',
        '2026-09-23 10:00:00Z',
        '2026-09-23T10:00:00+0700',
        '2026-09-23T10:00:00+07',
        '2026-09-23T23:59:60Z',
        '2026-09-23T22:59:60-01:00',
      ],
    });
  });
});
