// TB-SCHEMA-API-v1.2.0 (ADR-0005, R9 remediation): the active contract is the accepted
// TB-SCHEMA-API-v1.1.0 — itself the frozen TB-SCHEMA-API-v1.0.0 plus its amendment — plus exactly one
// reviewed additive amendment: the case-scoped read of the exact FactSource rows recorded for one
// CaseFact revision. These tests pin the release: its base is the accepted v1.1.0 (record and
// documents), the generated artifacts are byte-identical to "frozen + v1.1.0 + v1.2.0", nothing of
// v1.0.0 or v1.1.0 is changed, removed or reordered, and the addition carries no inferred, current,
// review or readiness information.
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
import { repoRoot } from './oracle.js';
import {
  ACTIVE_RELEASE,
  amendmentBytes,
  frozenBundleRaw,
  frozenOpenApiRaw,
  operationKeys,
  readAmendment,
  releaseBaseline,
  releaseDocuments,
  renderDocuments,
  RELEASES,
  sha256,
  type JsonObject,
  type ReleaseBase,
} from './release.js';

const RELEASE = 'TB-SCHEMA-API-v1.2.0';

/**
 * sha256 of docs/contracts/TB-SCHEMA-API-v1.2.0/amendment.json as reviewed for R9 final. A release
 * record is never edited: a later wire change is a new release with its own amendment and ADR.
 */
const AMENDMENT_SHA256 = 'b5cae658a3f47639500e2220e4a91fcfb81c34972d8426a4fa9fd1146cdbc294';

const amendment = readAmendment(RELEASE);
const previous = readAmendment('TB-SCHEMA-API-v1.1.0');
const baseline = releaseBaseline();
const v110 = releaseDocuments('TB-SCHEMA-API-v1.1.0');
const { jsonSchemaBundle, openApi } = buildContractArtifacts();
const frozenBundle = JSON.parse(frozenBundleRaw()) as JsonObject;
const frozenOpenApi = JSON.parse(frozenOpenApiRaw()) as JsonObject;
const frozenDefs = frozenBundle['$defs'] as JsonObject;
const v110Defs = v110.bundle['$defs'] as JsonObject;
const generatedDefs = jsonSchemaBundle['$defs'] as JsonObject;
const addedSchemaNames = Object.keys(amendment.schemas.added);
const NEW_PATH = '/cases/{caseId}/facts/{id}/sources';

describe('TB-SCHEMA-API-v1.2.0 release record', () => {
  it('the amendment record is the reviewed one (never edited after the release)', () => {
    expect(sha256(amendmentBytes(RELEASE))).toBe(AMENDMENT_SHA256);
    expect(amendment.release).toBe(RELEASE);
    expect(amendment.kind).toBe('ADDITIVE');
    expect(existsSync(path.join(repoRoot, amendment.decision)), amendment.decision).toBe(true);
    expect(existsSync(path.join(repoRoot, 'docs/contracts/TB-SCHEMA-API-v1.2.0/README.md'))).toBe(
      true,
    );
  });

  it('extends exactly the accepted TB-SCHEMA-API-v1.1.0: its record and its documents, reproduced to their recorded digests', () => {
    const base = amendment.base as ReleaseBase;
    expect(RELEASES).toEqual(['TB-SCHEMA-API-v1.1.0', RELEASE]);
    expect(base.release).toBe('TB-SCHEMA-API-v1.1.0');
    expect(base.path).toBe('docs/contracts/TB-SCHEMA-API-v1.1.0');
    expect(sha256(readFileSync(path.join(repoRoot, base.path, 'amendment.json')))).toBe(
      base.amendmentSha256,
    );
    expect(base.files).toEqual(previous.result.files);
    const rendered = renderDocuments(v110);
    for (const [file, digest] of Object.entries(base.files)) {
      expect(sha256(rendered[file] as string), file).toBe(digest);
    }
    expect(amendment.openApiInfoVersion).toEqual({
      from: previous.openApiInfoVersion.to,
      to: '1.2.0',
    });
  });

  it('the package names the active release and the frozen release it extends', () => {
    expect(ACTIVE_RELEASE).toBe(RELEASE);
    expect(CONTRACT_BASELINE).toBe(amendment.release);
    expect(FROZEN_REFERENCE_RELEASE).toBe('TB-SCHEMA-API-v1.0.0');
    expect((openApi['info'] as JsonObject)['version']).toBe(amendment.openApiInfoVersion.to);
    // Unrelated identifiers stay exactly as they were.
    expect(PFC_SCHEMA_VERSION).toBe('PFC-YT-EMAIL-v1.1');
    expect(jsonSchemaBundle['$id']).toBe(frozenBundle['$id']);
    // GET /meta is not routed; its schemaRelease constant is part of the unchanged v1.0.0 schemas
    // (ADR-0004, ADR-0005: changing it would not be additive).
    expect(
      ((generatedDefs['AppMeta'] as JsonObject)['properties'] as JsonObject)['schemaRelease'],
    ).toEqual({ const: 'TB-SCHEMA-API-v1.0.0' });
  });
});

describe('frozen v1.0.0 + v1.1.0 + v1.2.0 reproduces the generated contract byte for byte', () => {
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

  it('the committed artifacts (JSON and YAML) are the rendered release and have its digests', () => {
    const rendered = renderDocuments(baseline);
    expect(Object.keys(rendered)).toEqual(Object.keys(amendment.result.files));
    for (const [file, digest] of Object.entries(amendment.result.files)) {
      const committed = readFileSync(path.join(repoRoot, file), 'utf8');
      expect(committed === rendered[file], `${file} is the rendered release`).toBe(true);
      expect(sha256(committed), file).toBe(digest);
    }
    expect(Object.keys(generatedDefs)).toHaveLength(amendment.result.schemaCount);
    expect(amendment.result.schemaCount).toBe(288);
    expect(operationKeys(openApi)).toHaveLength(amendment.result.operationCount);
    expect(operations).toHaveLength(143);
  });
});

describe('additive only: nothing of v1.0.0 or v1.1.0 is changed, removed or reordered', () => {
  it('all 284 frozen and all 286 v1.1.0 schemas are byte-identical and in their order; the only new names are this amendment’s', () => {
    const frozenNames = Object.keys(frozenDefs);
    const v110Names = Object.keys(v110Defs);
    expect(frozenNames).toHaveLength(284);
    expect(v110Names).toHaveLength(286);
    for (const name of v110Names) {
      expect(JSON.stringify(generatedDefs[name]) === JSON.stringify(v110Defs[name]), name).toBe(
        true,
      );
    }
    for (const name of frozenNames) {
      expect(JSON.stringify(generatedDefs[name]) === JSON.stringify(frozenDefs[name]), name).toBe(
        true,
      );
    }
    const generatedNames = Object.keys(generatedDefs);
    expect(generatedNames.filter((name) => v110Names.includes(name))).toEqual(v110Names);
    expect(generatedNames.filter((name) => !v110Names.includes(name))).toEqual(addedSchemaNames);
    expect(addedSchemaNames).toEqual(['CaseFactSourcesView', 'GetCaseFactSourcesResponse']);
    const at = generatedNames.indexOf('GetCaseFactResponse');
    expect(generatedNames.slice(at + 1, at + 3)).toEqual(addedSchemaNames);
    expect(apiSchemaCatalog.map(([name]) => name)).toEqual(generatedNames);
  });

  it('all 141 frozen and all 142 v1.1.0 operations are identical and in their order; the only new one is getCaseFactSources', () => {
    const v110Keys = operationKeys(v110.openApi);
    expect(operationKeys(frozenOpenApi)).toHaveLength(141);
    expect(v110Keys).toHaveLength(142);
    const generatedKeys = operationKeys(openApi);
    expect(generatedKeys.filter((key) => v110Keys.includes(key))).toEqual(v110Keys);
    expect(generatedKeys.filter((key) => !v110Keys.includes(key))).toEqual([`GET ${NEW_PATH}`]);
    const v110Paths = v110.openApi['paths'] as JsonObject;
    const generatedPaths = openApi['paths'] as JsonObject;
    for (const [route, item] of Object.entries(v110Paths)) {
      expect(isDeepStrictEqual(generatedPaths[route], item), route).toBe(true);
    }
    for (const [route, item] of Object.entries(frozenOpenApi['paths'] as JsonObject)) {
      expect(isDeepStrictEqual(generatedPaths[route], item), route).toBe(true);
    }
    const ids = operations.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(143);
    expect(ids.indexOf('getCaseFactSources')).toBe(ids.indexOf('getCaseFact') + 1);
    expect(generatedKeys.indexOf(`GET ${NEW_PATH}`)).toBe(
      generatedKeys.indexOf('GET /cases/{caseId}/facts/{id}') + 1,
    );
  });

  it('document-level metadata: only info.version names the new release', () => {
    for (const key of Object.keys(v110.openApi)) {
      if (key === 'paths' || key === 'components' || key === 'info') continue;
      expect(isDeepStrictEqual(openApi[key], v110.openApi[key]), key).toBe(true);
    }
    expect(Object.keys(openApi)).toEqual(Object.keys(frozenOpenApi));
    expect(openApi['info']).toEqual({
      ...(frozenOpenApi['info'] as JsonObject),
      version: '1.2.0',
    });
    const components = openApi['components'] as JsonObject;
    const v110Components = v110.openApi['components'] as JsonObject;
    expect(Object.keys(components)).toEqual(Object.keys(v110Components));
    for (const key of ['securitySchemes', 'parameters', 'responses']) {
      expect(isDeepStrictEqual(components[key], v110Components[key]), key).toBe(true);
    }
  });

  it('an existing client keeps working: every fact schema it validates is unchanged since v1.0.0', () => {
    for (const name of [
      'CaseFact',
      'FactSource',
      'FactSupport',
      'CreateFact',
      'ReviseFact',
      'CaseFactSummary',
      'CaseFactPage',
      'ListCaseFactsResponse',
      'CreateCaseFactResponse',
      'GetCaseFactResponse',
      'ReviseCaseFactResponse',
      'ResponseMeta',
    ]) {
      expect(isDeepStrictEqual(generatedDefs[name], frozenDefs[name]), name).toBe(true);
    }
    // GET /cases/{caseId}/facts/{id} still returns exactly the CaseFact row: no support list.
    expect(
      isDeepStrictEqual(
        (openApi['paths'] as JsonObject)['/cases/{caseId}/facts/{id}'],
        (frozenOpenApi['paths'] as JsonObject)['/cases/{caseId}/facts/{id}'],
      ),
    ).toBe(true);
  });
});

describe('the added read: case-scoped, read-only, exactly the stored FactSource rows of one revision', () => {
  const spec: OperationSpec | undefined = operations.find(
    (operation) => operation.operationId === 'getCaseFactSources',
  );
  const pathItem = (openApi['paths'] as JsonObject)[NEW_PATH] as JsonObject | undefined;
  const generatedOperation = (pathItem?.['get'] ?? {}) as JsonObject;

  it('GET under the case and the fact, session only, no body, no If-Match, no Idempotency-Key', () => {
    expect(Object.keys(pathItem ?? {}), NEW_PATH).toEqual(['get']);
    expect(isDeepStrictEqual(pathItem, amendment.operations.added[NEW_PATH])).toBe(true);
    expect(spec).toMatchObject({
      method: 'get',
      path: NEW_PATH,
      tags: ['Fact'],
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
    // Not a list: no limit, cursor or q — every row of the revision in one response.
    expect(spec?.parameters.filter((parameter) => 'ref' in parameter)).toEqual([]);
    // The same parameters and responses as the contracted read of the fact itself (getCaseFact).
    const sibling = ((openApi['paths'] as JsonObject)['/cases/{caseId}/facts/{id}'] as JsonObject)[
      'get'
    ] as JsonObject;
    expect(generatedOperation['parameters']).toEqual(sibling['parameters']);
    expect(Object.keys(generatedOperation['responses'] as JsonObject)).toEqual(
      Object.keys(sibling['responses'] as JsonObject),
    );
    expect(spec?.errors).toContain('404');
  });

  it('the response is the revision id and its stored FactSource rows (0–100, zero allowed), nothing else', () => {
    expect(generatedDefs['GetCaseFactSourcesResponse']).toEqual({
      type: 'object',
      properties: {
        data: { $ref: '#/$defs/CaseFactSourcesView' },
        meta: { $ref: '#/$defs/ResponseMeta' },
      },
      required: ['data', 'meta'],
      additionalProperties: false,
    });
    const view = generatedDefs['CaseFactSourcesView'] as JsonObject;
    expect(view['properties']).toEqual({
      factId: { type: 'string', maxLength: 36, minLength: 36, format: 'uuid' },
      sources: {
        type: 'array',
        items: { $ref: '#/$defs/FactSource' },
        minItems: 0,
        maxItems: 100,
      },
    });
    expect(view['required']).toEqual(['factId', 'sources']);
    expect(view['additionalProperties']).toBe(false);
    expect(String(view['description'])).toMatch(/^The exact stored FactSource rows/);
    // The bound is exactly the supports a create or revision accepts (the only writers of rows).
    for (const request of ['CreateFact', 'ReviseFact']) {
      for (const branch of (generatedDefs[request] as JsonObject)['oneOf'] as JsonObject[]) {
        const sources = (branch['properties'] as JsonObject)['sources'] as JsonObject;
        expect([sources['minItems'], sources['maxItems']], request).toEqual([0, 100]);
      }
    }
    // The stored-row schema it references is the frozen v1.0.0 one, unchanged.
    expect(generatedDefs['FactSource']).toEqual(frozenDefs['FactSource']);
  });

  it('no proof, review, G1, readiness, currentness, validity or link-state field is added', () => {
    const forbidden =
      /^(g[1-7]\w*|ready\w*|readiness|eligib\w*|authori[sz]ed\w*|current\w*|isCurrent\w*|valid\w*|approved\w*|verified\w*|proven\w*|proof\w*|reviewed\w*|supported\w*|provenance|resolution\w*|linkState|status|state)$/i;
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
    expect(keys.sort()).toEqual(['data', 'factId', 'meta', 'sources']);
    expect(keys.filter((key) => forbidden.test(key))).toEqual([]);
  });
});
