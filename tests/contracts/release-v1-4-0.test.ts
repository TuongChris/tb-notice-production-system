// TB-SCHEMA-API-v1.4.0 (ADR-0009, R14-AUD-006; accepted by the operator for implementation with the
// independent review deferred — mission TB_P4H_CANDIDATE_ASSESSMENT_FAST_TRACK_IMPLEMENTATION): the
// active contract is the accepted TB-SCHEMA-API-v1.3.0 — itself v1.2.0, v1.1.0 and the frozen
// TB-SCHEMA-API-v1.0.0 plus their amendments — plus exactly one additive amendment: the read-back of
// the exact AssessmentSource rows recorded for one CandidateAssessment of one candidate. These tests
// pin the release: its base is the accepted v1.3.0 (record and documents), the generated artifacts
// are byte-identical to "frozen + v1.1.0 + v1.2.0 + v1.3.0 + v1.4.0", nothing of an earlier release
// is changed, removed or reordered, and the addition is only a strict view of the unchanged v1.0.0
// AssessmentSource rows and its {data, meta} envelope: no present-day, proof, review, gate or
// readiness information.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  apiSchemaCatalog,
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
  releaseDocuments,
  renderDocuments,
  RELEASES,
  sha256,
  type JsonObject,
  type ReleaseBase,
} from './release.js';

const RELEASE = 'TB-SCHEMA-API-v1.4.0';

/**
 * sha256 of docs/contracts/TB-SCHEMA-API-v1.4.0/amendment.json as written for P4H. A release record
 * is never edited: a later wire change is a new release with its own amendment and ADR.
 */
const AMENDMENT_SHA256 = 'fb6b14a9781980f06ab7d1e41952feb478ee37f4df9df54f09d2fe941ff15c85';

const amendment = readAmendment(RELEASE);
const previous = readAmendment('TB-SCHEMA-API-v1.3.0');
const baseline = releaseDocuments(RELEASE);
const v110 = releaseDocuments('TB-SCHEMA-API-v1.1.0');
const v120 = releaseDocuments('TB-SCHEMA-API-v1.2.0');
const v130 = releaseDocuments('TB-SCHEMA-API-v1.3.0');
const { bundle: jsonSchemaBundle, openApi } = baseline;
const frozenBundle = JSON.parse(frozenBundleRaw()) as JsonObject;
const frozenOpenApi = JSON.parse(frozenOpenApiRaw()) as JsonObject;
const frozenDefs = frozenBundle['$defs'] as JsonObject;
const v110Defs = v110.bundle['$defs'] as JsonObject;
const v120Defs = v120.bundle['$defs'] as JsonObject;
const v130Defs = v130.bundle['$defs'] as JsonObject;
const generatedDefs = jsonSchemaBundle['$defs'] as JsonObject;
const addedSchemaNames = Object.keys(amendment.schemas.added);
const NEW_PATH = '/candidates/{candidateId}/assessments/{id}/sources';
const LIST_PATH = '/candidates/{candidateId}/assessments';

describe('TB-SCHEMA-API-v1.4.0 release record', () => {
  it('the amendment record is the one written for the release (never edited after it)', () => {
    expect(sha256(amendmentBytes(RELEASE))).toBe(AMENDMENT_SHA256);
    expect(amendment.release).toBe(RELEASE);
    expect(amendment.kind).toBe('ADDITIVE');
    expect(amendment.decision).toBe(
      'docs/decisions/ADR-0009-candidate-assessment-support-rows-additive-historical-read.md',
    );
    expect(existsSync(path.join(repoRoot, amendment.decision)), amendment.decision).toBe(true);
    expect(existsSync(path.join(repoRoot, 'docs/contracts/TB-SCHEMA-API-v1.4.0/README.md'))).toBe(
      true,
    );
  });

  it('extends exactly the accepted TB-SCHEMA-API-v1.3.0: its record and its documents, reproduced to their recorded digests', () => {
    const base = amendment.base as ReleaseBase;
    expect(RELEASES.slice(0, RELEASES.indexOf(RELEASE) + 1)).toEqual([
      'TB-SCHEMA-API-v1.1.0',
      'TB-SCHEMA-API-v1.2.0',
      'TB-SCHEMA-API-v1.3.0',
      RELEASE,
    ]);
    expect(base.release).toBe('TB-SCHEMA-API-v1.3.0');
    expect(base.path).toBe('docs/contracts/TB-SCHEMA-API-v1.3.0');
    expect(base.amendmentSha256).toBe(
      '6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630',
    );
    expect(sha256(readFileSync(path.join(repoRoot, base.path, 'amendment.json')))).toBe(
      base.amendmentSha256,
    );
    expect(base.files).toEqual(previous.result.files);
    expect(base.files).toEqual({
      'packages/contracts/schemas/api-schemas.json':
        '5868d90ee84356643fe4c368a44a1b3a200502c40bb5e294146127423e956a8c',
      'packages/contracts/openapi/openapi.json':
        '3743fba314fb5b976be17d6368c9ce3316ad35b97cf97d7a7591c9384312dd36',
      'packages/contracts/openapi/openapi.yaml':
        'ad80e8ad27c5128807cd0688270d469efb2ef423c5d22e7c821c8f5b919c0ded',
    });
    const rendered = renderDocuments(v130);
    for (const [file, digest] of Object.entries(base.files)) {
      expect(sha256(rendered[file] as string), file).toBe(digest);
    }
    expect(amendment.openApiInfoVersion).toEqual({
      from: previous.openApiInfoVersion.to,
      to: '1.4.0',
    });
  });

  it('the package names the active release and the frozen release it extends', () => {
    expect(RELEASES).toContain(RELEASE);
    expect(CONTRACT_BASELINE).toBe(ACTIVE_RELEASE);
    expect(FROZEN_REFERENCE_RELEASE).toBe('TB-SCHEMA-API-v1.0.0');
    expect((openApi['info'] as JsonObject)['version']).toBe(amendment.openApiInfoVersion.to);
    // Unrelated identifiers stay exactly as they were.
    expect(PFC_SCHEMA_VERSION).toBe('PFC-YT-EMAIL-v1.1');
    expect(jsonSchemaBundle['$id']).toBe(frozenBundle['$id']);
    // GET /meta is not routed; its schemaRelease constant is part of the unchanged v1.0.0 schemas
    // (ADR-0004–ADR-0006, ADR-0009: changing it would not be additive).
    expect(
      ((generatedDefs['AppMeta'] as JsonObject)['properties'] as JsonObject)['schemaRelease'],
    ).toEqual({ const: 'TB-SCHEMA-API-v1.0.0' });
  });
});

describe('frozen v1.0.0 + v1.1.0 + v1.2.0 + v1.3.0 + v1.4.0 reproduces the generated contract byte for byte', () => {
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

  it('the historical artifacts (JSON and YAML) reproduce the accepted release digests', () => {
    const rendered = renderDocuments(baseline);
    expect(Object.keys(rendered)).toEqual(Object.keys(amendment.result.files));
    expect(amendment.result.files).toEqual({
      'packages/contracts/schemas/api-schemas.json':
        'bd2cbf509af6958e13f6a8fc7988f8a28d34cd35eebe00c9616e015f7e5087a4',
      'packages/contracts/openapi/openapi.json':
        'ea24df81c6e707957d746ec80ebc39bf82bdda2f333410af5729a001a96fb8fe',
      'packages/contracts/openapi/openapi.yaml':
        'e22ec29ea67aa481cfa8762e295bcf67a80a6265f4bf460ff60b16b86868c149',
    });
    for (const [file, digest] of Object.entries(amendment.result.files)) {
      expect(sha256(rendered[file] as string), file).toBe(digest);
    }
    expect(Object.keys(generatedDefs)).toHaveLength(amendment.result.schemaCount);
    expect(amendment.result.schemaCount).toBe(291);
    expect(operationKeys(openApi)).toHaveLength(amendment.result.operationCount);
    expect(amendment.result.operationCount).toBe(145);
    expect(operations).toHaveLength(145);
    expect(Object.keys(openApi['paths'] as JsonObject)).toHaveLength(100);
  });
});

describe('additive only: nothing of v1.0.0, v1.1.0, v1.2.0 or v1.3.0 is changed, removed or reordered', () => {
  it('all 284 frozen, 286 v1.1.0, 288 v1.2.0 and 289 v1.3.0 schemas are byte-identical and in their order; the only new names are this amendment’s', () => {
    const frozenNames = Object.keys(frozenDefs);
    const v110Names = Object.keys(v110Defs);
    const v120Names = Object.keys(v120Defs);
    const v130Names = Object.keys(v130Defs);
    expect(frozenNames).toHaveLength(284);
    expect(v110Names).toHaveLength(286);
    expect(v120Names).toHaveLength(288);
    expect(v130Names).toHaveLength(289);
    for (const [names, defs] of [
      [v130Names, v130Defs],
      [v120Names, v120Defs],
      [v110Names, v110Defs],
      [frozenNames, frozenDefs],
    ] as const) {
      for (const name of names) {
        expect(JSON.stringify(generatedDefs[name]) === JSON.stringify(defs[name]), name).toBe(true);
      }
    }
    const generatedNames = Object.keys(generatedDefs);
    expect(generatedNames.filter((name) => v130Names.includes(name))).toEqual(v130Names);
    expect(generatedNames.filter((name) => !v130Names.includes(name))).toEqual(addedSchemaNames);
    expect(addedSchemaNames).toEqual([
      'CandidateAssessmentSourcesView',
      'GetCandidateAssessmentSourcesResponse',
    ]);
    const at = generatedNames.indexOf('ListCandidateAssessmentsResponse');
    expect(generatedNames.slice(at + 1, at + 4)).toEqual([
      ...addedSchemaNames,
      'GetCandidateReadinessResponse',
    ]);
    expect(apiSchemaCatalog.map(([name]) => name)).toEqual(generatedNames);
  });

  it('all 141 frozen, 142 v1.1.0, 143 v1.2.0 and 144 v1.3.0 operations are identical and in their order; the only new one is getCandidateAssessmentSources', () => {
    const v130Keys = operationKeys(v130.openApi);
    expect(operationKeys(frozenOpenApi)).toHaveLength(141);
    expect(operationKeys(v110.openApi)).toHaveLength(142);
    expect(operationKeys(v120.openApi)).toHaveLength(143);
    expect(v130Keys).toHaveLength(144);
    const generatedKeys = operationKeys(openApi);
    expect(generatedKeys.filter((key) => v130Keys.includes(key))).toEqual(v130Keys);
    expect(generatedKeys.filter((key) => !v130Keys.includes(key))).toEqual([`GET ${NEW_PATH}`]);
    const generatedPaths = openApi['paths'] as JsonObject;
    for (const document of [v130.openApi, v120.openApi, v110.openApi, frozenOpenApi]) {
      for (const [route, item] of Object.entries(document['paths'] as JsonObject)) {
        expect(isDeepStrictEqual(generatedPaths[route], item), route).toBe(true);
      }
    }
    const paths = Object.keys(generatedPaths);
    expect(paths.slice(paths.indexOf(LIST_PATH) + 1, paths.indexOf(LIST_PATH) + 3)).toEqual([
      NEW_PATH,
      '/candidates/{candidateId}/readiness',
    ]);
    const ids = operations.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(145);
    expect(ids.indexOf('getCandidateAssessmentSources')).toBe(
      ids.indexOf('listCandidateAssessments') + 1,
    );
    expect(ids.indexOf('getCandidateReadiness')).toBe(
      ids.indexOf('getCandidateAssessmentSources') + 1,
    );
  });

  it('document-level metadata: only info.version names the new release', () => {
    for (const key of Object.keys(v130.openApi)) {
      if (key === 'paths' || key === 'components' || key === 'info') continue;
      expect(isDeepStrictEqual(openApi[key], v130.openApi[key]), key).toBe(true);
    }
    expect(Object.keys(openApi)).toEqual(Object.keys(frozenOpenApi));
    expect(openApi['info']).toEqual({
      ...(frozenOpenApi['info'] as JsonObject),
      version: '1.4.0',
    });
    const components = openApi['components'] as JsonObject;
    const v130Components = v130.openApi['components'] as JsonObject;
    expect(Object.keys(components)).toEqual(Object.keys(v130Components));
    for (const key of ['securitySchemes', 'parameters', 'responses']) {
      expect(isDeepStrictEqual(components[key], v130Components[key]), key).toBe(true);
    }
  });

  it('an existing client keeps working: every assessment schema and operation is unchanged since v1.0.0', () => {
    for (const name of [
      'CandidateAssessment',
      'AssessmentSource',
      'AssessmentSupport',
      'AskDisposition',
      'CaptureAssessment',
      'CaptureCandidateAssessmentResponse',
      'CandidateAssessmentPage',
      'ListCandidateAssessmentsResponse',
      'GateSummary',
      'Readiness',
      'GetCandidateReadinessResponse',
      'ExportUnsigned',
      'ResponseMeta',
    ]) {
      expect(isDeepStrictEqual(generatedDefs[name], frozenDefs[name]), name).toBe(true);
    }
    // POST/GET /candidates/{candidateId}/assessments, readiness and export are exactly the frozen
    // operations: the capture, the list and the later readiness shapes are untouched.
    for (const route of [
      LIST_PATH,
      '/candidates/{candidateId}/readiness',
      '/candidates/{candidateId}/unsigned-exports',
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

describe('the added read: the stored support rows of one assessment of this candidate, read-only, historical', () => {
  const spec: OperationSpec | undefined = operations.find(
    (operation) => operation.operationId === 'getCandidateAssessmentSources',
  );
  const pathItem = (openApi['paths'] as JsonObject)[NEW_PATH] as JsonObject | undefined;
  const generatedOperation = (pathItem?.['get'] ?? {}) as JsonObject;

  it('GET under the candidate and the assessment, session only, no body, no If-Match, no Idempotency-Key, not a list', () => {
    expect(Object.keys(pathItem ?? {}), NEW_PATH).toEqual(['get']);
    expect(isDeepStrictEqual(pathItem, amendment.operations.added[NEW_PATH])).toBe(true);
    expect(spec).toMatchObject({
      method: 'get',
      path: NEW_PATH,
      tags: ['Assessment'],
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
      ['candidateId', 'path', true],
      ['id', 'path', true],
    ]);
    for (const parameter of generatedOperation['parameters'] as JsonObject[]) {
      expect(parameter['schema']).toEqual({
        type: 'string',
        maxLength: 36,
        minLength: 36,
        format: 'uuid',
      });
    }
    // Not a list: no limit, cursor or q — every row of the assessment in one response.
    expect(spec?.parameters.filter((parameter) => 'ref' in parameter)).toEqual([]);
    // The errors of the contracted list of the candidate's assessments (listCandidateAssessments).
    const list = ((openApi['paths'] as JsonObject)[LIST_PATH] as JsonObject)['get'] as JsonObject;
    expect(Object.keys(generatedOperation['responses'] as JsonObject)).toEqual(
      Object.keys(list['responses'] as JsonObject),
    );
    expect(Object.keys(generatedOperation['responses'] as JsonObject)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '409',
      '413',
      '422',
      '429',
      '500',
    ]);
    expect(generatedOperation['security']).toEqual([{ SessionCookie: [] }]);
    expect(generatedOperation['summary']).toBe(
      'Read the exact AssessmentSource rows recorded for one assessment of this candidate; a stored historical record, not proof, a review or a gate result.',
    );
  });

  it('the response is the assessment id and its stored AssessmentSource rows (1–100), nothing else', () => {
    expect(generatedDefs['GetCandidateAssessmentSourcesResponse']).toEqual({
      type: 'object',
      properties: {
        data: { $ref: '#/$defs/CandidateAssessmentSourcesView' },
        meta: { $ref: '#/$defs/ResponseMeta' },
      },
      required: ['data', 'meta'],
      additionalProperties: false,
    });
    const view = generatedDefs['CandidateAssessmentSourcesView'] as JsonObject;
    expect(view['properties']).toEqual({
      assessmentId: { type: 'string', maxLength: 36, minLength: 36, format: 'uuid' },
      sources: {
        type: 'array',
        items: { $ref: '#/$defs/AssessmentSource' },
        minItems: 1,
        maxItems: 100,
      },
    });
    expect(view['required']).toEqual(['assessmentId', 'sources']);
    expect(view['additionalProperties']).toBe(false);
    // The wire meaning: exact stored rows; historical only; not proof, currentness, a document
    // review by itself, G1–G7 or readiness.
    const description = String(view['description']);
    expect(description).toMatch(/^The exact stored AssessmentSource rows recorded for one/);
    for (const phrase of [
      'in ascending createdAt, then id order',
      'A historical record only',
      'never proof or truth of a supported conclusion',
      'a document review by itself',
      'currentness',
      'G1–G7 or readiness',
    ]) {
      expect(description, phrase).toContain(phrase);
    }
    // The bound is exactly the supports a capture accepts (the only writer of rows).
    const capture = generatedDefs['CaptureAssessment'] as JsonObject;
    const sources = (capture['properties'] as JsonObject)['sources'] as JsonObject;
    expect([sources['minItems'], sources['maxItems']]).toEqual([1, 100]);
    // The stored-row schema it references is the frozen v1.0.0 one, unchanged: exactly id,
    // assessmentId, caseSourceId, supportedConclusion, createdAt and createdById.
    expect(generatedDefs['AssessmentSource']).toEqual(frozenDefs['AssessmentSource']);
    expect((generatedDefs['AssessmentSource'] as JsonObject)['required']).toEqual([
      'id',
      'assessmentId',
      'caseSourceId',
      'supportedConclusion',
      'createdAt',
      'createdById',
    ]);
  });

  it('no present-day, proof, review, gate, readiness, currentness or link-state field is added', () => {
    const forbidden =
      /^(g[1-7]\w*|ready\w*|readiness|eligib\w*|authori[sz]ed\w*|current\w*|isCurrent\w*|valid\w*|approved\w*|verified\w*|proven\w*|proof\w*|reviewed\w*|provenance|resolution\w*|linkState|status|state|stale\w*|fresh\w*|applicab\w*|present\w*|epoch|result|gate)$/i;
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
    expect(keys.sort()).toEqual(['assessmentId', 'data', 'meta', 'sources']);
    expect(keys.filter((key) => forbidden.test(key))).toEqual([]);
    // Only existing schemas are referenced (besides the new view itself).
    expect(refs.sort()).toEqual([
      '#/$defs/AssessmentSource',
      '#/$defs/CandidateAssessmentSourcesView',
      '#/$defs/ResponseMeta',
    ]);
  });
});
