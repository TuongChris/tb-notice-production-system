// The active wire-contract release TB-SCHEMA-API-v1.2.0 (ADR-0005) = the frozen TB-SCHEMA-API-v1.0.0
// reference (docs/reference/database-api-v1/…, never edited) + the reviewed additive amendments, in
// release order: TB-SCHEMA-API-v1.1.0 (ADR-0004) and TB-SCHEMA-API-v1.2.0 (ADR-0005), each recorded
// once in docs/contracts/<release>/amendment.json and never edited. `releaseDocuments(release)`
// rebuilds the documents of a release from exactly those inputs: every earlier schema and operation
// is copied unchanged, each amendment's schemas and operation are inserted at their declared places
// and the OpenAPI document version becomes the release's. The parity tests require the generated
// artifacts to equal the active release byte for byte, which proves that the active source changes
// the frozen contract by exactly the amendments — nothing removed, renamed or altered — and that an
// earlier release is still reproduced exactly, to the digests recorded when it was accepted.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';
import { FROZEN_CONTRACTS, repoRoot, type JsonSchemaBundle } from './oracle.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** The frozen reference every release extends. */
export const FROZEN_RELEASE = 'TB-SCHEMA-API-v1.0.0';
/** The additive releases, in order; the last is the active one. */
export const RELEASES = ['TB-SCHEMA-API-v1.1.0', 'TB-SCHEMA-API-v1.2.0'] as const;
export type Release = (typeof RELEASES)[number];
export const ACTIVE_RELEASE: Release = 'TB-SCHEMA-API-v1.2.0';

export const releaseDir = (release: Release): string =>
  path.join(repoRoot, 'docs/contracts', release);
export const amendmentFile = (release: Release): string =>
  path.join(releaseDir(release), 'amendment.json');

/** The base of the first release: the frozen pack, identified by its manifest and files. */
export interface FrozenBase {
  readonly release: string;
  readonly path: string;
  readonly manifestSha256: string;
  readonly files: Readonly<Record<string, string>>;
}

/** The base of a later release: the previous release, identified by its record and documents. */
export interface ReleaseBase {
  readonly release: string;
  readonly path: string;
  readonly amendmentSha256: string;
  /** The previous release's documents (its `result.files`), reproduced by composition. */
  readonly files: Readonly<Record<string, string>>;
}

export interface Amendment {
  readonly release: string;
  readonly kind: 'ADDITIVE';
  readonly decision: string;
  readonly summary: string;
  readonly base: FrozenBase | ReleaseBase;
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

export const amendmentBytes = (release: Release = ACTIVE_RELEASE): Buffer =>
  readFileSync(amendmentFile(release));
export const readAmendment = (release: Release = ACTIVE_RELEASE): Amendment =>
  JSON.parse(amendmentBytes(release).toString('utf8'));

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

/** The frozen v1.0.0 documents, exactly as parsed from the frozen pack. */
export function frozenDocuments(): ReleaseDocuments {
  return {
    bundle: JSON.parse(frozenBundleRaw()) as JsonSchemaBundle & JsonObject,
    openApi: JSON.parse(frozenOpenApiRaw()) as JsonObject,
  };
}

/** `base` plus exactly one amendment (the base documents are not changed). */
export function applyAmendment(base: ReleaseDocuments, amendment: Amendment): ReleaseDocuments {
  const bundle: JsonObject = {};
  for (const [key, value] of Object.entries(base.bundle as JsonObject)) {
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
  for (const [key, value] of Object.entries(base.openApi)) {
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

/**
 * The documents of `release`: the frozen v1.0.0 documents plus every amendment up to and including
 * that release, each applied to the release it names as its base.
 */
export function releaseDocuments(release: Release = ACTIVE_RELEASE): ReleaseDocuments {
  let documents = frozenDocuments();
  let previous: string = FROZEN_RELEASE;
  for (const name of RELEASES.slice(0, RELEASES.indexOf(release) + 1)) {
    const amendment = readAmendment(name);
    if (amendment.release !== name || amendment.base.release !== previous) {
      throw new Error(`${name}: expected a release extending ${previous}`);
    }
    documents = applyAmendment(documents, amendment);
    previous = name;
  }
  return documents;
}

/** The active release (TB-SCHEMA-API-v1.2.0): what the generated artifacts must equal. */
export const releaseBaseline = (): ReleaseDocuments => releaseDocuments(ACTIVE_RELEASE);

/** YAML serialization options of the generator (scripts/contracts/render.ts), pinned by a test. */
export const YAML_OPTIONS = {
  aliasDuplicateObjects: false,
  lineWidth: 0,
  minContentWidth: 0,
  indent: 2,
  sortMapEntries: false,
} as const;

/** The three artifacts of a release, serialized exactly as `yarn contracts:generate` writes them. */
export function renderDocuments(documents: ReleaseDocuments): Record<string, string> {
  return {
    'packages/contracts/schemas/api-schemas.json': JSON.stringify(documents.bundle, null, 2),
    'packages/contracts/openapi/openapi.json': JSON.stringify(documents.openApi, null, 2),
    'packages/contracts/openapi/openapi.yaml': stringify(documents.openApi, YAML_OPTIONS),
  };
}

/** Every `METHOD path` of an OpenAPI document, in document order. */
export function operationKeys(document: JsonObject): string[] {
  return Object.entries(document['paths'] as JsonObject).flatMap(([route, item]) =>
    Object.keys(item as JsonObject).map((method) => `${method.toUpperCase()} ${route}`),
  );
}
