// The active wire-contract release TB-SCHEMA-API-v1.1.0 (ADR-0004) = the frozen TB-SCHEMA-API-v1.0.0
// reference (docs/reference/database-api-v1/…, never edited) + the reviewed additive amendment
// (docs/contracts/TB-SCHEMA-API-v1.1.0/amendment.json). `releaseBaseline()` rebuilds the release
// documents from exactly those two inputs: every frozen schema and operation is copied unchanged, the
// amendment's schemas and operation are inserted at their declared places and the OpenAPI document
// version becomes the release's. The parity tests require the generated artifacts to equal the result
// byte for byte, which proves that the active source changes the frozen contract by exactly the
// amendment — nothing removed, renamed or altered.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FROZEN_CONTRACTS, repoRoot, type JsonSchemaBundle } from './oracle.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export const RELEASE_DIR = path.join(repoRoot, 'docs/contracts/TB-SCHEMA-API-v1.1.0');
export const AMENDMENT_FILE = path.join(RELEASE_DIR, 'amendment.json');

export interface Amendment {
  readonly release: string;
  readonly kind: 'ADDITIVE';
  readonly decision: string;
  readonly summary: string;
  readonly base: {
    readonly release: string;
    readonly path: string;
    readonly manifestSha256: string;
    readonly files: Readonly<Record<string, string>>;
  };
  readonly openApiInfoVersion: { readonly from: string; readonly to: string };
  readonly schemas: {
    readonly refForm: string;
    readonly insertAfter: string;
    readonly added: Readonly<Record<string, JsonObject>>;
  };
  readonly operations: {
    readonly insertAfterPath: string;
    readonly added: Readonly<Record<string, Readonly<Record<string, JsonObject>>>>;
  };
  readonly result: {
    readonly schemaCount: number;
    readonly operationCount: number;
    readonly files: Readonly<Record<string, string>>;
  };
}

export const sha256 = (bytes: Buffer | string): string =>
  createHash('sha256').update(bytes).digest('hex');

export const amendmentBytes = (): Buffer => readFileSync(AMENDMENT_FILE);
export const readAmendment = (): Amendment => JSON.parse(amendmentBytes().toString('utf8'));

export const frozenBundleRaw = (): string =>
  readFileSync(path.join(FROZEN_CONTRACTS, 'api-schemas.json'), 'utf8');
export const frozenOpenApiRaw = (): string =>
  readFileSync(path.join(FROZEN_CONTRACTS, 'openapi.json'), 'utf8');

/** A copy of `record` with `entries` inserted right after the key `after` (order preserved). */
export function insertAfter(
  record: JsonObject,
  after: string,
  entries: Readonly<Record<string, Json>>,
): JsonObject {
  if (!(after in record)) throw new Error(`insertion point ${after} is not in the base`);
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = value;
    if (key !== after) continue;
    for (const [name, added] of Object.entries(entries)) {
      if (name in record) throw new Error(`${name} already exists: an addition may not replace`);
      out[name] = structuredClone(added);
    }
  }
  return out;
}

/** The same schema with its JSON Schema `$defs` references written as OpenAPI component refs. */
export function withComponentRefs(schema: Json): Json {
  if (Array.isArray(schema)) return schema.map(withComponentRefs);
  if (schema === null || typeof schema !== 'object') return schema;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(schema)) {
    out[key] =
      key === '$ref' && typeof value === 'string'
        ? value.replace(/^#\/\$defs\//, '#/components/schemas/')
        : withComponentRefs(value);
  }
  return out;
}

export interface ReleaseDocuments {
  readonly bundle: JsonSchemaBundle & JsonObject;
  readonly openApi: JsonObject;
}

/** The release documents: the frozen v1.0.0 documents plus exactly the amendment. */
export function releaseBaseline(amendment: Amendment = readAmendment()): ReleaseDocuments {
  const frozenBundle = JSON.parse(frozenBundleRaw()) as JsonObject;
  const frozenOpenApi = JSON.parse(frozenOpenApiRaw()) as JsonObject;
  const bundle: JsonObject = {};
  for (const [key, value] of Object.entries(frozenBundle)) {
    bundle[key] =
      key === '$defs'
        ? insertAfter(value as JsonObject, amendment.schemas.insertAfter, amendment.schemas.added)
        : value;
  }
  const componentSchemas = Object.fromEntries(
    Object.entries(amendment.schemas.added).map(([name, schema]) => [
      name,
      withComponentRefs(schema),
    ]),
  );
  const openApi: JsonObject = {};
  for (const [key, value] of Object.entries(frozenOpenApi)) {
    if (key === 'info') {
      const info = value as JsonObject;
      if (info['version'] !== amendment.openApiInfoVersion.from) {
        throw new Error(`base info.version ${String(info['version'])} is not the amendment's`);
      }
      openApi[key] = { ...info, version: amendment.openApiInfoVersion.to };
    } else if (key === 'paths') {
      openApi[key] = insertAfter(
        value as JsonObject,
        amendment.operations.insertAfterPath,
        amendment.operations.added as Record<string, Json>,
      );
    } else if (key === 'components') {
      const components = value as JsonObject;
      openApi[key] = {
        ...components,
        schemas: insertAfter(
          components['schemas'] as JsonObject,
          amendment.schemas.insertAfter,
          componentSchemas,
        ),
      };
    } else {
      openApi[key] = value;
    }
  }
  return { bundle: bundle as JsonSchemaBundle & JsonObject, openApi };
}

/** Every `METHOD path` of an OpenAPI document, in document order. */
export function operationKeys(document: JsonObject): string[] {
  return Object.entries(document['paths'] as JsonObject).flatMap(([route, item]) =>
    Object.keys(item as JsonObject).map((method) => `${method.toUpperCase()} ${route}`),
  );
}
