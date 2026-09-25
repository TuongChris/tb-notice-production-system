// TB-SCHEMA-API-v1.1.0 (ADR-0004): the active contract is the frozen TB-SCHEMA-API-v1.0.0 plus exactly
// one reviewed additive amendment — the case-scoped read of one CaseAuthoritySelection with the
// CaseAuthorityCoverage rows it pinned (R8 remediation). These tests pin the release: its base is
// the untouched frozen reference, the generated artifacts are byte-identical to "frozen + amendment",
// nothing of v1.0.0 is changed or removed, and the addition carries no inferred, current or
// readiness information.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  apiSchemaCatalog,
  buildContractArtifacts,
  CONTRACT_BASELINE,
  FROZEN_REFERENCE_RELEASE,
  operations,
  PFC_SCHEMA_VERSION,
  type OperationSpec,
} from '../../packages/contracts/src/index.js';
import { FROZEN_CONTRACTS, repoRoot } from './oracle.js';
import {
  amendmentBytes,
  frozenBundleRaw,
  frozenOpenApiRaw,
  operationKeys,
  readAmendment,
  releaseBaseline,
  sha256,
  withComponentRefs,
  type JsonObject,
} from './release.js';

/**
 * sha256 of docs/contracts/TB-SCHEMA-API-v1.1.0/amendment.json as reviewed for R8. A release record
 * is never edited: a later wire change is a new release with its own amendment and ADR.
 */
const AMENDMENT_SHA256 = '2f4df69739926d4b50c22a1ba123ede51edec04bafb86459bb6bacb2d1dfda85';

const amendment = readAmendment();
const baseline = releaseBaseline(amendment);
const { jsonSchemaBundle, openApi } = buildContractArtifacts();
const frozenBundle = JSON.parse(frozenBundleRaw()) as JsonObject;
const frozenOpenApi = JSON.parse(frozenOpenApiRaw()) as JsonObject;
const frozenDefs = frozenBundle['$defs'] as JsonObject;
const generatedDefs = jsonSchemaBundle['$defs'] as JsonObject;
const addedSchemaNames = Object.keys(amendment.schemas.added);
const NEW_PATH = '/cases/{caseId}/authority-selections/{id}';

describe('TB-SCHEMA-API-v1.1.0 release record', () => {
  it('the amendment record is the reviewed one (never edited after the release)', () => {
    expect(sha256(amendmentBytes())).toBe(AMENDMENT_SHA256);
    expect(amendment.release).toBe('TB-SCHEMA-API-v1.1.0');
    expect(amendment.kind).toBe('ADDITIVE');
    expect(existsSync(path.join(repoRoot, amendment.decision)), amendment.decision).toBe(true);
    expect(existsSync(path.join(repoRoot, 'docs/contracts/TB-SCHEMA-API-v1.1.0/README.md'))).toBe(
      true,
    );
  });

  it('extends exactly the frozen TB-SCHEMA-API-v1.0.0 reference, which stays unchanged', () => {
    expect(amendment.base.release).toBe('TB-SCHEMA-API-v1.0.0');
    expect(path.join(repoRoot, amendment.base.path, 'contracts')).toBe(FROZEN_CONTRACTS);
    expect(sha256(readFileSync(path.join(repoRoot, amendment.base.path, 'MANIFEST.sha256')))).toBe(
      amendment.base.manifestSha256,
    );
    for (const [file, digest] of Object.entries(amendment.base.files)) {
      expect(sha256(readFileSync(path.join(repoRoot, amendment.base.path, file))), file).toBe(
        digest,
      );
    }
  });

  it('the package names the active release and the frozen release it extends', () => {
    expect(CONTRACT_BASELINE).toBe(amendment.release);
    expect(FROZEN_REFERENCE_RELEASE).toBe(amendment.base.release);
    expect((openApi['info'] as JsonObject)['version']).toBe(amendment.openApiInfoVersion.to);
    // Unrelated identifiers stay exactly as they were.
    expect(PFC_SCHEMA_VERSION).toBe('PFC-YT-EMAIL-v1.1');
    expect(jsonSchemaBundle['$id']).toBe(frozenBundle['$id']);
    // GET /meta is not routed; its schemaRelease constant is part of the unchanged v1.0.0 schemas
    // (ADR-0004: changing it would not be additive).
    expect(
      ((generatedDefs['AppMeta'] as JsonObject)['properties'] as JsonObject)['schemaRelease'],
    ).toEqual({ const: 'TB-SCHEMA-API-v1.0.0' });
  });
});

describe('frozen v1.0.0 + amendment reproduces the generated contract byte for byte', () => {
  it('JSON Schema bundle', () => {
    expect(
      JSON.stringify(jsonSchemaBundle, null, 2) === JSON.stringify(baseline.bundle, null, 2),
    ).toBe(true);
    expect(isDeepStrictEqual(jsonSchemaBundle, baseline.bundle)).toBe(true);
  });

  it('OpenAPI document', () => {
    expect(JSON.stringify(openApi, null, 2) === JSON.stringify(baseline.openApi, null, 2)).toBe(
      true,
    );
    expect(isDeepStrictEqual(openApi, baseline.openApi)).toBe(true);
  });

  it('the committed artifacts (JSON and YAML) have the release digests', () => {
    for (const [file, digest] of Object.entries(amendment.result.files)) {
      expect(sha256(readFileSync(path.join(repoRoot, file))), file).toBe(digest);
    }
    expect(Object.keys(generatedDefs)).toHaveLength(amendment.result.schemaCount);
    expect(operationKeys(openApi)).toHaveLength(amendment.result.operationCount);
    expect(operations).toHaveLength(amendment.result.operationCount);
  });

  it('the component form of every frozen schema is its $defs form with component refs (the rule applied to the additions)', () => {
    const components = (frozenOpenApi['components'] as JsonObject)['schemas'] as JsonObject;
    expect(Object.keys(components)).toEqual(Object.keys(frozenDefs));
    for (const [name, schema] of Object.entries(frozenDefs)) {
      expect(isDeepStrictEqual(components[name], withComponentRefs(schema)), name).toBe(true);
    }
  });
});

describe('additive only: nothing of v1.0.0 is changed, removed or reordered', () => {
  it('all 284 frozen schemas are byte-identical and in the frozen order; the only new names are the amendment’s', () => {
    const frozenNames = Object.keys(frozenDefs);
    expect(frozenNames).toHaveLength(284);
    for (const name of frozenNames) {
      expect(JSON.stringify(generatedDefs[name]) === JSON.stringify(frozenDefs[name]), name).toBe(
        true,
      );
    }
    const generatedNames = Object.keys(generatedDefs);
    expect(generatedNames.filter((name) => frozenNames.includes(name))).toEqual(frozenNames);
    expect(generatedNames.filter((name) => !frozenNames.includes(name))).toEqual(addedSchemaNames);
    expect(addedSchemaNames).toEqual([
      'CaseAuthoritySelectionView',
      'GetCaseAuthoritySelectionResponse',
    ]);
    expect(apiSchemaCatalog.map(([name]) => name)).toEqual(generatedNames);
  });

  it('all 141 frozen operations are identical and in the frozen order; the only new one is getCaseAuthoritySelection', () => {
    const frozenKeys = operationKeys(frozenOpenApi);
    expect(frozenKeys).toHaveLength(141);
    const generatedKeys = operationKeys(openApi);
    expect(generatedKeys.filter((key) => frozenKeys.includes(key))).toEqual(frozenKeys);
    expect(generatedKeys.filter((key) => !frozenKeys.includes(key))).toEqual([`GET ${NEW_PATH}`]);
    const frozenPaths = frozenOpenApi['paths'] as JsonObject;
    const generatedPaths = openApi['paths'] as JsonObject;
    for (const [route, item] of Object.entries(frozenPaths)) {
      expect(isDeepStrictEqual(generatedPaths[route], item), route).toBe(true);
    }
    const ids = operations.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(142);
    expect(ids.indexOf('getCaseAuthoritySelection')).toBe(
      ids.indexOf('listCaseAuthoritySelections') + 1,
    );
  });

  it('document-level metadata: only info.version names the new release', () => {
    for (const key of Object.keys(frozenOpenApi)) {
      if (key === 'paths' || key === 'components' || key === 'info') continue;
      expect(isDeepStrictEqual(openApi[key], frozenOpenApi[key]), key).toBe(true);
    }
    expect(Object.keys(openApi)).toEqual(Object.keys(frozenOpenApi));
    expect(openApi['info']).toEqual({
      ...(frozenOpenApi['info'] as JsonObject),
      version: '1.1.0',
    });
    const components = openApi['components'] as JsonObject;
    const frozenComponents = frozenOpenApi['components'] as JsonObject;
    expect(Object.keys(components)).toEqual(Object.keys(frozenComponents));
    for (const key of ['securitySchemes', 'parameters', 'responses']) {
      expect(isDeepStrictEqual(components[key], frozenComponents[key]), key).toBe(true);
    }
  });
});

describe('the added read: case-scoped, read-only, exactly the stored rows', () => {
  const spec: OperationSpec | undefined = operations.find(
    (operation) => operation.operationId === 'getCaseAuthoritySelection',
  );
  const pathItem = (openApi['paths'] as JsonObject)[NEW_PATH] as JsonObject | undefined;
  const generatedOperation = (pathItem?.['get'] ?? {}) as JsonObject;

  it('GET under the case, session only, no body, no If-Match, no Idempotency-Key', () => {
    expect(Object.keys(pathItem ?? {}), NEW_PATH).toEqual(['get']);
    expect(spec).toMatchObject({
      method: 'get',
      path: NEW_PATH,
      tags: ['Case'],
      security: 'session',
      preconditionTarget: null,
      idempotentWrite: false,
    });
    expect(spec?.requestBody).toBeUndefined();
    expect(generatedOperation['requestBody']).toBeUndefined();
    expect(generatedOperation['x-precondition-target']).toBeNull();
    expect(generatedOperation['x-idempotent-write']).toBe(false);
    expect(
      ((generatedOperation['parameters'] ?? []) as JsonObject[]).map((parameter) => [
        parameter['name'],
        parameter['in'],
        parameter['required'],
      ]),
    ).toEqual([
      ['caseId', 'path', true],
      ['id', 'path', true],
    ]);
    // The same responses as the contracted read of a case child (getReportedItem).
    const sibling = (
      (openApi['paths'] as JsonObject)['/cases/{caseId}/reported-items/{id}'] as JsonObject
    )['get'] as JsonObject;
    expect(Object.keys(generatedOperation['responses'] as JsonObject)).toEqual(
      Object.keys(sibling['responses'] as JsonObject),
    );
    expect(spec?.errors).toContain('404');
  });

  it('the response is exactly the stored selection and its stored coverage rows (1–20), nothing else', () => {
    expect(generatedDefs['GetCaseAuthoritySelectionResponse']).toEqual({
      type: 'object',
      properties: {
        data: { $ref: '#/$defs/CaseAuthoritySelectionView' },
        meta: { $ref: '#/$defs/ResponseMeta' },
      },
      required: ['data', 'meta'],
      additionalProperties: false,
    });
    const view = generatedDefs['CaseAuthoritySelectionView'] as JsonObject;
    expect(view['properties']).toEqual({
      selection: { $ref: '#/$defs/CaseAuthoritySelection' },
      coverages: {
        type: 'array',
        items: { $ref: '#/$defs/CaseAuthorityCoverage' },
        minItems: 1,
        maxItems: 20,
      },
    });
    expect(view['required']).toEqual(['selection', 'coverages']);
    expect(view['additionalProperties']).toBe(false);
    // The two stored-row schemas it references are the frozen v1.0.0 ones, unchanged.
    for (const name of ['CaseAuthoritySelection', 'CaseAuthorityCoverage']) {
      expect(generatedDefs[name]).toEqual(frozenDefs[name]);
    }
  });

  it('no G1, readiness, currentness, validity or eligibility field is added', () => {
    const forbidden =
      /^(g[1-7]\w*|ready\w*|readiness|eligib\w*|authori[sz]ed\w*|current\w*|isCurrent\w*|valid\w*|approved\w*|verified\w*|status|state)$/i;
    const keys: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'properties') keys.push(...Object.keys(value as object));
          walk(value);
        }
      }
    };
    for (const name of addedSchemaNames) walk(generatedDefs[name]);
    expect(keys.sort()).toEqual(['coverages', 'data', 'meta', 'selection']);
    expect(keys.filter((key) => forbidden.test(key))).toEqual([]);
  });
});
