// Builds the derived contract artifacts (JSON Schema bundle and OpenAPI document) from the active
// source (ADR-0002). Pure and deterministic: output order follows the catalog, operation and
// document source order. Serialization to files is done by scripts/contracts/*.
import type { z } from 'zod';
import type {
  InlineParameter,
  OpenApiDocumentSource,
  OperationSpec,
  ParameterSpec,
} from '../api/operation-types.js';
import { lowerSchema, type JsonObject, type JsonValue } from './json-schema.js';

export type SchemaCatalog = ReadonlyArray<readonly [name: string, schema: z.ZodType]>;

export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** Deep copy of a JSON value (no shared object identity between emitted nodes). */
function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function catalogIndex(catalog: SchemaCatalog): Map<z.ZodType, string> {
  const names = new Map<z.ZodType, string>();
  const seen = new Set<string>();
  for (const [name, schema] of catalog) {
    if (seen.has(name)) throw new Error(`Duplicate catalog schema name ${name}`);
    if (names.has(schema))
      throw new Error(`Schema object registered twice (${names.get(schema)}, ${name})`);
    seen.add(name);
    names.set(schema, name);
  }
  return names;
}

function lowerCatalog(catalog: SchemaCatalog, refPrefix: string): JsonObject {
  const names = catalogIndex(catalog);
  const context = {
    refFor: (schema: z.ZodType) => {
      const name = names.get(schema);
      return name === undefined ? undefined : `${refPrefix}${name}`;
    },
  };
  const out: JsonObject = {};
  for (const [name, schema] of catalog) out[name] = lowerSchema(schema, context, name, true);
  return out;
}

/** JSON Schema 2020-12 bundle with every catalog schema under `$defs`. */
export function buildJsonSchemaBundle(catalog: SchemaCatalog, id: string): JsonObject {
  return { $schema: JSON_SCHEMA_DIALECT, $id: id, $defs: lowerCatalog(catalog, '#/$defs/') };
}

const COMPONENT_SCHEMA_PREFIX = '#/components/schemas/';
const noRefs = { refFor: () => undefined };

function lowerInline(schema: z.ZodType, path: string): JsonObject {
  const lowered = lowerSchema(schema, noRefs, path, true);
  if (lowered === null || typeof lowered !== 'object' || Array.isArray(lowered)) {
    throw new Error(`${path}: expected an object schema`);
  }
  return lowered;
}

function schemaRef(names: Map<z.ZodType, string>, schema: z.ZodType, path: string): JsonObject {
  const name = names.get(schema);
  if (name === undefined)
    throw new Error(`${path}: request/response schemas must be named catalog schemas`);
  return { $ref: `${COMPONENT_SCHEMA_PREFIX}${name}` };
}

function inlineParameter(parameter: InlineParameter, path: string): JsonObject {
  const schema = lowerInline(parameter.schema, `${path}.${parameter.name}`);
  if (parameter.schemaDefault !== undefined) schema['default'] = parameter.schemaDefault;
  const out: JsonObject = { name: parameter.name, in: parameter.in };
  if (parameter.required) out['required'] = true;
  if (parameter.style !== undefined) out['style'] = parameter.style;
  if (parameter.explode !== undefined) out['explode'] = parameter.explode;
  out['schema'] = schema;
  return out;
}

function parameterObject(parameter: ParameterSpec, path: string): JsonObject {
  if ('ref' in parameter) return { $ref: `#/components/parameters/${parameter.ref}` };
  return inlineParameter(parameter, path);
}

/** OpenAPI 3.1 document assembled from the document source, operations and schema catalog. */
export function buildOpenApiDocument(
  document: OpenApiDocumentSource,
  operations: readonly OperationSpec[],
  catalog: SchemaCatalog,
): JsonObject {
  const names = catalogIndex(catalog);
  const security = document.security.map((requirement) =>
    Object.fromEntries(Object.entries(requirement).map(([key, scopes]) => [key, [...scopes]])),
  ) as JsonValue[];
  const successHeaders: JsonObject = {};
  for (const [name, header] of Object.entries(document.successResponse.headers)) {
    const out: JsonObject = { schema: lowerInline(header.schema, `header ${name}`) };
    if (header.description !== undefined) out['description'] = header.description;
    if (header.example !== undefined) out['example'] = header.example;
    successHeaders[name] = out;
  }
  const errorRef = { $ref: `#/components/responses/${document.errorResponse.name}` };

  const paths: JsonObject = {};
  const operationIds = new Set<string>();
  for (const operation of operations) {
    const where = `${operation.method.toUpperCase()} ${operation.path}`;
    if (operationIds.has(operation.operationId))
      throw new Error(`Duplicate operationId ${operation.operationId}`);
    operationIds.add(operation.operationId);
    const responses: JsonObject = {};
    if (operation.success.status === '204') {
      responses['204'] = { description: document.noContentResponse.description };
    } else {
      responses[operation.success.status] = {
        description: document.successResponse.description,
        headers: cloneJson(successHeaders),
        content: {
          'application/json': { schema: schemaRef(names, operation.success.schema, where) },
        },
      };
    }
    for (const status of operation.errors) {
      if (status in responses) throw new Error(`${where}: duplicate response ${status}`);
      responses[status] = { ...errorRef };
    }
    const out: JsonObject = {
      operationId: operation.operationId,
      tags: [...operation.tags],
      summary: operation.summary,
      parameters: operation.parameters.map((parameter) => parameterObject(parameter, where)),
      responses,
      security: operation.security === 'session' ? cloneJson(security) : [],
      'x-precondition-target': operation.preconditionTarget,
      'x-idempotent-write': operation.idempotentWrite,
    };
    if (operation.requestBody !== undefined) {
      out['requestBody'] = {
        required: true,
        content: { 'application/json': { schema: schemaRef(names, operation.requestBody, where) } },
      };
    }
    const pathItem = (paths[operation.path] ??= {}) as JsonObject;
    if (operation.method in pathItem) throw new Error(`${where}: duplicate method`);
    pathItem[operation.method] = out;
  }

  const parameters: JsonObject = {};
  for (const [key, parameter] of Object.entries(document.sharedParameters)) {
    parameters[key] = {
      name: parameter.name,
      in: parameter.in,
      required: parameter.required,
      schema: lowerInline(parameter.schema, `parameter ${key}`),
      description: parameter.description,
    };
  }
  const securitySchemes: JsonObject = {};
  for (const [key, scheme] of Object.entries(document.securitySchemes)) {
    securitySchemes[key] = {
      type: scheme.type,
      in: scheme.in,
      name: scheme.name,
      description: scheme.description,
    };
  }

  return {
    openapi: document.openapi,
    info: {
      title: document.info.title,
      version: document.info.version,
      description: document.info.description,
    },
    servers: document.servers.map((server) => ({
      url: server.url,
      description: server.description,
    })),
    tags: document.tags.map((name) => ({ name })),
    paths,
    components: {
      schemas: lowerCatalog(catalog, COMPONENT_SCHEMA_PREFIX),
      securitySchemes,
      parameters,
      responses: {
        [document.errorResponse.name]: {
          description: document.errorResponse.description,
          content: {
            'application/json': {
              schema: schemaRef(names, document.errorResponse.schema, 'error response'),
            },
          },
        },
      },
    },
    security: cloneJson(security),
  };
}
