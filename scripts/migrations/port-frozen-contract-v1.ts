// ONE-TIME port of the frozen TB-SCHEMA-API-v1.0.0 contract into active Zod source (ADR-0002, D2).
//
//   node scripts/migrations/port-frozen-contract-v1.ts --out-root <dir> [--overwrite]
//
// Reads ONLY the frozen reference inputs listed in FROZEN_INPUTS, after verifying them against the
// frozen MANIFEST.sha256 and its pinned identity. Writes TypeScript source below --out-root
// (the initial transition used --out-root packages/contracts/src). Deterministic: no timestamps,
// stable ordering, formatting by the repository's pinned Prettier.
//
// This script is committed as provenance of the Zod-first transition. It is NOT the normal
// authoring workflow: after the transition is accepted, packages/contracts/src/** is the editable
// source and this script must not be re-run over it (existing files are refused unless
// --overwrite is given explicitly).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REFERENCE_DIR = path.join(
  repoRoot,
  'docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1',
);
const REFERENCE_RELEASE = 'TB-SCHEMA-API-v1.0.0';
/** MANIFEST.sha256 identity pinned by the architecture pack (REFERENCE_BASELINE.json). */
const PINNED_MANIFEST_SHA256 = '42c2a419332d666b9d3f94ebcf16310f4d1c14af137eec6d55f4780928646e9c';
const FROZEN_INPUTS = [
  'contracts/api-schemas.json',
  'contracts/openapi.json',
  'contracts/endpoint-catalog.json',
] as const;
const PFC_SCHEMA_VERSION = 'PFC-YT-EMAIL-v1.1';
const PRODUCTION_CONTEXT = 'ProductionContext';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function fail(message: string): never {
  throw new Error(`[port] ${message}`);
}

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

function isObject(value: Json | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keysOf(node: JsonObject): string[] {
  return Object.keys(node);
}

function expectKeys(node: JsonObject, allowed: readonly string[], where: string): void {
  const unexpected = keysOf(node).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) fail(`${where}: unsupported keyword(s) ${unexpected.join(', ')}`);
}

// ---------------------------------------------------------------------------------------------
// 1. Read and verify frozen inputs (read-only).

function readFrozenInputs(): { inputs: Record<string, Json>; hashes: Record<string, string> } {
  const manifestBytes = readFileSync(path.join(REFERENCE_DIR, 'MANIFEST.sha256'));
  if (sha256(manifestBytes) !== PINNED_MANIFEST_SHA256)
    fail('frozen MANIFEST.sha256 identity mismatch');
  const listed = new Map<string, string>();
  for (const line of manifestBytes.toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) fail(`unparseable manifest line: ${line}`);
    listed.set(match[2] as string, match[1] as string);
  }
  const inputs: Record<string, Json> = {};
  const hashes: Record<string, string> = {};
  for (const relative of FROZEN_INPUTS) {
    const bytes = readFileSync(path.join(REFERENCE_DIR, relative));
    const digest = sha256(bytes);
    if (listed.get(relative) !== digest) fail(`${relative} does not match the frozen manifest`);
    inputs[relative] = JSON.parse(bytes.toString('utf8')) as Json;
    hashes[relative] = digest;
  }
  return { inputs, hashes };
}

// ---------------------------------------------------------------------------------------------
// 2. Translate frozen JSON Schema nodes into TB wire builder expressions (closed mapping).

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const lit = (value: Json): string => JSON.stringify(value);
const propertyKey = (key: string): string => (IDENTIFIER.test(key) ? key : lit(key));
const schemaConst = (name: string): string => `${name}Schema`;

export interface TranslateContext {
  readonly names: ReadonlySet<string>;
  readonly referenced: Set<string>;
  usesPfc: boolean;
}

function options(entries: Array<[string, Json | undefined]>): string {
  const present = entries.filter(([, value]) => value !== undefined);
  if (present.length === 0) return '';
  return `{ ${present.map(([key, value]) => `${key}: ${lit(value as Json)}`).join(', ')} }`;
}

function translateString(node: JsonObject, where: string): string {
  expectKeys(node, ['type', 'maxLength', 'minLength', 'format', 'pattern', 'description'], where);
  const format = node['format'];
  if (
    format !== undefined &&
    !['uuid', 'uri', 'email', 'date', 'date-time'].includes(format as string)
  ) {
    fail(`${where}: unsupported format ${String(format)}`);
  }
  for (const key of ['maxLength', 'minLength'] as const) {
    const value = node[key];
    if (
      value !== undefined &&
      (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    ) {
      fail(`${where}: invalid ${key}`);
    }
  }
  return `tb.string(${options([
    ['maxLength', node['maxLength']],
    ['minLength', node['minLength']],
    ['format', node['format']],
    ['pattern', node['pattern']],
    ['description', node['description']],
  ])})`;
}

export function translate(
  node: Json | undefined,
  context: TranslateContext,
  where: string,
): string {
  if (!isObject(node)) fail(`${where}: expected a schema object`);
  if ('$ref' in node) {
    expectKeys(node, ['$ref'], where);
    const ref = node['$ref'];
    const match = typeof ref === 'string' ? /^#\/\$defs\/([A-Za-z0-9_]+)$/.exec(ref) : null;
    if (!match || !context.names.has(match[1] as string))
      fail(`${where}: unsupported $ref ${String(ref)}`);
    context.referenced.add(match[1] as string);
    return schemaConst(match[1] as string);
  }
  if ('anyOf' in node) {
    expectKeys(node, ['anyOf'], where);
    const branches = node['anyOf'];
    if (
      !Array.isArray(branches) ||
      branches.length !== 2 ||
      JSON.stringify(branches[1]) !== JSON.stringify({ type: 'null' })
    ) {
      fail(`${where}: only anyOf [T, {type: "null"}] (nullable) is supported`);
    }
    return `${translate(branches[0], context, `${where}|anyOf0`)}.nullable()`;
  }
  if ('oneOf' in node) fail(`${where}: oneOf is only supported for top-level catalog schemas`);
  if ('const' in node) {
    expectKeys(node, ['const'], where);
    const value = node['const'];
    if (value === PFC_SCHEMA_VERSION) {
      context.usesPfc = true;
      return 'tb.literal(PFC_SCHEMA_VERSION)';
    }
    if (typeof value !== 'string' && typeof value !== 'boolean')
      fail(`${where}: unsupported const`);
    return `tb.literal(${lit(value)})`;
  }
  switch (node['type']) {
    case 'string':
      if ('enum' in node) {
        expectKeys(node, ['type', 'enum'], where);
        const values = node['enum'];
        if (
          !Array.isArray(values) ||
          values.length === 0 ||
          values.some((v) => typeof v !== 'string')
        ) {
          fail(`${where}: unsupported enum`);
        }
        return `tb.enum(${lit(values)})`;
      }
      return translateString(node, where);
    case 'integer':
      expectKeys(node, ['type', 'minimum', 'maximum'], where);
      if (typeof node['minimum'] !== 'number' || typeof node['maximum'] !== 'number') {
        fail(`${where}: integers must declare minimum and maximum`);
      }
      return `tb.integer(${options([
        ['minimum', node['minimum']],
        ['maximum', node['maximum']],
      ])})`;
    case 'boolean':
      expectKeys(node, ['type'], where);
      return 'tb.boolean()';
    case 'array':
      expectKeys(node, ['type', 'items', 'minItems', 'maxItems'], where);
      if (typeof node['minItems'] !== 'number' || typeof node['maxItems'] !== 'number') {
        fail(`${where}: arrays must declare minItems and maxItems`);
      }
      return `tb.array(${translate(node['items'], context, `${where}[]`)}, ${options([
        ['minItems', node['minItems']],
        ['maxItems', node['maxItems']],
      ])})`;
    case 'object': {
      if (node['additionalProperties'] === true) {
        expectKeys(node, ['type', 'additionalProperties', 'description'], where);
        return `tb.looseObject(${options([['description', node['description']]])})`;
      }
      expectKeys(
        node,
        ['type', 'properties', 'required', 'additionalProperties', 'minProperties', 'description'],
        where,
      );
      if (node['additionalProperties'] !== false)
        fail(`${where}: objects must set additionalProperties false`);
      const properties = node['properties'];
      const required = node['required'];
      if (!isObject(properties) || !Array.isArray(required))
        fail(`${where}: properties/required missing`);
      const propertyNames = keysOf(properties);
      const requiredNames = required as string[];
      if (requiredNames.some((name) => !propertyNames.includes(name)))
        fail(`${where}: required names an unknown property`);
      const expectedOrder = propertyNames.filter((name) => requiredNames.includes(name));
      if (JSON.stringify(expectedOrder) !== JSON.stringify(requiredNames)) {
        fail(`${where}: required order differs from property order (not reproducible)`);
      }
      const fields = propertyNames.map((name) => {
        const expression = translate(properties[name], context, `${where}.${name}`);
        return `${propertyKey(name)}: ${expression}${requiredNames.includes(name) ? '' : '.optional()'}`;
      });
      const settings = options([
        ['minProperties', node['minProperties']],
        ['description', node['description']],
      ]);
      return `tb.object({ ${fields.join(', ')} }${settings ? `, ${settings}` : ''})`;
    }
    default:
      fail(`${where}: unsupported type ${JSON.stringify(node['type'])}`);
  }
}

export function translateTopLevel(
  name: string,
  node: Json | undefined,
  context: TranslateContext,
): string {
  if (isObject(node) && 'oneOf' in node) {
    expectKeys(node, ['oneOf', 'description'], name);
    const branches = node['oneOf'];
    if (!Array.isArray(branches) || branches.length < 2) fail(`${name}: invalid oneOf`);
    // The discriminator must be a property that is a required string const in every branch,
    // with pairwise distinct values: then oneOf (exactly one) equals discriminator dispatch.
    const first = branches[0];
    if (!isObject(first) || !isObject(first['properties']))
      fail(`${name}: oneOf branches must be objects`);
    const candidates = keysOf(first['properties']).filter((key) =>
      branches.every((branch) => {
        if (
          !isObject(branch) ||
          !isObject(branch['properties']) ||
          !Array.isArray(branch['required'])
        )
          return false;
        const property = branch['properties'][key];
        return (
          isObject(property) &&
          typeof property['const'] === 'string' &&
          branch['required'].includes(key)
        );
      }),
    );
    if (candidates.length !== 1)
      fail(`${name}: oneOf needs exactly one const discriminator (found ${candidates.length})`);
    const discriminator = candidates[0] as string;
    const values = branches.map(
      (branch) => ((branch as JsonObject)['properties'] as JsonObject)[discriminator],
    );
    const distinct = new Set(values.map((value) => (value as JsonObject)['const']));
    if (distinct.size !== branches.length)
      fail(`${name}: oneOf discriminator values are not distinct`);
    const expressions = branches.map((branch, index) =>
      translate(branch, context, `${name}|oneOf${index}`),
    );
    const settings = options([['description', node['description']]]);
    return `tb.oneOf(${lit(discriminator)}, [${expressions.join(', ')}]${settings ? `, ${settings}` : ''})`;
  }
  return translate(node, context, name);
}

// ---------------------------------------------------------------------------------------------
// 3. Module planning: ProductionContext lives in the PFC production folder; schemas that depend on
//    it (transitively) are emitted after it, so there are no module import cycles.

function collectRefs(node: Json, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, into);
  } else if (isObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') into.add(value.replace('#/$defs/', ''));
      else collectRefs(value, into);
    }
  }
}

function topologicalOrder(
  names: readonly string[],
  deps: Map<string, Set<string>>,
  order: Map<string, number>,
): string[] {
  const inGroup = new Set(names);
  const remaining = new Map(
    names.map((name) => [name, [...(deps.get(name) ?? [])].filter((d) => inGroup.has(d)).length]),
  );
  const result: string[] = [];
  const ready = names.filter((name) => remaining.get(name) === 0);
  while (ready.length > 0) {
    ready.sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
    const next = ready.shift() as string;
    result.push(next);
    for (const name of names) {
      if (deps.get(name)?.has(next)) {
        const count = (remaining.get(name) as number) - 1;
        remaining.set(name, count);
        if (count === 0) ready.push(name);
      }
    }
  }
  if (result.length !== names.length) fail('schema reference cycle detected (unsupported)');
  return result;
}

// ---------------------------------------------------------------------------------------------
// 4. Operations and document metadata.

const SUCCESS_HEADERS_EXPECTED = {
  ETag: {
    schema: { type: 'string' },
    description: 'Strong entity row-version ETag when the resource is mutable.',
  },
  'Cache-Control': { schema: { type: 'string' }, example: 'no-store' },
};
const ERROR_STATUSES = [
  '400',
  '401',
  '403',
  '404',
  '409',
  '412',
  '413',
  '422',
  '428',
  '429',
  '500',
];
const SHARED_PARAMETER_NAMES = ['IfMatch', 'IdempotencyKey', 'Csrf'];

function schemaNameOfRef(value: Json | undefined, prefix: string, where: string): string {
  if (!isObject(value) || keysOf(value).join() !== '$ref' || typeof value['$ref'] !== 'string') {
    fail(`${where}: expected a $ref`);
  }
  const ref = value['$ref'] as string;
  if (!ref.startsWith(prefix)) fail(`${where}: unexpected $ref ${ref}`);
  return ref.slice(prefix.length);
}

function jsonContentSchema(value: Json | undefined, where: string): string {
  if (!isObject(value) || keysOf(value).join() !== 'application/json')
    fail(`${where}: expected application/json content only`);
  const media = value['application/json'];
  if (!isObject(media) || keysOf(media).join() !== 'schema')
    fail(`${where}: expected a schema only`);
  return schemaNameOfRef(media['schema'], '#/components/schemas/', where);
}

interface PortedOperation {
  readonly method: string;
  readonly path: string;
  readonly operationId: string;
  readonly request: string | null;
  readonly response: string | null;
  readonly code: string;
}

function portOperations(
  openapi: JsonObject,
  names: ReadonlySet<string>,
  referenced: Set<string>,
): PortedOperation[] {
  const successTemplate = JSON.stringify(SUCCESS_HEADERS_EXPECTED);
  const components = openapi['components'] as JsonObject;
  const defaultSecurity = JSON.stringify(openapi['security']);
  const ported: PortedOperation[] = [];
  const paths = openapi['paths'];
  if (!isObject(paths)) fail('openapi.paths missing');
  for (const [route, item] of Object.entries(paths)) {
    if (!isObject(item)) fail(`${route}: invalid path item`);
    for (const [method, operation] of Object.entries(item)) {
      const where = `${method.toUpperCase()} ${route}`;
      if (!['get', 'post', 'patch', 'delete'].includes(method))
        fail(`${where}: unsupported method`);
      if (!isObject(operation)) fail(`${where}: invalid operation`);
      expectKeys(
        operation,
        [
          'operationId',
          'tags',
          'summary',
          'parameters',
          'responses',
          'security',
          'x-precondition-target',
          'x-idempotent-write',
          'requestBody',
        ],
        where,
      );
      const parameters = (operation['parameters'] as Json[]).map((parameter, index) => {
        const at = `${where} parameter ${index}`;
        if (!isObject(parameter)) fail(`${at}: invalid`);
        if ('$ref' in parameter) {
          const name = schemaNameOfRef(parameter, '#/components/parameters/', at);
          if (
            !SHARED_PARAMETER_NAMES.includes(name) ||
            !isObject((components['parameters'] as JsonObject)[name])
          ) {
            fail(`${at}: unknown shared parameter ${name}`);
          }
          return `{ ref: ${lit(name)} }`;
        }
        expectKeys(parameter, ['name', 'in', 'required', 'style', 'explode', 'schema'], at);
        if (!['path', 'query'].includes(parameter['in'] as string))
          fail(`${at}: unsupported location`);
        if ('required' in parameter && parameter['required'] !== true)
          fail(`${at}: required must be true when present`);
        const schema = { ...(parameter['schema'] as JsonObject) };
        let schemaDefault: Json | undefined;
        if ('default' in schema) {
          schemaDefault = schema['default'];
          delete schema['default'];
          if (typeof schemaDefault !== 'number') fail(`${at}: unsupported default`);
        }
        const inline: TranslateContext = {
          names: new Set(),
          referenced: new Set(),
          usesPfc: false,
        };
        const fields = [
          `name: ${lit(parameter['name'] as string)}`,
          `in: ${lit(parameter['in'] as string)}`,
          ...(parameter['required'] === true ? ['required: true'] : []),
          ...(parameter['style'] !== undefined ? [`style: ${lit(parameter['style'])}`] : []),
          ...(parameter['explode'] !== undefined ? [`explode: ${lit(parameter['explode'])}`] : []),
          `schema: ${translate(schema, inline, `${at}.schema`)}`,
          ...(schemaDefault !== undefined ? [`schemaDefault: ${lit(schemaDefault)}`] : []),
        ];
        return `{ ${fields.join(', ')} }`;
      });
      const responses = operation['responses'];
      if (!isObject(responses)) fail(`${where}: responses missing`);
      let success = '';
      let response: string | null = null;
      const errors: string[] = [];
      for (const [status, value] of Object.entries(responses)) {
        if (!isObject(value)) fail(`${where} ${status}: invalid response`);
        if ('$ref' in value) {
          if (
            schemaNameOfRef(value, '#/components/responses/', `${where} ${status}`) !== 'Error' ||
            !ERROR_STATUSES.includes(status)
          ) {
            fail(`${where} ${status}: unsupported error response`);
          }
          errors.push(status);
          continue;
        }
        if (success) fail(`${where}: more than one success response`);
        if (status === '204') {
          expectKeys(value, ['description'], `${where} 204`);
          success = `{ status: '204' }`;
          continue;
        }
        if (!['200', '201'].includes(status))
          fail(`${where}: unsupported success status ${status}`);
        expectKeys(value, ['description', 'headers', 'content'], `${where} ${status}`);
        if (JSON.stringify(value['headers']) !== successTemplate)
          fail(`${where} ${status}: unexpected headers`);
        response = jsonContentSchema(value['content'], `${where} ${status}`);
        if (!names.has(response)) fail(`${where}: unknown response schema ${response}`);
        referenced.add(response);
        success = `{ status: ${lit(status)}, schema: ${schemaConst(response)} }`;
      }
      if (!success) fail(`${where}: no success response`);
      let request: string | null = null;
      if ('requestBody' in operation) {
        const body = operation['requestBody'];
        if (!isObject(body) || body['required'] !== true)
          fail(`${where}: request bodies must be required`);
        expectKeys(body, ['required', 'content'], `${where} requestBody`);
        request = jsonContentSchema(body['content'], `${where} requestBody`);
        if (!names.has(request)) fail(`${where}: unknown request schema ${request}`);
        referenced.add(request);
      }
      const securityJson = JSON.stringify(operation['security']);
      const security =
        securityJson === '[]'
          ? 'none'
          : securityJson === defaultSecurity
            ? 'session'
            : fail(`${where}: unsupported security`);
      const precondition = operation['x-precondition-target'];
      if (precondition !== null && typeof precondition !== 'string')
        fail(`${where}: invalid x-precondition-target`);
      if (typeof operation['x-idempotent-write'] !== 'boolean')
        fail(`${where}: invalid x-idempotent-write`);
      const fields = [
        `operationId: ${lit(operation['operationId'] as string)}`,
        `method: ${lit(method)}`,
        `path: ${lit(route)}`,
        `tags: ${lit(operation['tags'] as Json)}`,
        `summary: ${lit(operation['summary'] as string)}`,
        `parameters: [${parameters.join(', ')}]`,
        ...(request !== null ? [`requestBody: ${schemaConst(request)}`] : []),
        `success: ${success}`,
        `errors: ${lit(errors)}`,
        `security: ${lit(security)}`,
        `preconditionTarget: ${lit(precondition)}`,
        `idempotentWrite: ${lit(operation['x-idempotent-write'])}`,
      ];
      ported.push({
        method,
        path: route,
        operationId: operation['operationId'] as string,
        request,
        response,
        code: `{ ${fields.join(', ')} }`,
      });
    }
  }
  return ported;
}

/**
 * The frozen endpoint catalog names the *payload* schema of a success response: the `data`
 * property of the `{data, meta: ResponseMeta}` envelope that openapi.json references (verified for
 * all 132 non-204 operations; null for 204). Any other envelope shape fails closed.
 */
function payloadSchemaOf(envelopeName: string | null, openapi: JsonObject): string | null {
  if (envelopeName === null) return null;
  const envelope = ((openapi['components'] as JsonObject)['schemas'] as JsonObject)[envelopeName];
  const expectedMeta = JSON.stringify({ $ref: '#/components/schemas/ResponseMeta' });
  if (
    !isObject(envelope) ||
    !isObject(envelope['properties']) ||
    JSON.stringify(Object.keys(envelope['properties'])) !== '["data","meta"]' ||
    JSON.stringify(envelope['required']) !== '["data","meta"]' ||
    JSON.stringify(envelope['properties']['meta']) !== expectedMeta
  ) {
    fail(`${envelopeName}: success response schema is not a {data, meta} envelope`);
  }
  return schemaNameOfRef(
    envelope['properties']['data'],
    '#/components/schemas/',
    `${envelopeName}.data`,
  );
}

function crossCheckEndpointCatalog(
  catalog: Json,
  operations: readonly PortedOperation[],
  openapi: JsonObject,
): void {
  if (!Array.isArray(catalog) || catalog.length !== operations.length)
    fail('endpoint catalog size differs from OpenAPI operations');
  const paths = openapi['paths'] as JsonObject;
  catalog.forEach((entry, index) => {
    const operation = operations[index] as PortedOperation;
    if (!isObject(entry)) fail(`endpoint catalog entry ${index} invalid`);
    const op = (paths[operation.path] as JsonObject)[operation.method] as JsonObject;
    const expected = {
      method: operation.method.toUpperCase(),
      path: operation.path,
      operationId: operation.operationId,
      request: operation.request,
      response: payloadSchemaOf(operation.response, openapi),
      precondition: op['x-precondition-target'] ?? null,
      idempotency: op['x-idempotent-write'],
    };
    if (JSON.stringify(entry) !== JSON.stringify(expected)) {
      fail(
        `endpoint catalog entry ${index} (${String(entry['operationId'])}) differs from openapi.json`,
      );
    }
  });
}

function portDocument(openapi: JsonObject): string {
  expectKeys(
    openapi,
    ['openapi', 'info', 'servers', 'tags', 'paths', 'components', 'security'],
    'openapi',
  );
  const components = openapi['components'] as JsonObject;
  expectKeys(components, ['schemas', 'securitySchemes', 'parameters', 'responses'], 'components');
  const parameters = components['parameters'] as JsonObject;
  if (JSON.stringify(Object.keys(parameters)) !== JSON.stringify(SHARED_PARAMETER_NAMES))
    fail('unexpected shared parameters');
  const shared = SHARED_PARAMETER_NAMES.map((key) => {
    const parameter = parameters[key] as JsonObject;
    expectKeys(parameter, ['name', 'in', 'required', 'schema', 'description'], `parameter ${key}`);
    if (parameter['in'] !== 'header' || parameter['required'] !== true)
      fail(`parameter ${key}: unsupported`);
    const inline: TranslateContext = { names: new Set(), referenced: new Set(), usesPfc: false };
    return `${key}: { name: ${lit(parameter['name'] as string)}, in: 'header', required: true, schema: ${translate(
      parameter['schema'],
      inline,
      `parameter ${key}`,
    )}, description: ${lit(parameter['description'] as string)} }`;
  });
  const responses = components['responses'] as JsonObject;
  if (JSON.stringify(Object.keys(responses)) !== '["Error"]') fail('unexpected shared responses');
  const error = responses['Error'] as JsonObject;
  expectKeys(error, ['description', 'content'], 'responses.Error');
  const errorSchema = jsonContentSchema(error['content'], 'responses.Error');
  const tags = (openapi['tags'] as JsonObject[]).map((tag) => {
    expectKeys(tag, ['name'], 'tag');
    return tag['name'] as string;
  });
  const schemes = components['securitySchemes'] as JsonObject;
  for (const [key, scheme] of Object.entries(schemes)) {
    expectKeys(
      scheme as JsonObject,
      ['type', 'in', 'name', 'description'],
      `securityScheme ${key}`,
    );
  }
  // Success / no-content descriptions are taken from the operations (verified uniform).
  let successDescription: string | undefined;
  let noContentDescription: string | undefined;
  for (const item of Object.values(openapi['paths'] as JsonObject)) {
    for (const operation of Object.values(item as JsonObject)) {
      for (const [status, value] of Object.entries(
        (operation as JsonObject)['responses'] as JsonObject,
      )) {
        const response = value as JsonObject;
        if ('$ref' in response) continue;
        const description = response['description'] as string;
        if (status === '204') {
          if (noContentDescription !== undefined && noContentDescription !== description)
            fail('non-uniform 204 description');
          noContentDescription = description;
        } else {
          if (successDescription !== undefined && successDescription !== description)
            fail('non-uniform success description');
          successDescription = description;
        }
      }
    }
  }
  if (successDescription === undefined || noContentDescription === undefined)
    fail('missing response descriptions');
  const headers = SUCCESS_HEADERS_EXPECTED;
  return `export const openApiDocument = {
    openapi: ${lit(openapi['openapi'] as string)},
    info: ${lit(openapi['info'] as JsonObject)},
    servers: ${lit(openapi['servers'] as Json)},
    tags: ${lit(tags)},
    securitySchemes: ${lit(schemes)},
    security: ${lit(openapi['security'] as Json)},
    sharedParameters: { ${shared.join(', ')} },
    errorResponse: { name: 'Error', description: ${lit(error['description'] as string)}, schema: ${schemaConst(errorSchema)} },
    successResponse: {
      description: ${lit(successDescription)},
      headers: {
        ETag: { schema: tb.string(), description: ${lit(headers.ETag.description)} },
        'Cache-Control': { schema: tb.string(), example: ${lit(headers['Cache-Control'].example)} },
      },
    },
    noContentResponse: { description: ${lit(noContentDescription)} },
  } as const satisfies OpenApiDocumentSource;`;
}

// ---------------------------------------------------------------------------------------------
// 5. Emit modules.

function header(hashes: Record<string, string>, role: string): string {
  const inputs = FROZEN_INPUTS.map((input) => `//   ${input} sha256 ${hashes[input]}`).join('\n');
  return `// ${role}
//
// Initial content generated ONCE by scripts/migrations/port-frozen-contract-v1.ts from the frozen
// ${REFERENCE_RELEASE} reference (docs/reference/database-api-v1/…):
${inputs}
// After the Zod-first transition is accepted (ADR-0002) this file is editable active source; the
// port is provenance only and must not be re-run over it. Build wire schemas with the \`tb\`
// builders only — the JSON Schema/OpenAPI lowering rejects anything else.
`;
}

function schemaModule(
  names: readonly string[],
  expressions: Map<string, string>,
  imports: string[],
  role: string,
  hashes: Record<string, string>,
): string {
  const body = names
    .map(
      (name) =>
        `export const ${schemaConst(name)} = ${expressions.get(name)};\nexport type ${name} = z.infer<typeof ${schemaConst(name)}>;`,
    )
    .join('\n\n');
  return `${header(hashes, role)}
import type { z } from 'zod';
${imports.join('\n')}

${body}
`;
}

function importLine(names: Iterable<string>, from: string): string[] {
  const sorted = [...new Set(names)].sort();
  if (sorted.length === 0) return [];
  return [`import { ${sorted.map(schemaConst).join(', ')} } from '${from}';`];
}

async function format(source: string): Promise<string> {
  const config = JSON.parse(
    readFileSync(path.join(repoRoot, '.prettierrc.json'), 'utf8'),
  ) as prettier.Options;
  return prettier.format(source, { ...config, parser: 'typescript' });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out-root');
  if (outIndex < 0 || !args[outIndex + 1]) fail('usage: --out-root <dir> [--overwrite]');
  const overwrite = args.includes('--overwrite');
  const outRoot = path.resolve(args[outIndex + 1] as string);
  const referenceReal = realpathSync(path.join(repoRoot, 'docs/reference'));
  const outProbe = existsSync(outRoot) ? realpathSync(outRoot) : outRoot;
  if (outProbe === referenceReal || outProbe.startsWith(`${referenceReal}${path.sep}`))
    fail('refusing to write under docs/reference');

  const { inputs, hashes } = readFrozenInputs();
  const bundle = inputs['contracts/api-schemas.json'] as JsonObject;
  const openapi = inputs['contracts/openapi.json'] as JsonObject;
  expectKeys(bundle, ['$schema', '$id', '$defs'], 'bundle');
  if (bundle['$schema'] !== 'https://json-schema.org/draft/2020-12/schema')
    fail('bundle dialect must be 2020-12');
  const defs = bundle['$defs'] as JsonObject;
  const ordered = keysOf(defs);
  if (ordered.length !== 284) fail(`expected 284 schemas, found ${ordered.length}`);
  const names = new Set(ordered);
  // The OpenAPI components must be the same schemas (modulo $ref prefix) in the same order.
  const components = JSON.stringify((openapi['components'] as JsonObject)['schemas']).replaceAll(
    '#/components/schemas/',
    '#/$defs/',
  );
  if (components !== JSON.stringify(defs))
    fail('openapi components.schemas differ from the JSON Schema bundle');

  const expressions = new Map<string, string>();
  const deps = new Map<string, Set<string>>();
  const pfcUsers = new Set<string>();
  for (const name of ordered) {
    const context: TranslateContext = { names, referenced: new Set(), usesPfc: false };
    expressions.set(name, translateTopLevel(name, defs[name], context));
    const refs = new Set<string>();
    collectRefs(defs[name] as Json, refs);
    deps.set(name, refs);
    if (context.usesPfc) pfcUsers.add(name);
  }
  if (!expressions.get(PRODUCTION_CONTEXT)?.includes('PFC_SCHEMA_VERSION'))
    fail('ProductionContext does not carry the PFC schemaVersion');

  // Transitive dependents of ProductionContext.
  const dependents = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of ordered) {
      if (dependents.has(name) || name === PRODUCTION_CONTEXT) continue;
      const refs = deps.get(name) as Set<string>;
      if (refs.has(PRODUCTION_CONTEXT) || [...refs].some((ref) => dependents.has(ref))) {
        dependents.add(name);
        grew = true;
      }
    }
  }
  const order = new Map(ordered.map((name, index) => [name, index]));
  const core = topologicalOrder(
    ordered.filter((n) => n !== PRODUCTION_CONTEXT && !dependents.has(n)),
    deps,
    order,
  );
  const bound = topologicalOrder(
    ordered.filter((n) => dependents.has(n)),
    deps,
    order,
  );
  const coreSet = new Set(core);
  const refsOf = (list: readonly string[], filter: (name: string) => boolean) =>
    list.flatMap((name) => [...(deps.get(name) as Set<string>)].filter(filter));

  const files = new Map<string, string>();
  const pfcDir = 'production/pfc-youtube-email-v1_1';
  files.set(
    `${pfcDir}/constants.ts`,
    `${header(hashes, 'PFC wire identifier for the Production Form Contract (YouTube email).')}
/** Wire schemaVersion of ProductionContext. Must remain exactly this value (not "v1"). */
export const PFC_SCHEMA_VERSION = ${lit(PFC_SCHEMA_VERSION)};
`,
  );
  const pfcImport = (from: string) => `import { PFC_SCHEMA_VERSION } from '${from}';`;
  files.set(
    'api/schemas/core.ts',
    schemaModule(
      core,
      expressions,
      [
        "import { tb } from '../../primitives/wire.js';",
        ...(core.some((n) => pfcUsers.has(n)) ? [pfcImport(`../../${pfcDir}/constants.js`)] : []),
      ],
      'Wire schemas of TB-SCHEMA-API-v1 that do not depend on ProductionContext.',
      hashes,
    ),
  );
  files.set(
    `${pfcDir}/production-context.ts`,
    schemaModule(
      [PRODUCTION_CONTEXT],
      expressions,
      [
        "import { tb } from '../../primitives/wire.js';",
        pfcImport('./constants.js'),
        ...importLine(
          refsOf([PRODUCTION_CONTEXT], (d) => coreSet.has(d)),
          '../../api/schemas/core.js',
        ),
      ],
      `ProductionContext wire schema (schemaVersion ${PFC_SCHEMA_VERSION}).`,
      hashes,
    ),
  );
  files.set(
    'api/schemas/production-bound.ts',
    schemaModule(
      bound,
      expressions,
      [
        "import { tb } from '../../primitives/wire.js';",
        ...(bound.some((n) => pfcUsers.has(n)) ? [pfcImport(`../../${pfcDir}/constants.js`)] : []),
        ...importLine(
          refsOf(bound, (d) => coreSet.has(d)),
          './core.js',
        ),
        ...(refsOf(bound, (d) => d === PRODUCTION_CONTEXT).length > 0
          ? [
              `import { ${schemaConst(PRODUCTION_CONTEXT)} } from '../../${pfcDir}/production-context.js';`,
            ]
          : []),
      ],
      'Wire schemas of TB-SCHEMA-API-v1 that depend on ProductionContext.',
      hashes,
    ),
  );
  files.set(
    `${pfcDir}/index.ts`,
    `${header(hashes, 'Production Form Contract PFC-YT-EMAIL-v1.1 wire entry point.')}
export { PFC_SCHEMA_VERSION } from './constants.js';
export { ProductionContextSchema, type ProductionContext } from './production-context.js';
`,
  );
  files.set(
    'api/schemas/index.ts',
    `${header(hashes, 'All TB-SCHEMA-API-v1 wire schemas.')}
export * from './core.js';
export * from './production-bound.js';
export { ProductionContextSchema, type ProductionContext } from '../../${pfcDir}/production-context.js';
`,
  );
  files.set(
    'api/catalog.ts',
    `${header(hashes, 'Ordered catalog of named wire schemas (JSON Schema $defs / OpenAPI components order).')}
import type { SchemaCatalog } from '../generation/artifacts.js';
import * as schemas from './schemas/index.js';

/** JSON Schema bundle $id of the API contract. */
export const API_CONTRACT_ID = ${lit(bundle['$id'] as string)};

export const apiSchemaCatalog = [
${ordered.map((name) => `  [${lit(name)}, schemas.${schemaConst(name)}],`).join('\n')}
] as const satisfies SchemaCatalog;
`,
  );

  const referenced = new Set<string>();
  const operations = portOperations(openapi, names, referenced);
  if (operations.length !== 141) fail(`expected 141 operations, found ${operations.length}`);
  crossCheckEndpointCatalog(inputs['contracts/endpoint-catalog.json'] as Json, operations, openapi);
  files.set(
    'api/operations.ts',
    `${header(hashes, 'HTTP operation metadata (OpenAPI operations) of TB-SCHEMA-API-v1.')}
import { tb } from '../primitives/wire.js';
import type { OperationSpec } from './operation-types.js';
${importLine(referenced, './schemas/index.js').join('\n')}

export const operations = [
${operations.map((operation) => `  ${operation.code},`).join('\n')}
] as const satisfies readonly OperationSpec[];
`,
  );
  const documentCode = portDocument(openapi);
  const errorSchemaName = /schema: ([A-Za-z0-9_]+)Schema \}/.exec(
    documentCode.slice(documentCode.indexOf('errorResponse')),
  )?.[1];
  files.set(
    'api/openapi-document.ts',
    `${header(hashes, 'OpenAPI document-level metadata of TB-SCHEMA-API-v1 (info, servers, security, shared parameters and responses).')}
import { tb } from '../primitives/wire.js';
import type { OpenApiDocumentSource } from './operation-types.js';
${importLine(errorSchemaName ? [errorSchemaName] : [], './schemas/index.js').join('\n')}

${documentCode}
`,
  );

  const written: string[] = [];
  for (const [relative, source] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const target = path.join(outRoot, relative);
    const formatted = await format(source);
    if (existsSync(target) && !overwrite && readFileSync(target, 'utf8') !== formatted) {
      fail(
        `${target} exists with different content; refusing to overwrite active source (use --overwrite only for the initial port)`,
      );
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, formatted);
    written.push(`${relative} sha256 ${sha256(formatted)}`);
  }
  console.log(
    `[port] ${REFERENCE_RELEASE}: ${ordered.length} schemas (${core.length} core, 1 ProductionContext, ${bound.length} production-bound), ${operations.length} operations`,
  );
  for (const line of written) console.log(`[port] wrote ${line}`);
}

// Run only when executed directly; tests import the translation functions without porting.
if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
