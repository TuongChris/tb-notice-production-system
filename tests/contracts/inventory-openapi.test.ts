// Inventory and OpenAPI parity of the active contract source with the frozen TB-SCHEMA-API-v1.0.0
// reference (P0-D). Byte identity of the serialized JSON is checked first; the explicit inventory
// below itemizes the properties required by the transition so a future difference is legible.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parse, parseDocument, visit } from 'yaml';
import {
  apiSchemaCatalog,
  buildContractArtifacts,
  operations,
  PFC_SCHEMA_VERSION,
  ProductionContextSchema,
} from '../../packages/contracts/src/index.js';
import { FROZEN_CONTRACTS, readJson, repoRoot } from './oracle.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const frozenBundleRaw = readFileSync(path.join(FROZEN_CONTRACTS, 'api-schemas.json'), 'utf8');
const frozenOpenApiRaw = readFileSync(path.join(FROZEN_CONTRACTS, 'openapi.json'), 'utf8');
const frozenBundle = JSON.parse(frozenBundleRaw) as JsonObject;
const frozenOpenApi = JSON.parse(frozenOpenApiRaw) as JsonObject;
const { jsonSchemaBundle, openApi } = buildContractArtifacts();

/** Itemized inventory of one schema tree: every constraint with its JSON path. */
function inventory(root: Json, rootPath: string): Record<string, string[]> {
  const out: Record<string, string[]> = {
    properties: [],
    required: [],
    strictObjects: [],
    openObjects: [],
    enums: [],
    consts: [],
    patterns: [],
    numericBounds: [],
    arrayBounds: [],
    stringBounds: [],
    formats: [],
    nullableUnions: [],
    oneOf: [],
    minProperties: [],
    refs: [],
    descriptions: [],
  };
  const push = (key: string, value: string) => (out[key] as string[]).push(value);
  const walk = (node: Json, at: string) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (typeof node['$ref'] === 'string') push('refs', `${at} -> ${node['$ref'].split('/').pop()}`);
    if (Array.isArray(node['anyOf'])) {
      push('nullableUnions', `${at} ${JSON.stringify(node['anyOf'][1])}`);
      walk(node['anyOf'][0] as Json, `${at}|nonnull`);
    }
    if (Array.isArray(node['oneOf'])) {
      push('oneOf', `${at} branches=${node['oneOf'].length}`);
      node['oneOf'].forEach((branch, i) => walk(branch, `${at}|${i}`));
    }
    if ('const' in node) push('consts', `${at}=${JSON.stringify(node['const'])}`);
    if (Array.isArray(node['enum'])) push('enums', `${at}=${JSON.stringify(node['enum'])}`);
    if (typeof node['pattern'] === 'string') push('patterns', `${at}=${node['pattern']}`);
    if (typeof node['format'] === 'string') push('formats', `${at}=${node['format']}`);
    if (node['type'] === 'string' && ('minLength' in node || 'maxLength' in node)) {
      push(
        'stringBounds',
        `${at} min=${String(node['minLength'])} max=${String(node['maxLength'])}`,
      );
    }
    if (node['type'] === 'integer')
      push('numericBounds', `${at} ${String(node['minimum'])}..${String(node['maximum'])}`);
    if (node['type'] === 'array') {
      push('arrayBounds', `${at} ${String(node['minItems'])}..${String(node['maxItems'])}`);
      walk(node['items'] as Json, `${at}[]`);
    }
    if (typeof node['description'] === 'string')
      push('descriptions', `${at}: ${node['description']}`);
    if (node['type'] === 'object') {
      if (node['additionalProperties'] === false) push('strictObjects', at);
      if (node['additionalProperties'] === true) push('openObjects', at);
      if (typeof node['minProperties'] === 'number')
        push('minProperties', `${at}=${node['minProperties']}`);
      const properties = (node['properties'] ?? {}) as JsonObject;
      push('properties', `${at}: ${Object.keys(properties).join(',')}`);
      push('required', `${at}: ${JSON.stringify(node['required'] ?? null)}`);
      for (const [key, value] of Object.entries(properties)) walk(value, `${at}.${key}`);
    }
  };
  walk(root, rootPath);
  return out;
}

const frozenDefs = frozenBundle['$defs'] as JsonObject;
const generatedDefs = jsonSchemaBundle['$defs'] as JsonObject;

describe('JSON Schema bundle parity (284 schemas)', () => {
  it('serializes byte-identically to the frozen api-schemas.json', () => {
    expect(JSON.stringify(jsonSchemaBundle, null, 2) === frozenBundleRaw).toBe(true);
  });

  it('is deep-equal to the frozen bundle', () => {
    expect(isDeepStrictEqual(jsonSchemaBundle, frozenBundle)).toBe(true);
  });

  it('retains all 284 schema identities in the frozen order', () => {
    expect(Object.keys(generatedDefs)).toHaveLength(284);
    expect(Object.keys(generatedDefs)).toEqual(Object.keys(frozenDefs));
    expect(apiSchemaCatalog.map(([name]) => name)).toEqual(Object.keys(frozenDefs));
    expect(jsonSchemaBundle['$id']).toBe(frozenBundle['$id']);
    expect(jsonSchemaBundle['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it.each(Object.keys(frozenDefs).map((name) => [name] as const))(
    '%s: itemized inventory equal',
    (name) => {
      expect(inventory(generatedDefs[name] as Json, name)).toEqual(
        inventory(frozenDefs[name] as Json, name),
      );
    },
  );

  it('itemized totals (strict objects, oneOf, minProperties, nullable unions, formats, …)', () => {
    const total = (defs: JsonObject) => {
      const sums: Record<string, number> = {};
      for (const [name, schema] of Object.entries(defs)) {
        for (const [key, items] of Object.entries(inventory(schema, name)))
          sums[key] = (sums[key] ?? 0) + items.length;
      }
      return sums;
    };
    const generatedTotals = total(generatedDefs);
    expect(generatedTotals).toEqual(total(frozenDefs));
    expect(generatedTotals['oneOf']).toBe(4);
    expect(generatedTotals['minProperties']).toBe(12);
    expect(generatedTotals['nullableUnions']).toBe(691);
    expect(generatedTotals['formats']).toBe(626);
    expect(generatedTotals['patterns']).toBe(80);
    expect(generatedTotals['refs']).toBe(410);
    expect(generatedTotals['enums']).toBe(216);
    expect(generatedTotals['consts']).toBe(49);
    expect(generatedTotals['numericBounds']).toBe(49);
    expect(generatedTotals['arrayBounds']).toBe(123);
  });

  it('keeps the four oneOf unions and twelve non-empty PATCH bodies', () => {
    const oneOf = Object.entries(generatedDefs)
      .filter(([, s]) => Array.isArray((s as JsonObject)['oneOf']))
      .map(([n]) => n);
    expect(oneOf).toEqual(['FactValue', 'CaseFact', 'CreateFact', 'ReviseFact']);
    const nonEmpty = Object.entries(generatedDefs)
      .filter(([, s]) => (s as JsonObject)['minProperties'] === 1)
      .map(([n]) => n);
    expect(nonEmpty).toHaveLength(12);
    for (const name of nonEmpty)
      expect((generatedDefs[name] as JsonObject)['required']).toEqual([]);
  });
});

describe('PFC-YT-EMAIL-v1.1 preservation', () => {
  it('the active constant, the Zod schema and the generated schemas carry exactly PFC-YT-EMAIL-v1.1', () => {
    expect(PFC_SCHEMA_VERSION).toBe('PFC-YT-EMAIL-v1.1');
    const production = generatedDefs['ProductionContext'] as JsonObject;
    expect((production['properties'] as JsonObject)['schemaVersion']).toEqual({
      const: 'PFC-YT-EMAIL-v1.1',
    });
    const appMeta = generatedDefs['AppMeta'] as JsonObject;
    expect((appMeta['properties'] as JsonObject)['contractVersion']).toEqual({
      const: 'PFC-YT-EMAIL-v1.1',
    });
    expect(ProductionContextSchema.shape.schemaVersion.safeParse('PFC-YT-EMAIL-v1.1').success).toBe(
      true,
    );
    for (const wrong of [
      'PFC-YT-EMAIL-v1',
      'PFC-YT-EMAIL-v1.1.0',
      'pfc-yt-email-v1.1',
      'PFC-YT-EMAIL-v1.2',
    ]) {
      expect(ProductionContextSchema.shape.schemaVersion.safeParse(wrong).success, wrong).toBe(
        false,
      );
    }
  });
});

type Operation = JsonObject;
const methodsOf = (doc: JsonObject) =>
  Object.entries(doc['paths'] as JsonObject).flatMap(([route, item]) =>
    Object.entries(item as JsonObject).map(([method, op]) => ({
      route,
      method,
      op: op as Operation,
    })),
  );

describe('OpenAPI parity (141 operations)', () => {
  it('serializes byte-identically to the frozen openapi.json and is deep-equal', () => {
    expect(JSON.stringify(openApi, null, 2) === frozenOpenApiRaw).toBe(true);
    expect(isDeepStrictEqual(openApi, frozenOpenApi)).toBe(true);
  });

  it('keeps OpenAPI 3.1.1, the loopback server URL, info, tags, security and components', () => {
    expect(openApi['openapi']).toBe('3.1.1');
    expect(openApi['servers']).toEqual([
      {
        url: 'http://localhost:3000/api/v1',
        description: 'Loopback development only; production requires HTTPS.',
      },
    ]);
    for (const key of ['info', 'tags', 'security'])
      expect(openApi[key], key).toEqual(frozenOpenApi[key]);
    const components = openApi['components'] as JsonObject;
    const frozenComponents = frozenOpenApi['components'] as JsonObject;
    for (const key of ['schemas', 'securitySchemes', 'parameters', 'responses']) {
      expect(components[key], key).toEqual(frozenComponents[key]);
    }
  });

  const frozenOps = methodsOf(frozenOpenApi);
  const generatedOps = new Map(methodsOf(openApi).map((o) => [`${o.method} ${o.route}`, o.op]));

  it('has the same 141 method/path pairs and 141 unique operationIds', () => {
    expect(frozenOps).toHaveLength(141);
    expect(generatedOps.size).toBe(141);
    expect(operations).toHaveLength(141);
    expect(new Set(operations.map((o) => o.operationId)).size).toBe(141);
  });

  it.each(frozenOps.map((o) => [`${o.method.toUpperCase()} ${o.route}`, o] as const))(
    '%s',
    (_label, frozen) => {
      const generated = generatedOps.get(`${frozen.method} ${frozen.route}`);
      expect(generated, 'operation missing').toBeDefined();
      const g = generated as Operation;
      const f = frozen.op;
      for (const key of [
        'operationId',
        'tags',
        'summary',
        'parameters',
        'requestBody',
        'security',
        'x-precondition-target',
        'x-idempotent-write',
      ]) {
        expect(g[key], key).toEqual(f[key]);
      }
      const gResponses = g['responses'] as JsonObject;
      const fResponses = f['responses'] as JsonObject;
      expect(Object.keys(gResponses), 'response status codes').toEqual(Object.keys(fResponses));
      for (const [status, response] of Object.entries(fResponses)) {
        expect(gResponses[status], `response ${status} (schema, headers)`).toEqual(response);
      }
      expect(Object.keys(g).sort()).toEqual(Object.keys(f).sort());
    },
  );

  it('every $ref in the generated OpenAPI resolves', () => {
    const unresolved: string[] = [];
    const resolve = (ref: string) =>
      ref
        .slice(2)
        .split('/')
        .reduce<Json | undefined>(
          (node, key) => (node as JsonObject | undefined)?.[key],
          openApi as Json,
        );
    const walk = (node: Json) => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === '$ref' && typeof value === 'string' && resolve(value) === undefined)
            unresolved.push(value);
          else walk(value);
        }
      }
    };
    walk(openApi);
    expect(unresolved).toEqual([]);
  });
});

describe('OpenAPI YAML', () => {
  const yamlText = readFileSync(
    path.join(repoRoot, 'packages/contracts/openapi/openapi.yaml'),
    'utf8',
  );

  it('parses with default YAML settings to exactly the generated JSON document', () => {
    expect(isDeepStrictEqual(parse(yamlText), openApi)).toBe(true);
  });

  it('contains no anchors or aliases', () => {
    let anchorsOrAliases = 0;
    visit(parseDocument(yamlText), {
      Alias() {
        anchorsOrAliases += 1;
      },
      Node(_key, node) {
        if ('anchor' in node && node.anchor) anchorsOrAliases += 1;
      },
    });
    expect(anchorsOrAliases).toBe(0);
  });

  it('is semantically equal to the frozen openapi.yaml (which uses 45 anchors / 351 aliases)', () => {
    const frozenYaml = parseDocument(
      readFileSync(path.join(FROZEN_CONTRACTS, 'openapi.yaml'), 'utf8'),
    );
    expect(isDeepStrictEqual(frozenYaml.toJS({ maxAliasCount: -1 }), openApi)).toBe(true);
  });

  it('committed JSON artifacts equal the in-memory build', () => {
    expect(readJson(path.join(repoRoot, 'packages/contracts/openapi/openapi.json'))).toEqual(
      openApi,
    );
    expect(readJson(path.join(repoRoot, 'packages/contracts/schemas/api-schemas.json'))).toEqual(
      jsonSchemaBundle,
    );
  });
});
