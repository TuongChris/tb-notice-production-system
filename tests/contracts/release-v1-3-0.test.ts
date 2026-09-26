// TB-SCHEMA-API-v1.3.0 (ADR-0006, R14 remediation): the active contract is the accepted
// TB-SCHEMA-API-v1.2.0 — itself the accepted v1.1.0 plus its amendment, on the frozen
// TB-SCHEMA-API-v1.0.0 — plus exactly one reviewed additive amendment: the read-back of one stored
// ValidationRun exactly as recorded. These tests pin the release: its base is the accepted v1.2.0
// (record and documents), the generated artifacts are byte-identical to "frozen + v1.1.0 + v1.2.0 +
// v1.3.0", nothing of v1.0.0, v1.1.0 or v1.2.0 is changed, removed or reordered, and the addition is
// only the {data, meta} envelope of the unchanged v1.0.0 ValidationRun: no new semantic schema and no
// inferred, current, re-evaluated or readiness information.
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

const RELEASE = 'TB-SCHEMA-API-v1.3.0';

/**
 * sha256 of docs/contracts/TB-SCHEMA-API-v1.3.0/amendment.json as written for the R14 remediation and
 * proposed for R14 final. A release record is never edited: a later wire change is a new release with
 * its own amendment and ADR.
 */
const AMENDMENT_SHA256 = '6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630';

const amendment = readAmendment(RELEASE);
const previous = readAmendment('TB-SCHEMA-API-v1.2.0');
const baseline = releaseBaseline();
const v110 = releaseDocuments('TB-SCHEMA-API-v1.1.0');
const v120 = releaseDocuments('TB-SCHEMA-API-v1.2.0');
const { jsonSchemaBundle, openApi } = buildContractArtifacts();
const frozenBundle = JSON.parse(frozenBundleRaw()) as JsonObject;
const frozenOpenApi = JSON.parse(frozenOpenApiRaw()) as JsonObject;
const frozenDefs = frozenBundle['$defs'] as JsonObject;
const v110Defs = v110.bundle['$defs'] as JsonObject;
const v120Defs = v120.bundle['$defs'] as JsonObject;
const generatedDefs = jsonSchemaBundle['$defs'] as JsonObject;
const addedSchemaNames = Object.keys(amendment.schemas.added);
const NEW_PATH = '/validation-runs/{id}';

describe('TB-SCHEMA-API-v1.3.0 release record', () => {
  it('the amendment record is the reviewed one (never edited after the release)', () => {
    expect(sha256(amendmentBytes(RELEASE))).toBe(AMENDMENT_SHA256);
    expect(amendment.release).toBe(RELEASE);
    expect(amendment.kind).toBe('ADDITIVE');
    expect(existsSync(path.join(repoRoot, amendment.decision)), amendment.decision).toBe(true);
    expect(existsSync(path.join(repoRoot, 'docs/contracts/TB-SCHEMA-API-v1.3.0/README.md'))).toBe(
      true,
    );
  });

  it('extends exactly the accepted TB-SCHEMA-API-v1.2.0: its record and its documents, reproduced to their recorded digests', () => {
    const base = amendment.base as ReleaseBase;
    expect(RELEASES).toEqual(['TB-SCHEMA-API-v1.1.0', 'TB-SCHEMA-API-v1.2.0', RELEASE]);
    expect(base.release).toBe('TB-SCHEMA-API-v1.2.0');
    expect(base.path).toBe('docs/contracts/TB-SCHEMA-API-v1.2.0');
    expect(sha256(readFileSync(path.join(repoRoot, base.path, 'amendment.json')))).toBe(
      base.amendmentSha256,
    );
    expect(base.files).toEqual(previous.result.files);
    const rendered = renderDocuments(v120);
    for (const [file, digest] of Object.entries(base.files)) {
      expect(sha256(rendered[file] as string), file).toBe(digest);
    }
    expect(amendment.openApiInfoVersion).toEqual({
      from: previous.openApiInfoVersion.to,
      to: '1.3.0',
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
    // (ADR-0004, ADR-0005, ADR-0006: changing it would not be additive).
    expect(
      ((generatedDefs['AppMeta'] as JsonObject)['properties'] as JsonObject)['schemaRelease'],
    ).toEqual({ const: 'TB-SCHEMA-API-v1.0.0' });
  });
});

describe('frozen v1.0.0 + v1.1.0 + v1.2.0 + v1.3.0 reproduces the generated contract byte for byte', () => {
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
    expect(amendment.result.schemaCount).toBe(289);
    expect(operationKeys(openApi)).toHaveLength(amendment.result.operationCount);
    expect(operations).toHaveLength(144);
  });
});

describe('additive only: nothing of v1.0.0, v1.1.0 or v1.2.0 is changed, removed or reordered', () => {
  it('all 284 frozen, 286 v1.1.0 and 288 v1.2.0 schemas are byte-identical and in their order; the only new name is this amendment’s', () => {
    const frozenNames = Object.keys(frozenDefs);
    const v110Names = Object.keys(v110Defs);
    const v120Names = Object.keys(v120Defs);
    expect(frozenNames).toHaveLength(284);
    expect(v110Names).toHaveLength(286);
    expect(v120Names).toHaveLength(288);
    for (const [names, defs] of [
      [v120Names, v120Defs],
      [v110Names, v110Defs],
      [frozenNames, frozenDefs],
    ] as const) {
      for (const name of names) {
        expect(JSON.stringify(generatedDefs[name]) === JSON.stringify(defs[name]), name).toBe(true);
      }
    }
    const generatedNames = Object.keys(generatedDefs);
    expect(generatedNames.filter((name) => v120Names.includes(name))).toEqual(v120Names);
    expect(generatedNames.filter((name) => !v120Names.includes(name))).toEqual(addedSchemaNames);
    expect(addedSchemaNames).toEqual(['GetValidationRunResponse']);
    const at = generatedNames.indexOf('ListValidationRunsResponse');
    expect(generatedNames.slice(at + 1, at + 2)).toEqual(addedSchemaNames);
    expect(apiSchemaCatalog.map(([name]) => name)).toEqual(generatedNames);
  });

  it('all 141 frozen, 142 v1.1.0 and 143 v1.2.0 operations are identical and in their order; the only new one is getValidationRun', () => {
    const v120Keys = operationKeys(v120.openApi);
    expect(operationKeys(frozenOpenApi)).toHaveLength(141);
    expect(operationKeys(v110.openApi)).toHaveLength(142);
    expect(v120Keys).toHaveLength(143);
    const generatedKeys = operationKeys(openApi);
    expect(generatedKeys.filter((key) => v120Keys.includes(key))).toEqual(v120Keys);
    expect(generatedKeys.filter((key) => !v120Keys.includes(key))).toEqual([`GET ${NEW_PATH}`]);
    const generatedPaths = openApi['paths'] as JsonObject;
    for (const document of [v120.openApi, v110.openApi, frozenOpenApi]) {
      for (const [route, item] of Object.entries(document['paths'] as JsonObject)) {
        expect(isDeepStrictEqual(generatedPaths[route], item), route).toBe(true);
      }
    }
    const ids = operations.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(144);
    expect(ids.indexOf('getValidationRun')).toBe(ids.indexOf('listValidationRuns') + 1);
    expect(ids.indexOf('listValidationIssues')).toBe(ids.indexOf('getValidationRun') + 1);
    expect(generatedKeys.indexOf(`GET ${NEW_PATH}`)).toBe(
      generatedKeys.indexOf('GET /candidates/{candidateId}/validation-runs') + 1,
    );
  });

  it('document-level metadata: only info.version names the new release', () => {
    for (const key of Object.keys(v120.openApi)) {
      if (key === 'paths' || key === 'components' || key === 'info') continue;
      expect(isDeepStrictEqual(openApi[key], v120.openApi[key]), key).toBe(true);
    }
    expect(Object.keys(openApi)).toEqual(Object.keys(frozenOpenApi));
    expect(openApi['info']).toEqual({
      ...(frozenOpenApi['info'] as JsonObject),
      version: '1.3.0',
    });
    const components = openApi['components'] as JsonObject;
    const v120Components = v120.openApi['components'] as JsonObject;
    expect(Object.keys(components)).toEqual(Object.keys(v120Components));
    for (const key of ['securitySchemes', 'parameters', 'responses']) {
      expect(isDeepStrictEqual(components[key], v120Components[key]), key).toBe(true);
    }
  });

  it('an existing client keeps working: every validation schema and operation it uses is unchanged since v1.0.0', () => {
    for (const name of [
      'ValidationRun',
      'CoverageManifest',
      'Dependency',
      'ProductionContext',
      'ValidationIssue',
      'ValidateCandidate',
      'ValidateCandidateResponse',
      'ValidationRunSummary',
      'ValidationRunPage',
      'ListValidationRunsResponse',
      'ValidationIssuePage',
      'ListValidationIssuesResponse',
      'ResponseMeta',
    ]) {
      expect(isDeepStrictEqual(generatedDefs[name], frozenDefs[name]), name).toBe(true);
    }
    // POST/GET /candidates/{candidateId}/validation-runs and GET /validation-runs/{id}/issues are
    // exactly the frozen operations: the run a write returns and the lists keep their shapes.
    for (const route of [
      '/candidates/{candidateId}/validation-runs',
      '/validation-runs/{id}/issues',
    ]) {
      expect(
        isDeepStrictEqual(
          (openApi['paths'] as JsonObject)[route],
          (frozenOpenApi['paths'] as JsonObject)[route],
        ),
        route,
      ).toBe(true);
    }
  });
});

describe('the added read: one stored run by id, read-only, exactly the recorded ValidationRun', () => {
  const spec: OperationSpec | undefined = operations.find(
    (operation) => operation.operationId === 'getValidationRun',
  );
  const pathItem = (openApi['paths'] as JsonObject)[NEW_PATH] as JsonObject | undefined;
  const generatedOperation = (pathItem?.['get'] ?? {}) as JsonObject;

  it('GET by the run id, session only, no body, no If-Match, no Idempotency-Key, not a list', () => {
    expect(Object.keys(pathItem ?? {}), NEW_PATH).toEqual(['get']);
    expect(isDeepStrictEqual(pathItem, amendment.operations.added[NEW_PATH])).toBe(true);
    expect(spec).toMatchObject({
      method: 'get',
      path: NEW_PATH,
      tags: ['Validation'],
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
    ).toEqual([['id', 'path', true]]);
    // Not a list: no limit, cursor or q, and no Csrf or Idempotency-Key header reference.
    expect(spec?.parameters.filter((parameter) => 'ref' in parameter)).toEqual([]);
    // The same parameters and responses as the other global reads by id (getCandidate, getPrompt).
    for (const sibling of ['/candidates/{id}', '/prompts/{id}']) {
      const read = ((openApi['paths'] as JsonObject)[sibling] as JsonObject)['get'] as JsonObject;
      expect(generatedOperation['parameters'], sibling).toEqual(read['parameters']);
      expect(Object.keys(generatedOperation['responses'] as JsonObject), sibling).toEqual(
        Object.keys(read['responses'] as JsonObject),
      );
    }
    expect(spec?.errors).toContain('404');
    expect(String(generatedOperation['summary'])).toMatch(/exactly as recorded/);
    expect(String(generatedOperation['summary'])).toMatch(/never re-evaluated/);
  });

  it('the response is exactly the unchanged v1.0.0 ValidationRun in the {data, meta} envelope — the shape a validation write returns', () => {
    expect(generatedDefs['GetValidationRunResponse']).toEqual({
      type: 'object',
      properties: {
        data: { $ref: '#/$defs/ValidationRun' },
        meta: { $ref: '#/$defs/ResponseMeta' },
      },
      required: ['data', 'meta'],
      additionalProperties: false,
    });
    // The same body as the 201 of validateCandidate: what was recorded is what is read back.
    expect(generatedDefs['GetValidationRunResponse']).toEqual(
      generatedDefs['ValidateCandidateResponse'],
    );
    // The run it returns is the frozen v1.0.0 schema, unchanged: every stored field, including the
    // evaluated context, the dependency manifest and the coverage manifest with
    // semanticReviewRequired always true.
    expect(generatedDefs['ValidationRun']).toEqual(frozenDefs['ValidationRun']);
    const run = generatedDefs['ValidationRun'] as JsonObject;
    expect(run['required']).toEqual([
      'id',
      'candidateId',
      'caseId',
      'artifactSha256',
      'dependencyDigest',
      'dependencyManifest',
      'evaluatedContextJson',
      'rulesetVersion',
      'result',
      'coverageManifest',
      'blockerCount',
      'reviewRequiredCount',
      'warningCount',
      'startedAt',
      'completedAt',
      'createdAt',
      'createdById',
    ]);
    expect(
      ((generatedDefs['CoverageManifest'] as JsonObject)['properties'] as JsonObject)[
        'semanticReviewRequired'
      ],
    ).toEqual({ const: true });
  });

  it('no new semantic schema: no current, re-evaluated, readiness, G1–G6, approval or issue field is added', () => {
    const forbidden =
      /^(g[1-7]\w*|ready\w*|readiness|eligib\w*|authori[sz]ed\w*|current\w*|isCurrent\w*|valid\w*|approved\w*|verified\w*|proven\w*|proof\w*|reviewed\w*|recomputed\w*|reevaluated\w*|re_?evaluated\w*|issues|status|state|stale\w*|fresh\w*)$/i;
    const keys: string[] = [];
    const refs: string[] = [];
    const walk = (node: unknown) => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'properties') keys.push(...Object.keys(value as object));
          if (key === '$ref') refs.push(String(value));
          walk(value);
        }
      }
    };
    for (const name of addedSchemaNames) walk(generatedDefs[name]);
    expect(keys.sort()).toEqual(['data', 'meta']);
    expect(keys.filter((key) => forbidden.test(key))).toEqual([]);
    // Only existing schemas are referenced: the run itself and the response meta. The issues stay
    // with listValidationIssues (not embedded).
    expect(refs.sort()).toEqual(['#/$defs/ResponseMeta', '#/$defs/ValidationRun']);
  });
});
