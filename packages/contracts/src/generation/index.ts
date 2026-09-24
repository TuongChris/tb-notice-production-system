// Derived artifacts of the active contract source (ADR-0002).
import { API_CONTRACT_ID, apiSchemaCatalog } from '../api/catalog.js';
import { openApiDocument } from '../api/openapi-document.js';
import { operations } from '../api/operations.js';
import { buildJsonSchemaBundle, buildOpenApiDocument } from './artifacts.js';
import type { JsonObject } from './json-schema.js';

export interface ContractArtifacts {
  /** JSON Schema 2020-12 bundle (`$defs` of every named wire schema). */
  readonly jsonSchemaBundle: JsonObject;
  /** OpenAPI 3.1 document; JSON and YAML are serialized from this one object. */
  readonly openApi: JsonObject;
}

export function buildContractArtifacts(): ContractArtifacts {
  return {
    jsonSchemaBundle: buildJsonSchemaBundle(apiSchemaCatalog, API_CONTRACT_ID),
    openApi: buildOpenApiDocument(openApiDocument, operations, apiSchemaCatalog),
  };
}

export {
  buildJsonSchemaBundle,
  buildOpenApiDocument,
  JSON_SCHEMA_DIALECT,
  type SchemaCatalog,
} from './artifacts.js';
export {
  lowerSchema,
  type JsonObject,
  type JsonValue,
  type LoweringContext,
} from './json-schema.js';
