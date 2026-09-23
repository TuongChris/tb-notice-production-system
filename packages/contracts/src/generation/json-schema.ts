// Restricted Zod → JSON Schema 2020-12 lowering for TB wire schemas (ADR-0002).
//
// Zod 4's native `z.toJSONSchema` is not used for wire contracts: it silently drops custom
// refinements (such as Unicode code-point lengths and ajv-formats compatibility checks), rewrites
// nullable primitives as `type: [T, "null"]`, omits empty `required` lists and adds keywords the
// frozen contract does not contain. This lowering accepts only:
//   - schemas created by the `tb` builders (with exactly the checks those builders registered),
//   - Zod `nullable` wrappers (lowered to `anyOf: [T, {type: "null"}]`),
//   - Zod `optional` wrappers directly on object properties (property omitted from `required`),
//   - named catalog schemas (lowered to `$ref`).
// Anything else throws with the schema path, i.e. fails closed.
import type { z } from 'zod';
import { wireRegistration, type WireLowering } from '../primitives/wire.js';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface LoweringContext {
  /** `$ref` URI for a named catalog schema, or undefined for inline schemas. */
  refFor(schema: z.ZodType): string | undefined;
}

interface ZodInternals {
  readonly _zod: { readonly def: Record<string, unknown> & { readonly type: string } };
}

function internals(schema: unknown, path: string): ZodInternals['_zod']['def'] {
  const def = (schema as Partial<ZodInternals> | null | undefined)?._zod?.def;
  if (!def || typeof def.type !== 'string') throw new Error(`${path}: not a Zod schema`);
  return def;
}

function checksOf(def: Record<string, unknown>): readonly unknown[] {
  const checks = def['checks'];
  return Array.isArray(checks) ? checks : [];
}

function requireRegistration<K extends WireLowering['kind']>(
  schema: z.ZodType,
  def: Record<string, unknown>,
  kind: K,
  path: string,
): Extract<WireLowering, { kind: K }> {
  const registration = wireRegistration(schema);
  if (!registration) {
    throw new Error(`${path}: ${String(def['type'])} schema was not created by a tb builder`);
  }
  if (registration.lowering.kind !== kind) {
    throw new Error(`${path}: expected tb ${kind}, found tb ${registration.lowering.kind}`);
  }
  const actual = checksOf(def);
  const expected = registration.checks;
  if (
    actual.length !== expected.length ||
    actual.some((check, index) => check !== expected[index])
  ) {
    throw new Error(`${path}: checks were added or removed outside the tb builder (unsupported)`);
  }
  return registration.lowering as Extract<WireLowering, { kind: K }>;
}

function assertNoChecks(def: Record<string, unknown>, path: string): void {
  if (checksOf(def).length > 0)
    throw new Error(`${path}: checks on ${String(def['type'])} wrappers are unsupported`);
}

/** Lowers one TB wire schema. `root` disables `$ref` for the schema being defined itself. */
export function lowerSchema(
  schema: z.ZodType,
  context: LoweringContext,
  path: string,
  root = false,
): JsonValue {
  if (!root) {
    const ref = context.refFor(schema);
    if (ref !== undefined) return { $ref: ref };
  }
  const def = internals(schema, path);
  switch (def.type) {
    case 'nullable': {
      assertNoChecks(def, path);
      return {
        anyOf: [lowerSchema(def['innerType'] as z.ZodType, context, path), { type: 'null' }],
      };
    }
    case 'string': {
      const l = requireRegistration(schema, def, 'string', path);
      const out: JsonObject = { type: 'string' };
      if (l.maxLength !== undefined) out['maxLength'] = l.maxLength;
      if (l.minLength !== undefined) out['minLength'] = l.minLength;
      if (l.format !== undefined) out['format'] = l.format;
      if (l.pattern !== undefined) out['pattern'] = l.pattern;
      if (l.description !== undefined) out['description'] = l.description;
      return out;
    }
    case 'number': {
      const l = requireRegistration(schema, def, 'integer', path);
      return { type: 'integer', minimum: l.minimum, maximum: l.maximum };
    }
    case 'boolean': {
      requireRegistration(schema, def, 'boolean', path);
      return { type: 'boolean' };
    }
    case 'enum': {
      const l = requireRegistration(schema, def, 'enum', path);
      const entries = Object.values(def['entries'] as Record<string, string>);
      if (entries.length !== l.values.length || entries.some((v, i) => v !== l.values[i])) {
        throw new Error(`${path}: enum entries differ from the registered values`);
      }
      return { type: 'string', enum: [...l.values] };
    }
    case 'literal': {
      const l = requireRegistration(schema, def, 'const', path);
      const values = def['values'] as unknown[];
      if (values.length !== 1 || values[0] !== l.value)
        throw new Error(`${path}: unsupported literal`);
      return { const: l.value };
    }
    case 'array': {
      const l = requireRegistration(schema, def, 'array', path);
      return {
        type: 'array',
        items: lowerSchema(def['element'] as z.ZodType, context, `${path}[]`),
        minItems: l.minItems,
        maxItems: l.maxItems,
      };
    }
    case 'object': {
      const l = requireRegistration(schema, def, 'object', path);
      const catchall = def['catchall'] as z.ZodType | undefined;
      if (!catchall || internals(catchall, path).type !== 'never') {
        throw new Error(`${path}: only strict objects (unknown keys rejected) are supported`);
      }
      const shape = def['shape'] as Record<string, z.ZodType>;
      const properties: JsonObject = {};
      const required: string[] = [];
      for (const key of Object.keys(shape)) {
        const propertyPath = `${path}.${key}`;
        let property = shape[key] as z.ZodType;
        const propertyDef = internals(property, propertyPath);
        if (propertyDef.type === 'optional') {
          assertNoChecks(propertyDef, propertyPath);
          property = propertyDef['innerType'] as z.ZodType;
        } else {
          required.push(key);
        }
        properties[key] = lowerSchema(property, context, propertyPath);
      }
      const out: JsonObject = { type: 'object', properties, required, additionalProperties: false };
      if (l.minProperties !== undefined) out['minProperties'] = l.minProperties;
      if (l.description !== undefined) out['description'] = l.description;
      return out;
    }
    case 'record': {
      const l = requireRegistration(schema, def, 'looseObject', path);
      const out: JsonObject = { type: 'object', additionalProperties: true };
      if (l.description !== undefined) out['description'] = l.description;
      return out;
    }
    case 'union': {
      const l = requireRegistration(schema, def, 'oneOf', path);
      if (
        def['discriminator'] !== l.discriminator ||
        def['unionFallback'] === true ||
        def['inclusive'] === true
      ) {
        throw new Error(`${path}: only exclusive discriminated unions are supported`);
      }
      const options = def['options'] as z.ZodType[];
      const out: JsonObject = {
        oneOf: options.map((option, index) => lowerSchema(option, context, `${path}|${index}`)),
      };
      if (l.description !== undefined) out['description'] = l.description;
      return out;
    }
    case 'optional':
      throw new Error(`${path}: optional is only supported directly on object properties`);
    default:
      throw new Error(`${path}: unsupported Zod construct "${def.type}" for wire contracts`);
  }
}
