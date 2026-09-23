// The one-time port (provenance, ADR-0002 D2) must fail closed on frozen constructs outside its
// closed mapping. These tests call the real translation functions of the committed port script.
import { describe, expect, it } from 'vitest';
import {
  translate,
  translateTopLevel,
  type Json,
  type TranslateContext,
} from '../../scripts/migrations/port-frozen-contract-v1.ts';

const context = (): TranslateContext => ({
  names: new Set(['Known']),
  referenced: new Set(),
  usesPfc: false,
});
const branch = (value: string, extra: Record<string, Json> = {}): Json => ({
  type: 'object',
  properties: { factType: { const: value }, ...extra },
  required: ['factType', ...Object.keys(extra)],
  additionalProperties: false,
});

describe('port translation fails closed', () => {
  const unsupported: Array<[string, Json]> = [
    ['number type', { type: 'number' }],
    ['type array (union type keyword)', { type: ['string', 'null'] }],
    ['missing type', { minLength: 1 }],
    ['allOf', { allOf: [{ type: 'string' }] }],
    ['not', { not: { type: 'string' } }],
    ['unsupported format', { type: 'string', format: 'hostname' }],
    ['negative minLength', { type: 'string', minLength: -1 }],
    ['unknown string keyword', { type: 'string', contentEncoding: 'base64' }],
    ['anyOf that is not nullable', { anyOf: [{ type: 'string' }, { type: 'boolean' }] }],
    [
      'anyOf with three branches',
      { anyOf: [{ type: 'string' }, { type: 'boolean' }, { type: 'null' }] },
    ],
    ['nested oneOf', { oneOf: [{ type: 'string' }, { type: 'boolean' }] }],
    ['$ref outside $defs', { $ref: 'https://example.invalid/schema.json' }],
    ['$ref to an unknown schema', { $ref: '#/$defs/Unknown' }],
    ['$ref with sibling keywords', { $ref: '#/$defs/Known', description: 'x' }],
    ['object const', { const: { a: 1 } }],
    ['number const', { const: 1 }],
    ['non-string enum', { type: 'string', enum: ['A', 1] }],
    ['empty enum', { type: 'string', enum: [] }],
    ['integer without bounds', { type: 'integer' }],
    [
      'integer with exclusiveMinimum',
      { type: 'integer', minimum: 0, maximum: 1, exclusiveMinimum: 0 },
    ],
    ['array without bounds', { type: 'array', items: { type: 'boolean' } }],
    [
      'array with uniqueItems',
      { type: 'array', items: { type: 'boolean' }, minItems: 0, maxItems: 1, uniqueItems: true },
    ],
    ['object without additionalProperties false', { type: 'object', properties: {}, required: [] }],
    [
      'object with patternProperties',
      {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
        patternProperties: {},
      },
    ],
    [
      'required naming an unknown property',
      { type: 'object', properties: {}, required: ['x'], additionalProperties: false },
    ],
    [
      'required order differing from property order',
      {
        type: 'object',
        properties: { a: { type: 'boolean' }, b: { type: 'boolean' } },
        required: ['b', 'a'],
        additionalProperties: false,
      },
    ],
    ['open object with properties', { type: 'object', additionalProperties: true, properties: {} }],
  ];

  it.each(unsupported)('%s → throws', (_label, node) => {
    expect(() => translate(node, context(), 'probe')).toThrow(/\[port\]/);
  });

  it('top-level oneOf without a single required const discriminator → throws', () => {
    expect(() =>
      translateTopLevel(
        'Probe',
        {
          oneOf: [
            branch('A'),
            { type: 'object', properties: {}, required: [], additionalProperties: false },
          ],
        },
        context(),
      ),
    ).toThrow(/\[port\]/);
  });

  it('top-level oneOf with duplicate discriminator values → throws', () => {
    expect(() =>
      translateTopLevel('Probe', { oneOf: [branch('A'), branch('A')] }, context()),
    ).toThrow(/\[port\]/);
  });

  it('translates the supported subset to tb builders', () => {
    expect(
      translate({ type: 'string', maxLength: 36, minLength: 36, format: 'uuid' }, context(), 'p'),
    ).toBe('tb.string({ maxLength: 36, minLength: 36, format: "uuid" })');
    expect(
      translate({ anyOf: [{ $ref: '#/$defs/Known' }, { type: 'null' }] }, context(), 'p'),
    ).toBe('KnownSchema.nullable()');
    expect(translate({ const: 'PFC-YT-EMAIL-v1.1' }, context(), 'p')).toBe(
      'tb.literal(PFC_SCHEMA_VERSION)',
    );
    expect(translateTopLevel('Probe', { oneOf: [branch('A'), branch('B')] }, context())).toMatch(
      /^tb\.oneOf\("factType", \[/,
    );
  });
});
