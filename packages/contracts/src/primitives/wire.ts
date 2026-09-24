// TB wire primitives (ADR-0002).
//
// Every wire schema in @tb/contracts is built from these builders. A builder creates the Zod
// runtime schema *and* records its JSON Schema lowering from the same parameters, so a constraint
// is authored once. The lowering in ../generation/json-schema.ts accepts only schemas created here
// (plus Zod's nullable/optional wrappers) and fails closed on anything else — including any check
// added outside these builders, because Zod's native JSON Schema conversion silently drops custom
// refinements.
import { z } from 'zod';
import { matchesWireFormat, type WireFormat } from './formats.js';
import { codePointLength } from './unicode.js';

export type WireLowering =
  | {
      readonly kind: 'string';
      readonly maxLength?: number;
      readonly minLength?: number;
      readonly format?: WireFormat;
      readonly pattern?: string;
      readonly description?: string;
    }
  | { readonly kind: 'integer'; readonly minimum: number; readonly maximum: number }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'const'; readonly value: string | boolean }
  | { readonly kind: 'array'; readonly minItems: number; readonly maxItems: number }
  | { readonly kind: 'object'; readonly minProperties?: number; readonly description?: string }
  | { readonly kind: 'looseObject'; readonly description?: string }
  | { readonly kind: 'oneOf'; readonly discriminator: string; readonly description?: string };

interface Registration {
  readonly lowering: WireLowering;
  readonly checks: readonly object[];
}

const registrations = new WeakMap<object, Registration>();

/** Lowering recorded for a schema created by a TB builder, or undefined. */
export function wireRegistration(schema: object): Registration | undefined {
  return registrations.get(schema);
}

function register<T extends object>(
  schema: T,
  lowering: WireLowering,
  checks: readonly object[],
): T {
  registrations.set(schema, { lowering, checks });
  return schema;
}

function assertNonNegativeInteger(name: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${name} must be a non-negative safe integer (got ${value}).`);
  }
}

export interface StringOptions {
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly format?: WireFormat;
  readonly pattern?: string;
  readonly description?: string;
}

/**
 * String with JSON Schema semantics: lengths in Unicode code points, `pattern` compiled with the
 * `u` flag (as Ajv does), and `format` validated by the ajv-formats "full" implementation.
 */
function string(options: StringOptions = {}): z.ZodString {
  const { maxLength, minLength, format, pattern, description } = options;
  assertNonNegativeInteger('maxLength', maxLength);
  assertNonNegativeInteger('minLength', minLength);
  const checks: z.core.$ZodCheck<string>[] = [];
  if (maxLength !== undefined) {
    checks.push(
      z.refine((value: string) => codePointLength(value) <= maxLength, {
        message: `Must contain at most ${maxLength} Unicode code points`,
      }),
    );
  }
  if (minLength !== undefined) {
    checks.push(
      z.refine((value: string) => codePointLength(value) >= minLength, {
        message: `Must contain at least ${minLength} Unicode code points`,
      }),
    );
  }
  if (format !== undefined) {
    checks.push(
      z.refine((value: string) => matchesWireFormat(format, value), {
        message: `Must be a valid ${format} (JSON Schema format, ajv-formats full mode)`,
      }),
    );
  }
  if (pattern !== undefined) {
    const expression = new RegExp(pattern, 'u');
    checks.push(
      z.refine((value: string) => expression.test(value), {
        message: `Must match pattern ${pattern}`,
      }),
    );
  }
  let schema = checks.length > 0 ? z.string().check(...checks) : z.string();
  if (description !== undefined) schema = schema.describe(description);
  return register(schema, { kind: 'string', ...options }, checks);
}

export interface IntegerOptions {
  readonly minimum: number;
  readonly maximum: number;
}

/** Integer (any JSON number with no fractional part, as Ajv's `integer` type) within bounds. */
function integer(options: IntegerOptions): z.ZodNumber {
  const { minimum, maximum } = options;
  const checks: z.core.$ZodCheck<number>[] = [
    z.refine((value: number) => Number.isInteger(value), { message: 'Must be an integer' }),
    z.refine((value: number) => value >= minimum, { message: `Must be >= ${minimum}` }),
    z.refine((value: number) => value <= maximum, { message: `Must be <= ${maximum}` }),
  ];
  return register(z.number().check(...checks), { kind: 'integer', minimum, maximum }, checks);
}

function boolean(): z.ZodBoolean {
  return register(z.boolean(), { kind: 'boolean' }, []);
}

function enumeration<const T extends readonly [string, ...string[]]>(
  values: T,
): z.ZodEnum<{ [K in T[number]]: K }> {
  return register(z.enum(values), { kind: 'enum', values: [...values] }, []);
}

function literal<const T extends string | boolean>(value: T): z.ZodLiteral<T> {
  return register(z.literal(value), { kind: 'const', value }, []);
}

export interface ArrayOptions {
  readonly minItems: number;
  readonly maxItems: number;
}

function array<T extends z.ZodType>(item: T, options: ArrayOptions): z.ZodArray<T> {
  const { minItems, maxItems } = options;
  assertNonNegativeInteger('minItems', minItems);
  assertNonNegativeInteger('maxItems', maxItems);
  const checks: z.core.$ZodCheck<unknown[]>[] = [
    z.refine((value: unknown[]) => value.length >= minItems, {
      message: `Must contain at least ${minItems} items`,
    }),
    z.refine((value: unknown[]) => value.length <= maxItems, {
      message: `Must contain at most ${maxItems} items`,
    }),
  ];
  return register(z.array(item).check(...checks), { kind: 'array', minItems, maxItems }, checks);
}

export interface ObjectOptions {
  /** JSON Schema minProperties (used for non-empty PATCH bodies). */
  readonly minProperties?: number;
  readonly description?: string;
}

/** Strict object: unknown keys are rejected (JSON Schema additionalProperties: false). */
function object<const S extends z.core.$ZodLooseShape>(
  shape: S,
  options: ObjectOptions = {},
): z.ZodObject<S, z.core.$strict> {
  const { minProperties, description } = options;
  assertNonNegativeInteger('minProperties', minProperties);
  const checks: z.core.$ZodCheck<object>[] = [];
  if (minProperties !== undefined) {
    checks.push(
      z.refine((value: object) => Object.keys(value).length >= minProperties, {
        message:
          minProperties === 1
            ? 'At least one field is required'
            : `Must contain at least ${minProperties} properties`,
      }),
    );
  }
  let schema = z.strictObject(shape);
  if (checks.length > 0) schema = schema.check(...checks);
  if (description !== undefined) schema = schema.describe(description);
  return register(schema, { kind: 'object', ...options }, checks);
}

/** Open JSON object (JSON Schema additionalProperties: true); arrays and null are rejected. */
function looseObject(
  options: { readonly description?: string } = {},
): z.ZodRecord<z.ZodString, z.ZodUnknown> {
  let schema = z.record(z.string(), z.unknown());
  if (options.description !== undefined) schema = schema.describe(options.description);
  return register(schema, { kind: 'looseObject', ...options }, []);
}

/**
 * JSON Schema oneOf whose branches are strict objects distinguished by a required constant
 * discriminator property; exactly-one-match is then equivalent to discriminator dispatch.
 */
function oneOf<
  const D extends string,
  const Options extends readonly [z.core.$ZodTypeDiscriminable, ...z.core.$ZodTypeDiscriminable[]],
>(
  discriminator: D,
  options: Options,
  settings: { readonly description?: string } = {},
): z.ZodDiscriminatedUnion<Options, D> {
  let schema = z.discriminatedUnion(discriminator, options);
  if (settings.description !== undefined) schema = schema.describe(settings.description);
  return register(schema, { kind: 'oneOf', discriminator, ...settings }, []);
}

/** TB wire schema builders. Use these instead of raw `z.*` constructors for wire contracts. */
export const tb = Object.freeze({
  string,
  integer,
  boolean,
  enum: enumeration,
  literal,
  array,
  object,
  looseObject,
  oneOf,
});
