// Frozen wire-compatibility oracle (decision D1): JSON Schema 2020-12 evaluated by Ajv 8 with
// ajv-formats in "full" mode, validateFormats on, strict mode, no coercion, no defaults, no removal.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ajv2020Module from 'ajv/dist/2020.js';
import ajvFormatsModule from 'ajv-formats';
import type { ErrorObject, ValidateFunction } from 'ajv';

type AjvClass = typeof ajv2020Module.default;
type FormatsPlugin = typeof ajvFormatsModule.default;
const Ajv2020 = (ajv2020Module as unknown as { default: AjvClass }).default;
const addFormats = (ajvFormatsModule as unknown as { default: FormatsPlugin }).default;

export const repoRoot = path.resolve(import.meta.dirname, '../..');
export const FROZEN_CONTRACTS = path.join(
  repoRoot,
  'docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/contracts',
);
export const FROZEN_FIXTURES = path.join(
  repoRoot,
  'docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/fixtures/request-validation-cases.json',
);
export const GENERATED_BUNDLE = path.join(repoRoot, 'packages/contracts/schemas/api-schemas.json');

export const ORACLE_OPTIONS = Object.freeze({
  strict: true,
  allErrors: true,
  validateFormats: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
} as const);

export type JsonSchemaBundle = { $id: string; $defs: Record<string, unknown> } & Record<
  string,
  unknown
>;

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export interface OracleResult {
  readonly valid: boolean;
  readonly errors: readonly ErrorObject[];
}

export interface Oracle {
  readonly label: string;
  validate(schemaName: string, payload: unknown): OracleResult;
  validateSchema(schema: object, payload: unknown): OracleResult;
}

export function createOracle(bundle: JsonSchemaBundle, label: string): Oracle {
  const ajv = new Ajv2020(ORACLE_OPTIONS);
  addFormats(ajv, { mode: 'full' });
  ajv.addSchema(bundle);
  const cache = new Map<string, ValidateFunction>();
  const inline = new Map<string, ValidateFunction>();
  const run = (validate: ValidateFunction, payload: unknown): OracleResult => {
    const valid = validate(payload) === true;
    return { valid, errors: valid ? [] : [...(validate.errors ?? [])] };
  };
  return {
    label,
    validate(schemaName, payload) {
      let validate = cache.get(schemaName);
      if (!validate) {
        validate = ajv.getSchema(`${bundle.$id}#/$defs/${schemaName}`);
        if (!validate) throw new Error(`${label}: no schema ${schemaName}`);
        cache.set(schemaName, validate);
      }
      return run(validate, payload);
    },
    validateSchema(schema, payload) {
      const key = JSON.stringify(schema);
      let validate = inline.get(key);
      if (!validate) {
        validate = ajv.compile(schema);
        inline.set(key, validate);
      }
      return run(validate, payload);
    },
  };
}

export const frozenBundle = (): JsonSchemaBundle =>
  readJson<JsonSchemaBundle>(path.join(FROZEN_CONTRACTS, 'api-schemas.json'));
export const generatedBundle = (): JsonSchemaBundle => readJson<JsonSchemaBundle>(GENERATED_BUNDLE);
