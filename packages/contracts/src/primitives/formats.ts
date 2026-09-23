// Wire string formats (ADR-0002, decision D1).
//
// Compatibility oracle for the frozen TB-SCHEMA-API-v1.0.0 contract: JSON Schema 2020-12 validated
// by Ajv 8 with ajv-formats in "full" mode. Zod 4 built-in validators (z.uuid(), z.email(),
// z.url(), z.iso.date(), z.iso.datetime()) accept different sets of strings, so they are never
// used for wire formats. Each helper delegates to the exact ajv-formats "full" implementation,
// making runtime acceptance identical to the oracle by construction (parity is also tested).
import { fullFormats } from 'ajv-formats/dist/formats.js';

export const WIRE_FORMATS = ['uuid', 'uri', 'email', 'date', 'date-time'] as const;
export type WireFormat = (typeof WIRE_FORMATS)[number];

type FormatPredicate = (value: string) => boolean;

function predicateFor(format: WireFormat): FormatPredicate {
  const definition: unknown = fullFormats[format];
  if (definition instanceof RegExp) {
    if (definition.global || definition.sticky) {
      throw new Error(`Format ${format}: stateful RegExp flags are not supported.`);
    }
    return (value) => definition.test(value);
  }
  if (typeof definition === 'function') {
    return (value) => definition(value) === true;
  }
  if (
    typeof definition === 'object' &&
    definition !== null &&
    'validate' in definition &&
    typeof definition.validate === 'function'
  ) {
    const validate = definition.validate as (value: string) => unknown;
    return (value) => validate(value) === true;
  }
  throw new Error(`Format ${format}: unsupported ajv-formats definition.`);
}

const predicates: Readonly<Record<WireFormat, FormatPredicate>> = Object.freeze({
  uuid: predicateFor('uuid'),
  uri: predicateFor('uri'),
  email: predicateFor('email'),
  date: predicateFor('date'),
  'date-time': predicateFor('date-time'),
});

export function isWireFormat(value: string): value is WireFormat {
  return (WIRE_FORMATS as readonly string[]).includes(value);
}

/** True when `value` satisfies `format` exactly as Ajv + ajv-formats (full mode) would. */
export function matchesWireFormat(format: WireFormat, value: string): boolean {
  return predicates[format](value);
}
