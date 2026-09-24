// Fail-closed lowering (ADR-0002) and health-contract compatibility (P0-D).
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  GetHealthResponseSchema,
  lowerSchema,
  tb,
  type GetHealthResponse,
  type HealthStatus,
} from '../../packages/contracts/src/index.js';
import { createOracle, frozenBundle, generatedBundle } from './oracle.js';

const noRefs = { refFor: () => undefined };
const lower = (schema: z.ZodType) => lowerSchema(schema, noRefs, 'probe', true);

describe('lowering fails closed on constructs outside the TB wire subset', () => {
  const rejected: Array<[string, () => z.ZodType]> = [
    ['raw z.string()', () => z.string()],
    ['raw z.string() inside tb.object', () => tb.object({ a: z.string() })],
    ['tb.string with an extra .max() check', () => tb.string({ maxLength: 5 }).max(3)],
    ['tb.string with an added .refine()', () => tb.string().refine((v) => v.length > 0)],
    ['tb.string re-described outside the builder', () => tb.string().describe('late description')],
    ['Zod built-in z.uuid()', () => z.uuid()],
    ['Zod built-in z.email()', () => z.email()],
    ['z.int()', () => z.int()],
    ['plain z.union', () => z.union([tb.string(), tb.integer({ minimum: 0, maximum: 1 })])],
    ['z.looseObject', () => z.looseObject({ a: tb.string() })],
    ['z.object (strip mode)', () => z.object({ a: tb.string() })],
    ['transform', () => tb.string().transform((v) => v.length) as unknown as z.ZodType],
    ['default', () => tb.string().default('x') as unknown as z.ZodType],
    ['lazy', () => z.lazy(() => tb.string())],
    ['top-level optional', () => tb.string().optional()],
    ['nullable wrapping an unregistered schema', () => z.string().nullable()],
    ['z.bigint()', () => z.bigint()],
    ['z.date()', () => z.date()],
    ['z.tuple', () => z.tuple([tb.string()])],
  ];

  it.each(rejected)('%s → throws', (_label, build) => {
    expect(() => lower(build())).toThrow();
  });

  it('accepts the TB subset and lowers it exactly', () => {
    expect(
      lower(
        tb.object(
          {
            id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
            note: tb.string({ maxLength: 10 }).nullable().optional(),
            count: tb.integer({ minimum: 0, maximum: 9 }),
            kind: tb.enum(['A', 'B']),
            fixed: tb.literal('X'),
            list: tb.array(tb.boolean(), { minItems: 0, maxItems: 2 }),
            extra: tb.looseObject(),
          },
          { minProperties: 1 },
        ),
      ),
    ).toEqual({
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 36, minLength: 36, format: 'uuid' },
        note: { anyOf: [{ type: 'string', maxLength: 10 }, { type: 'null' }] },
        count: { type: 'integer', minimum: 0, maximum: 9 },
        kind: { type: 'string', enum: ['A', 'B'] },
        fixed: { const: 'X' },
        list: { type: 'array', items: { type: 'boolean' }, minItems: 0, maxItems: 2 },
        extra: { type: 'object', additionalProperties: true },
      },
      required: ['id', 'count', 'kind', 'fixed', 'list', 'extra'],
      additionalProperties: false,
      minProperties: 1,
    });
  });
});

describe('health contract compatibility (GET /api/v1/health)', () => {
  const frozen = createOracle(frozenBundle(), 'frozen');
  const generated = createOracle(generatedBundle(), 'generated');
  const requestId = '9f89a89e-4f4d-40e9-abac-9259e31cfadf';
  const samples: Array<[string, unknown, boolean]> = [
    [
      'ok (API shape)',
      { data: { status: 'ok' }, meta: { requestId, affectedResources: [] } },
      true,
    ],
    [
      'unavailable (API shape)',
      { data: { status: 'unavailable' }, meta: { requestId, affectedResources: [] } },
      true,
    ],
    ['meta without affectedResources', { data: { status: 'ok' }, meta: { requestId } }, true],
    ['unknown status', { data: { status: 'degraded' }, meta: { requestId } }, false],
    [
      'undocumented data field',
      { data: { status: 'ok', database: 'up' }, meta: { requestId } },
      false,
    ],
    ['missing meta', { data: { status: 'ok' } }, false],
    ['empty requestId', { data: { status: 'ok' }, meta: { requestId: '' } }, false],
  ];

  it.each(samples)('%s', (_label, payload, expected) => {
    expect(frozen.validate('GetHealthResponse', payload).valid).toBe(expected);
    expect(generated.validate('GetHealthResponse', payload).valid).toBe(expected);
    expect(GetHealthResponseSchema.safeParse(payload).success).toBe(expected);
  });

  it('exported types keep the API/web compile-time contract', () => {
    expectTypeOf<HealthStatus>().toEqualTypeOf<'ok' | 'unavailable'>();
    expectTypeOf<GetHealthResponse['data']>().toEqualTypeOf<{ status: 'ok' | 'unavailable' }>();
    expectTypeOf<GetHealthResponse['meta']['requestId']>().toEqualTypeOf<string>();
  });
});
