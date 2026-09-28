// Production-context rules (P4D) that need no database: TB canonical JSON v1 parity with the frozen
// reference helper, the dependency digest (scope, order, row versions, identifiers), the assembly of
// a bare case (gaps listed, nothing filled in, row versions outside the digest), the contracted
// bounds, the request scope rules, the query parsing of array and required parameters, and the
// module's source: plain reads only — no write, lock, clock, network or process call. Database
// behaviour is covered over HTTP in tests/db/p4d-http.test.ts.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ContextView, Dependency } from '../../packages/contracts/src/index.js';
import {
  CONTRACT_BASELINE,
  ContextViewSchema,
  PFC_SCHEMA_VERSION,
} from '../../packages/contracts/src/index.js';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import {
  tbCanonicalJson,
  tbCanonicalSha256,
} from '../../apps/api/src/infrastructure/integrity/tb-canonical-json.js';
import {
  contractOperation,
  parseQuery,
} from '../../apps/api/src/infrastructure/write/request-parsing.js';
import {
  assembleContext,
  CORRESPONDENCE_SOURCE_NOT_APPLICABLE,
  DRAFTING_BLOCKING_CODES,
  exceededLimit,
  NAMED_CITATIONS_MAXIMUM,
  SOURCE_NOT_APPLICABLE,
} from '../../apps/api/src/modules/production/context-assembly.js';
import {
  DEPENDENCY_DIGEST_ALGORITHM,
  dependencyDigest,
} from '../../apps/api/src/modules/production/context-dependencies.js';
import {
  contextScope,
  type ContextScope,
} from '../../apps/api/src/modules/production/context-scope.js';
import type { ContextRows } from '../../apps/api/src/modules/production/context-snapshot.js';
import {
  type CitingRows,
  SOURCE_CITATION_KINDS,
  type SourceCitationKind,
  sourceCitations,
} from '../../apps/api/src/modules/production/context-sources.js';
import type { ApplicabilityProblem } from '../../apps/api/src/modules/sources/source-scope.js';
import {
  CURRENT_DIGEST_V2,
  currentV2Digest,
  digestPreimageText,
  LEGACY_DIGEST_V1,
  legacyV1Digest,
} from '../support/context-digest-oracles.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const FROZEN_HELPER = path.join(
  repoRoot,
  'docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/contracts/consistency-reference.mjs',
);
const PRODUCTION_MODULE = path.join(repoRoot, 'apps/api/src/modules/production');

const CASE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const AGENCY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const SELECTION = '16fd2706-8baf-433b-82eb-8c7fada847da';
const PARENT = '886313e1-3b8a-4372-9b90-0c9aee199e5d';
const PRIOR_A = 'a3bb189e-8bf9-4888-9912-ace4e6543002';
const PRIOR_B = 'c56a4180-65aa-42ec-a945-5fd21dec0538';

function refusal(action: () => unknown): [number, string, Record<string, unknown>] {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiError) return [error.status, error.code, { ...error.details }];
    throw error;
  }
  throw new Error('expected a refusal');
}

function thrown(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '(no error)';
}

describe('TB canonical JSON v1 — the frozen reference helper, ported without change', () => {
  it('produces the same text and SHA-256 as the frozen helper for every admitted value, keys in UTF-16 code-unit order', async () => {
    const frozen = (await import(pathToFileURL(FROZEN_HELPER).href)) as {
      canonicalJson(value: unknown): string;
      canonicalSha256(value: unknown): string;
    };
    const values: unknown[] = [
      null,
      true,
      false,
      0,
      1,
      -1,
      Number.MAX_SAFE_INTEGER,
      -Number.MAX_SAFE_INTEGER,
      '',
      'ascii',
      'Été – “quoted” \\ back\nline sep',
      '𝄞 music',
      [],
      [1, [2, [3, []]], { z: 1, a: [null] }],
      {},
      // U+1D11E (surrogates D834 DD1E) sorts before U+FF5A in UTF-16 order, after it by code point.
      { ｚ: 1, '𝄞': 2, b: 3, a: 4, A: 5, é: 6, '': 7, a1: 8, 'a 1': 9 },
      { nested: { deeper: { list: [{ y: 'y', x: 'x' }], flag: false } }, n: 42 },
    ];
    for (const value of values) {
      expect(tbCanonicalJson(value), JSON.stringify(value)).toBe(frozen.canonicalJson(value));
      expect(tbCanonicalSha256(value)).toBe(frozen.canonicalSha256(value));
    }
    expect(tbCanonicalJson({ ｚ: 1, '𝄞': 2 })).toBe('{"𝄞":2,"ｚ":1}');
    expect(tbCanonicalJson({ b: [2, 1], a: 'x' })).toBe('{"a":"x","b":[2,1]}');
  });

  it('refuses exactly what the frozen helper refuses, with the same error', async () => {
    const frozen = (await import(pathToFileURL(FROZEN_HELPER).href)) as {
      canonicalJson(value: unknown): string;
    };
    class Box {
      readonly v = 1;
    }
    const refused: unknown[] = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1.5,
      -0,
      2 ** 53,
      'a\0b',
      '\uD800',
      '\uDC00x',
      { 'key\0': 1 },
      { k: undefined },
      undefined,
      new Date(0),
      10n,
      () => 1,
      new Map(),
      Object.create(null) as object,
      new Box(),
      [1, undefined],
    ];
    for (const value of refused) {
      const expected = thrown(() => frozen.canonicalJson(value));
      expect(expected).not.toBe('(no error)');
      expect(thrown(() => tbCanonicalJson(value))).toBe(expected);
    }
  });
});

const scope = (overrides: Partial<ContextScope> = {}): ContextScope => ({
  caseId: CASE,
  taskType: 'NMI_REPLY',
  generationMode: 'PREPARATION',
  authoritySelectionId: SELECTION,
  parentBindingId: PARENT,
  priorBindingIds: [PRIOR_A, PRIOR_B],
  ...overrides,
});
const dependency = (
  entityType: string,
  entityId: string,
  fingerprint: string,
  rowVersion: number | null = null,
): Dependency => ({ entityType, entityId, rowVersion, fingerprint });
const DEPENDENCIES: Dependency[] = [
  dependency('CaseRecord', CASE, 'a'.repeat(64), 3),
  dependency('CaseAuthoritySelection', SELECTION, 'b'.repeat(64)),
];

describe('dependencyDigest — the closure and the scope, never a row version or a clock', () => {
  it('is the SHA-256 of the TB canonical JSON of the algorithm, contract, PFC version, scope (priors as a sorted set) and the dependencies without row versions', () => {
    expect(DEPENDENCY_DIGEST_ALGORITHM).toBe('TB-PRODUCTION-CONTEXT-DIGEST-v2');
    expect(CONTRACT_BASELINE).toBe('TB-SCHEMA-API-v1.3.0');
    expect(PFC_SCHEMA_VERSION).toBe('PFC-YT-EMAIL-v1.1');
    expect(dependencyDigest(scope(), DEPENDENCIES)).toBe(
      tbCanonicalSha256({
        algorithm: 'TB-PRODUCTION-CONTEXT-DIGEST-v2',
        contract: 'TB-SCHEMA-API-v1.3.0',
        schemaVersion: 'PFC-YT-EMAIL-v1.1',
        scope: {
          caseId: CASE,
          taskType: 'NMI_REPLY',
          generationMode: 'PREPARATION',
          authoritySelectionId: SELECTION,
          parentBindingId: PARENT,
          priorBindingIds: [PRIOR_A, PRIOR_B].sort(),
        },
        dependencies: DEPENDENCIES.map(({ entityType, entityId, fingerprint }) => ({
          entityType,
          entityId,
          fingerprint,
        })),
      }),
    );
  });

  it('is deterministic, ignores the order priors are named in and row versions, and changes with every scope field and fingerprint', () => {
    const base = dependencyDigest(scope(), DEPENDENCIES);
    expect(dependencyDigest(scope(), DEPENDENCIES)).toBe(base);
    expect(dependencyDigest(scope({ priorBindingIds: [PRIOR_B, PRIOR_A] }), DEPENDENCIES)).toBe(
      base,
    );
    const renumbered = DEPENDENCIES.map((entry) => ({ ...entry, rowVersion: 99 }));
    expect(dependencyDigest(scope(), renumbered)).toBe(base);
    const variants = [
      dependencyDigest(
        scope({ taskType: 'INITIAL', parentBindingId: null, priorBindingIds: [] }),
        DEPENDENCIES,
      ),
      dependencyDigest(scope({ generationMode: 'DRAFTING' }), DEPENDENCIES),
      dependencyDigest(scope({ authoritySelectionId: null }), DEPENDENCIES),
      dependencyDigest(scope({ parentBindingId: null }), DEPENDENCIES),
      dependencyDigest(scope({ priorBindingIds: [PRIOR_A] }), DEPENDENCIES),
      dependencyDigest(scope({ caseId: PRIOR_B }), DEPENDENCIES),
      dependencyDigest(scope(), [DEPENDENCIES[0] as Dependency]),
      dependencyDigest(scope(), [
        DEPENDENCIES[0] as Dependency,
        { ...(DEPENDENCIES[1] as Dependency), fingerprint: 'c'.repeat(64) },
      ]),
      dependencyDigest(scope(), [
        DEPENDENCIES[0] as Dependency,
        { ...(DEPENDENCIES[1] as Dependency), entityId: PRIOR_B },
      ]),
    ];
    expect(new Set([base, ...variants]).size).toBe(variants.length + 1);
  });
});

describe('TB-PRODUCTION-CONTEXT-DIGEST-v2 — the digest definition names the context semantics (R14-AUD-013, ADR-0007)', () => {
  const IDENTIFIERS = { contract: 'TB-SCHEMA-API-v1.3.0', schemaVersion: 'PFC-YT-EMAIL-v1.1' };
  /** The v2 preimage of scope() and DEPENDENCIES, written out as its TB canonical JSON v1 text. */
  const V2_PREIMAGE = `{"algorithm":"TB-PRODUCTION-CONTEXT-DIGEST-v2","contract":"TB-SCHEMA-API-v1.3.0","dependencies":[{"entityId":"${CASE}","entityType":"CaseRecord","fingerprint":"${'a'.repeat(64)}"},{"entityId":"${SELECTION}","entityType":"CaseAuthoritySelection","fingerprint":"${'b'.repeat(64)}"}],"schemaVersion":"PFC-YT-EMAIL-v1.1","scope":{"authoritySelectionId":"${SELECTION}","caseId":"${CASE}","generationMode":"PREPARATION","parentBindingId":"${PARENT}","priorBindingIds":["${PRIOR_A}","${PRIOR_B}"],"taskType":"NMI_REPLY"}}`;
  const V2_GOLDEN = '68c080db4609de5c744a0810c499d3b828c6726f2503c801df7e525900dd5ffc';
  /** What the accepted TB-PRODUCTION-CONTEXT-DIGEST-v1 implementation computed for the same inputs (e0a521a). */
  const V1_GOLDEN = 'df75eed4984e595e8b16c1a3e200beb596362086117aad0f7022fdd1609fbc9e';
  const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

  it('golden: the written-out v2 preimage hashes to the pinned value and the application computes exactly it — the same scope and dependencies give the same digest whatever the priors’ order or the row versions; no clock', () => {
    expect(DEPENDENCY_DIGEST_ALGORITHM).toBe(CURRENT_DIGEST_V2);
    expect(sha256(V2_PREIMAGE)).toBe(V2_GOLDEN);
    expect(digestPreimageText(CURRENT_DIGEST_V2, IDENTIFIERS, scope(), DEPENDENCIES)).toBe(
      V2_PREIMAGE,
    );
    expect(currentV2Digest(IDENTIFIERS, scope(), DEPENDENCIES)).toBe(V2_GOLDEN);
    expect(dependencyDigest(scope(), DEPENDENCIES)).toBe(V2_GOLDEN);
    expect(
      dependencyDigest(
        scope({ priorBindingIds: [PRIOR_B, PRIOR_A] }),
        DEPENDENCIES.map((entry) => ({ ...entry, rowVersion: 42 })),
      ),
    ).toBe(V2_GOLDEN);
  });

  it('the legacy v1 oracle reproduces the accepted v1 digest exactly; the two definitions differ only in the identifier, so the same closure, scope, contract and PFC identifiers give two different digests', () => {
    const v1Preimage = digestPreimageText(LEGACY_DIGEST_V1, IDENTIFIERS, scope(), DEPENDENCIES);
    expect(v1Preimage).toBe(
      V2_PREIMAGE.replace(
        '"algorithm":"TB-PRODUCTION-CONTEXT-DIGEST-v2"',
        '"algorithm":"TB-PRODUCTION-CONTEXT-DIGEST-v1"',
      ),
    );
    expect(sha256(v1Preimage)).toBe(V1_GOLDEN);
    expect(legacyV1Digest(IDENTIFIERS, scope(), DEPENDENCIES)).toBe(V1_GOLDEN);
    expect(V1_GOLDEN).not.toBe(V2_GOLDEN);
    expect(dependencyDigest(scope(), DEPENDENCIES)).not.toBe(V1_GOLDEN);
  });

  it('one implementation path: the application names the digest identifier in exactly one definition, computes the digest in one call (the assembly every read, prompt rebuild and validation uses) and offers no algorithm choice, version parameter or v1 fallback', () => {
    const appRoot = path.join(repoRoot, 'apps');
    const roots = [
      path.join(appRoot, 'api/src'),
      path.join(appRoot, 'web/src'),
      path.join(repoRoot, 'packages/contracts/src'),
    ];
    const withoutComments = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
    const named: string[] = [];
    const definitions: string[] = [];
    const calls: string[] = [];
    for (const root of roots) {
      for (const entry of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        const file = path.relative(repoRoot, path.join(root, entry));
        const text = withoutComments(readFileSync(path.join(root, entry), 'utf8'));
        for (const match of text.matchAll(/TB-PRODUCTION-CONTEXT-DIGEST-v\d+/g)) {
          named.push(`${file}: ${match[0]}`);
        }
        if (/export const DEPENDENCY_DIGEST_ALGORITHM\b/.test(text)) definitions.push(file);
        calls.push(...(text.match(/\bdependencyDigest\(/g) ?? []).map(() => file));
      }
    }
    // The current definition once; the v1 string only as TB-TECHNICAL-RULESET-v2's pinned vocabulary.
    expect(named.sort()).toEqual([
      'apps/api/src/modules/production/context-dependencies.ts: TB-PRODUCTION-CONTEXT-DIGEST-v2',
      'apps/api/src/modules/validation/technical-ruleset.ts: TB-PRODUCTION-CONTEXT-DIGEST-v1',
    ]);
    expect(definitions).toEqual(['apps/api/src/modules/production/context-dependencies.ts']);
    expect(calls.sort()).toEqual([
      'apps/api/src/modules/production/context-assembly.ts',
      'apps/api/src/modules/production/context-dependencies.ts',
    ]);
    // The digest takes the scope and the closure only: nothing selects a definition.
    expect(dependencyDigest).toHaveLength(2);
    const definition = withoutComments(
      readFileSync(path.join(PRODUCTION_MODULE, 'context-dependencies.ts'), 'utf8'),
    );
    expect(definition.match(/algorithm:/g)).toEqual(['algorithm:']);
    expect(definition).toMatch(/algorithm: DEPENDENCY_DIGEST_ALGORITHM,/);
  });
});

/** The rows of a bare case of one agency: no route, selection, intake, source or binding. */
function bareRows(overrides: { contextRevision?: number; rowVersion?: number } = {}): ContextRows {
  const caseRow = {
    id: CASE,
    agencyId: AGENCY,
    platform: 'YOUTUBE',
    caseClass: 'WORKING_INTAKE',
    routeId: null,
    ownerHintId: null,
    canonicalCaseId: null,
    canonicalBindingSourceId: null,
    currentAuthoritySelectionId: null,
    packetSourceId: null,
    driveFolderUrl: null,
    contextRevision: overrides.contextRevision ?? 3,
    archivedAt: null,
    rowVersion: overrides.rowVersion ?? 5,
  };
  const agency = {
    id: AGENCY,
    legalName: null,
    organizationType: null,
    jurisdictionCountry: null,
    registrationAuthority: null,
    registrationNumber: null,
    recordState: 'DRAFT',
    canonicalCode: null,
    canonicalSourceId: null,
    bindingState: 'LOCAL_ONLY',
    archivedAt: null,
    rowVersion: 1,
  };
  return {
    caseRow: caseRow as unknown as ContextRows['caseRow'],
    agency: agency as unknown as ContextRows['agency'],
    route: null,
    ownerSubject: null,
    owner: null,
    legalSubject: null,
    selection: null,
    signer: null,
    pinned: [],
    coverages: [],
    versions: [],
    mandates: [],
    coverageSigners: [],
    events: [],
    versionSuccessors: [],
    coverageSuccessors: [],
    items: [],
    works: [],
    mappings: [],
    facts: [],
    factSources: [],
    caseSources: [],
    sources: [],
    sourceHeads: new Map(),
    parent: null,
    priors: [],
    correspondence: [],
    sourceCitations: [],
    sourceApplicability: new Map(),
  };
}

describe('assembleContext — a bare case: gaps listed, nothing filled in, no verdict', () => {
  const bare = (overrides: Partial<ContextScope> = {}) =>
    scope({ authoritySelectionId: null, parentBindingId: null, priorBindingIds: [], ...overrides });

  it('INITIAL lists the five required-content gaps (all DRAFTING-blocking) and returns nulls and empty lists, the fixed literals and a contract-valid view', () => {
    const { view, blocking } = assembleContext(bareRows(), bare({ taskType: 'INITIAL' }));
    const codes = view.context.missing.map((entry) => entry.code);
    expect(codes).toEqual([
      'CASE_ROUTE_UNBOUND',
      'AUTHORITY_SELECTION_NOT_SELECTED',
      'REPORTED_ITEMS_ABSENT',
      'WORKS_ABSENT',
      'USE_MAPPINGS_ABSENT',
    ]);
    expect(blocking).toEqual(codes);
    expect(view.context.conflicts).toEqual([]);
    expect(view.context.party).toEqual({
      agencyId: AGENCY,
      ownerId: null,
      legalSubjectId: null,
      signerId: null,
      agencyLegalName: null,
      legalSubjectName: null,
      signerFullLegalName: null,
    });
    expect(view.context.authority).toBeNull();
    expect([
      view.context.sourcePrecedence,
      view.context.signatureState,
      view.context.externalAction,
      view.context.scannerVerification,
    ]).toEqual([
      'CANONICAL_PRIMARY_RECORDS_OVER_APP_DERIVATIVES',
      'HUMAN_PENDING',
      'PROHIBITED',
      'DISABLED',
    ]);
    expect(view.dependencies.map((entry) => entry.entityType)).toEqual(['Agency', 'CaseRecord']);
    expect(ContextViewSchema.safeParse(view).success).toBe(true);
  });

  it('NMI_REPLY adds the parent and prior gaps; DRAFTING_BLOCKING_CODES is exactly the required content of PFC §4 and the reply rule', () => {
    const { view, blocking } = assembleContext(bareRows(), bare());
    expect(blocking).toEqual([
      'CASE_ROUTE_UNBOUND',
      'AUTHORITY_SELECTION_NOT_SELECTED',
      'REPORTED_ITEMS_ABSENT',
      'WORKS_ABSENT',
      'USE_MAPPINGS_ABSENT',
      'REPLY_PARENT_NOT_SELECTED',
      'PRIOR_AS_SENT_NOT_SELECTED',
    ]);
    expect([...DRAFTING_BLOCKING_CODES]).toEqual(blocking);
    expect(view.context.parentBindingId).toBeNull();
    expect(view.context.priorCorrespondenceIds).toEqual([]);
    expect(view.context.correspondence).toEqual([]);
  });

  it('the same rows always give the same view; the row version is a diagnostic outside the digest, the context revision is inside it', () => {
    const first = assembleContext(bareRows(), bare()).view;
    expect(assembleContext(bareRows(), bare()).view).toEqual(first);
    const touched = assembleContext(bareRows({ rowVersion: 6 }), bare()).view;
    expect(touched.dependencyDigest).toBe(first.dependencyDigest);
    expect(touched.dependencies.find((d) => d.entityType === 'CaseRecord')?.rowVersion).toBe(6);
    const revised = assembleContext(bareRows({ contextRevision: 4 }), bare()).view;
    expect(revised.dependencyDigest).not.toBe(first.dependencyDigest);
    expect(revised.contextRevision).toBe(4);
    expect(revised.context.caseContextRevision).toBe(4);
  });
});

// ---- R14-AUD-001: sources a captured message cites, rechecked against the case ----------------

const ROUTE = '9b2f3c1e-1d2a-4b6c-8e7f-0a1b2c3d4e5f';
const ASSOCIATION = '4e1d2c3b-5a6f-4e7d-9c8b-1a2b3c4d5e6f';
const OWNER = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e60';
const SUBJECT = '5d6e7f80-9a0b-4c1d-8e2f-3a4b5c6d7e8f';
const MESSAGE = '6e7f8091-a0b1-4c2d-9e3f-4a5b6c7d8e9f';
const RAW = '70819203-b1c2-4d3e-8f40-5a6b7c8d9e0f';
const ATTACHED = '81920314-c2d3-4e4f-9051-6a7b8c9d0e1f';
const SHARED = '92031425-d3e4-4f50-8162-7a8b9c0d1e2f';
const USER = '03142536-e4f5-4061-9273-8a9b0c1d2e3f';
const RECORDED = new Date('2026-09-20T10:00:00.000Z');

/** A synthetic source revision row of the case's agency (scope as given). */
function sourceRow(id: string, scopeBindings: unknown) {
  return {
    id,
    agencyId: AGENCY,
    sourceGroupId: id,
    revision: 1,
    supersedesSourceId: null,
    title: 'SYNTHETIC cited source',
    canonicalUrl: null,
    providerFileId: null,
    providerRevisionId: null,
    sourceRole: 'PRIMARY_CORRESPONDENCE',
    accessState: 'NOT_CHECKED',
    contentSha256: null,
    hashTarget: null,
    reportedProvenance: 'OPERATOR_REPORTED',
    rawProvenance: null,
    scopeText: 'SYNTHETIC recorded scope',
    scopeBindings,
    observedAt: null,
    reviewedByLabel: null,
    reviewedAt: null,
    excerpt: null,
    excerptLocator: null,
    limitations: null,
    createdAt: RECORDED,
    createdById: USER,
  };
}

/**
 * A case bound to a route (owner OWNER, subject SUBJECT) whose parent NMI message cites a raw source
 * and, in attachment observation 1, another source; attachment 0 names none. `problems` are what the
 * snapshot found when it evaluated each listed source against the case (by source id; every other
 * listed source applies). The citations are collected from the rows by the production collector.
 */
function citedRows(problems: Record<string, ApplicabilityProblem> = {}): ContextRows {
  const rows = bareRows();
  const caseRow = { ...rows.caseRow, routeId: ROUTE };
  const message = {
    id: MESSAGE,
    agencyId: AGENCY,
    mailboxAddress: 'notices@example.invalid',
    direction: 'INBOUND',
    subject: 'SYNTHETIC request for more information',
    messageId: null,
    inReplyTo: null,
    references: null,
    sourceIdentityHash: null,
    captureMode: 'RAW_SOURCE',
    bodyRole: 'FULL_MESSAGE',
    bodyText: 'SYNTHETIC body',
    bodySha256: 'd'.repeat(64),
    rawSourceId: RAW,
    attachmentsManifest: [
      { fileName: 'SYNTHETIC-note.txt', state: 'COPIED_TEXT_ALLEGATION' },
      { fileName: 'SYNTHETIC-licence.pdf', sourceId: ATTACHED, state: 'OBSERVED_IN_RAW_MIME' },
    ],
    headerDateRaw: null,
    occurredAt: null,
    timestampPrecision: 'UNKNOWN',
    fromAddress: null,
    toAddress: null,
    replyToAddress: null,
    limitations: null,
    createdAt: RECORDED,
    createdById: USER,
  };
  const binding = {
    id: PARENT,
    caseId: CASE,
    agencyId: AGENCY,
    correspondenceId: MESSAGE,
    reportedItemId: null,
    eventType: 'NMI',
    platformReference: null,
    outcome: null,
    interpretation: null,
    supersedesBindingId: null,
    createdAt: RECORDED,
    createdById: USER,
  };
  const cited: ContextRows = {
    ...rows,
    caseRow: caseRow as unknown as ContextRows['caseRow'],
    route: {
      id: ROUTE,
      agencyId: AGENCY,
      ownerSubjectId: ASSOCIATION,
      platform: 'YOUTUBE',
      linkState: 'LINKED',
      canonicalCode: null,
      canonicalSourceId: null,
      bindingState: 'LOCAL_ONLY',
      archivedAt: null,
      rowVersion: 1,
    } as unknown as ContextRows['route'],
    ownerSubject: {
      id: ASSOCIATION,
      ownerId: OWNER,
      legalSubjectId: SUBJECT,
      sourceId: null,
      linkState: 'LINKED',
      rowVersion: 1,
    } as unknown as ContextRows['ownerSubject'],
    sources: [
      sourceRow(RAW, { legalSubjectIds: ['1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a'] }),
      sourceRow(ATTACHED, null),
    ] as unknown as ContextRows['sources'],
    parent: binding as unknown as ContextRows['parent'],
    correspondence: [message] as unknown as ContextRows['correspondence'],
  };
  return {
    ...cited,
    sourceCitations: sourceCitations(cited),
    sourceApplicability: new Map(cited.sources.map((row) => [row.id, problems[row.id] ?? null])),
  };
}

describe('correspondence sources outside the case scope (R14-AUD-001) — a recorded conflict, never silently clean', () => {
  const reply = () => scope({ authoritySelectionId: null, priorBindingIds: [] });
  const subjectProblem: Record<string, ApplicabilityProblem> = {
    [RAW]: { code: 'SOURCE_SCOPE_UNRESOLVED', reason: 'SCOPED_TO_OTHER_SUBJECT' },
  };
  const ownerProblem: Record<string, ApplicabilityProblem> = {
    [ATTACHED]: { code: 'CROSS_OWNER_REFERENCE', ownerId: SHARED },
  };

  it('each citation the snapshot found not applicable is one conflict naming the source, the message, raw or attachment, and the reason; the sources stay listed as recorded', () => {
    const { view } = assembleContext(citedRows({ ...subjectProblem, ...ownerProblem }), reply());
    expect(view.context.conflicts).toEqual([
      {
        code: 'CORRESPONDENCE_SOURCE_NOT_APPLICABLE',
        message: `Recorded source ${RAW}, the raw source of captured message ${MESSAGE}, is not applicable to the current Case scope (SOURCE_SCOPE_UNRESOLVED: SCOPED_TO_OTHER_SUBJECT). The capture was checked against its agency only. The message and the source are kept as recorded; this is a source-scope condition, not a finding about what the source shows.`,
        fieldPath: 'correspondence[0].rawSourceId',
      },
      {
        code: 'CORRESPONDENCE_SOURCE_NOT_APPLICABLE',
        message: `Recorded source ${ATTACHED}, the source of attachment observation 1 of captured message ${MESSAGE}, is not applicable to the current Case scope (CROSS_OWNER_REFERENCE). The capture was checked against its agency only. The message and the source are kept as recorded; this is a source-scope condition, not a finding about what the source shows.`,
        fieldPath: 'correspondence[0].attachmentsManifest[1].sourceId',
      },
    ]);
    expect(CORRESPONDENCE_SOURCE_NOT_APPLICABLE).toBe('CORRESPONDENCE_SOURCE_NOT_APPLICABLE');
    // Traceability: both sources stay in the manifest and the closure, exactly as recorded.
    expect(view.context.sources.map((entry) => entry.sourceId).sort()).toEqual(
      [RAW, ATTACHED].sort(),
    );
    expect(
      view.dependencies.filter((d) => d.entityType === 'SourceReference').map((d) => d.entityId),
    ).toEqual([RAW, ATTACHED].sort());
    // No other owner's id, no verdict wording: a source-scope condition only.
    expect(JSON.stringify(view.context.conflicts)).not.toContain(SHARED);
    expect(JSON.stringify(view.context.conflicts)).not.toMatch(
      /invalid|unauthori[sz]ed|no authority|infring|G[1-7]\b|verified/i,
    );
    expect(ContextViewSchema.safeParse(view).success).toBe(true);
  });

  it('no problem, no conflict: a citation the snapshot found applicable is listed like any other source', () => {
    const { view } = assembleContext(citedRows(), reply());
    expect(view.context.conflicts).toEqual([]);
    expect(view.context.sources.map((entry) => entry.sourceId).sort()).toEqual(
      [RAW, ATTACHED].sort(),
    );
  });

  it('the digest covers it exactly: a recorded-scope reason follows from records in the closure (no fingerprint changes); another owner’s use lies outside it, so its existence joins that source’s fingerprint', () => {
    const clean = assembleContext(citedRows(), reply()).view;
    const subject = assembleContext(citedRows(subjectProblem), reply()).view;
    expect(subject.dependencies).toEqual(clean.dependencies);
    expect(subject.dependencyDigest).toBe(clean.dependencyDigest);
    const owner = assembleContext(citedRows(ownerProblem), reply()).view;
    expect(owner.dependencyDigest).not.toBe(clean.dependencyDigest);
    const differing = owner.dependencies.filter(
      (d, index) => d.fingerprint !== clean.dependencies[index]?.fingerprint,
    );
    expect(differing.map((d) => `${d.entityType}:${d.entityId}`)).toEqual([
      `SourceReference:${ATTACHED}`,
    ]);
    const cleanAttached = clean.dependencies.find((d) => d.entityId === ATTACHED);
    expect(cleanAttached?.fingerprint).not.toBe(differing[0]?.fingerprint);
  });
});

// ---- R14-AUD-009 / R14-AUD-010: every source a context lists is cited and checked ---------------

/** Synthetic ids: sources, case source links, facts, mappings, versions, coverages, events. */
const id = (prefix: string, n: number) =>
  `${prefix}${String(n).padStart(8 - prefix.length, '0')}-0000-4000-8000-000000000000`;
const SRC = (n: number) => id('5', n);
const LINK = (n: number) => id('6', n);
const FACT = (n: number) => id('7', n);
const MAPPING = (n: number) => id('8', n);
const VERSION = (n: number) => id('9', n);
const COVERAGE = (n: number) => id('a', n);
const SIGNER_ROW = (n: number) => id('b', n);
const EVENT = (n: number) => id('c', n);

/** Records citing seventeen sources, one kind of citation each (SRC(5) also through its link). */
function allCitingRows(): CitingRows {
  return {
    caseRow: { id: CASE, canonicalBindingSourceId: SRC(1), packetSourceId: SRC(2) },
    caseSources: [
      { id: LINK(1), sourceId: SRC(3), useRole: 'SYNTHETIC_SUPPORT' },
      { id: LINK(2), sourceId: SRC(4), useRole: 'SYNTHETIC_POLICY' },
      // Not LINKED: part of the context only because the fact support below names it.
      { id: LINK(3), sourceId: SRC(5), useRole: 'SYNTHETIC_SUPPORT' },
    ],
    factSources: [{ id: FACT(1), factId: FACT(9), caseSourceId: LINK(3) }],
    mappings: [
      { id: MAPPING(1), basisSourceId: SRC(6) },
      { id: MAPPING(2), basisSourceId: null },
    ],
    selection: { id: SELECTION, basisSourceId: SRC(7) },
    versions: [
      {
        id: VERSION(1),
        primarySourceId: SRC(8),
        additionalSourceRefs: [
          { sourceId: SRC(9), role: 'SYNTHETIC_ANNEX', scopeText: 'SYNTHETIC annex' },
          { sourceId: SRC(10), role: 'SYNTHETIC_ANNEX', scopeText: 'SYNTHETIC annex' },
        ],
        signedDatesRaw: [
          { subjectLabel: 'SYNTHETIC party', dateRaw: '2026-09-01', sourceId: SRC(11) },
        ],
      },
    ],
    coverages: [{ id: COVERAGE(1), basisSourceId: SRC(12) }],
    coverageSigners: [{ id: SIGNER_ROW(1), sourceId: SRC(13) }],
    events: [
      { id: EVENT(1), sourceId: SRC(14), coverageId: null },
      { id: EVENT(2), sourceId: SRC(15), coverageId: COVERAGE(1) },
    ],
    correspondence: [
      {
        id: MESSAGE,
        rawSourceId: SRC(16),
        attachmentsManifest: [
          { fileName: 'SYNTHETIC-note.txt', state: 'COPIED_TEXT_ALLEGATION' },
          { fileName: 'SYNTHETIC-licence.pdf', sourceId: SRC(17), state: 'UNKNOWN' },
        ],
      },
    ],
  } as unknown as CitingRows;
}

describe('sourceCitations — every record of a context that cites a source, one inventory for every path (R14-AUD-009, R14-AUD-010)', () => {
  const inventory = () => sourceCitations(allCitingRows());
  const of = (kind: SourceCitationKind) =>
    inventory()
      .filter((citation) => citation.kind === kind)
      .map((citation) => [
        citation.sourceId,
        citation.parentEntityType,
        citation.parentEntityId,
        citation.fieldPath,
      ]);

  it('the case’s canonical binding and packet sources', () => {
    expect(of('CASE_CANONICAL')).toEqual([
      [SRC(1), 'CaseRecord', CASE, 'canonicalBindingSourceId'],
    ]);
    expect(of('CASE_PACKET')).toEqual([[SRC(2), 'CaseRecord', CASE, 'packetSourceId']]);
  });

  it('every case source link of the context, and every fact support through its link (a link that is no longer LINKED is in the context only through a support)', () => {
    expect(of('CASE_SOURCE')).toEqual([
      [SRC(3), 'CaseSource', LINK(1), 'sourceId'],
      [SRC(4), 'CaseSource', LINK(2), 'sourceId'],
      [SRC(5), 'CaseSource', LINK(3), 'sourceId'],
    ]);
    expect(of('FACT_SUPPORT')).toEqual([[SRC(5), 'FactSource', FACT(1), 'caseSourceId']]);
  });

  it('the basis of each use mapping and of the named authority selection (none for an empty basis)', () => {
    expect(of('MAPPING_BASIS')).toEqual([[SRC(6), 'UseMapping', MAPPING(1), 'basisSourceId']]);
    expect(of('SELECTION_BASIS')).toEqual([
      [SRC(7), 'CaseAuthoritySelection', SELECTION, 'basisSourceId'],
    ]);
  });

  it('a pinned mandate version’s primary, additional and signed-date sources (agency-level when recorded)', () => {
    expect(of('MANDATE_VERSION_PRIMARY')).toEqual([
      [SRC(8), 'MandateVersion', VERSION(1), 'primarySourceId'],
    ]);
    expect(of('MANDATE_VERSION_ADDITIONAL')).toEqual([
      [SRC(9), 'MandateVersion', VERSION(1), 'additionalSourceRefs[0].sourceId'],
      [SRC(10), 'MandateVersion', VERSION(1), 'additionalSourceRefs[1].sourceId'],
    ]);
    expect(of('MANDATE_VERSION_SIGNED_DATE')).toEqual([
      [SRC(11), 'MandateVersion', VERSION(1), 'signedDatesRaw[0].sourceId'],
    ]);
  });

  it('the coverage basis, the coverage signer row’s source, and each authority event’s source — a whole-mandate event (agency-level when recorded) apart from a coverage-scoped one', () => {
    expect(of('COVERAGE_BASIS')).toEqual([
      [SRC(12), 'MandateCoverage', COVERAGE(1), 'basisSourceId'],
    ]);
    expect(of('COVERAGE_SIGNER')).toEqual([[SRC(13), 'CoverageSigner', SIGNER_ROW(1), 'sourceId']]);
    expect(of('MANDATE_EVENT')).toEqual([[SRC(14), 'AuthorityEvent', EVENT(1), 'sourceId']]);
    expect(of('COVERAGE_EVENT')).toEqual([[SRC(15), 'AuthorityEvent', EVENT(2), 'sourceId']]);
  });

  it('a selected message’s raw source and each attachment observation that names a source (R14-AUD-001)', () => {
    expect(of('CORRESPONDENCE_RAW')).toEqual([[SRC(16), 'Correspondence', MESSAGE, 'rawSourceId']]);
    expect(of('CORRESPONDENCE_ATTACHMENT')).toEqual([
      [SRC(17), 'Correspondence', MESSAGE, 'attachmentsManifest[1].sourceId'],
    ]);
  });

  it('the inventory is complete and fixed: every kind, in its order; every cited source; the same rows give the same citations; each citation in words', () => {
    const cited = inventory();
    expect([...new Set(cited.map((citation) => citation.kind))]).toEqual([
      ...SOURCE_CITATION_KINDS,
    ]);
    expect([...new Set(cited.map((citation) => citation.sourceId))].sort()).toEqual(
      Array.from({ length: 17 }, (_, index) => SRC(index + 1)).sort(),
    );
    expect(inventory()).toEqual(cited);
    expect(cited.map((citation) => citation.description)).toEqual([
      'the canonical binding source of the case',
      'the packet source of the case',
      `case source link ${LINK(1)} (SYNTHETIC_SUPPORT)`,
      `case source link ${LINK(2)} (SYNTHETIC_POLICY)`,
      `case source link ${LINK(3)} (SYNTHETIC_SUPPORT)`,
      `a recorded support of fact ${FACT(9)} (through case source link ${LINK(3)})`,
      `the basis source of use mapping ${MAPPING(1)}`,
      `the basis source of authority selection ${SELECTION}`,
      `the primary source of mandate version ${VERSION(1)}`,
      `additional source 0 of mandate version ${VERSION(1)}`,
      `additional source 1 of mandate version ${VERSION(1)}`,
      `the source of signed date 0 of mandate version ${VERSION(1)}`,
      `the basis source of mandate coverage ${COVERAGE(1)}`,
      `the source of coverage signer row ${SIGNER_ROW(1)}`,
      `the source of whole-mandate authority event ${EVENT(1)}`,
      `the source of authority event ${EVENT(2)} of mandate coverage ${COVERAGE(1)}`,
      `the raw source of captured message ${MESSAGE}`,
      `the source of attachment observation 1 of captured message ${MESSAGE}`,
    ]);
  });

  it('nothing is cited that no record names: no packet, canonical, basis or source; a support naming a link outside the rows is an internal error, never a guess', () => {
    const rows = allCitingRows();
    const bare = sourceCitations({
      ...rows,
      caseRow: { id: CASE, canonicalBindingSourceId: null, packetSourceId: null },
      caseSources: [],
      factSources: [],
      mappings: [{ id: MAPPING(1), basisSourceId: null }],
      selection: { id: SELECTION, basisSourceId: null },
      versions: [
        { id: VERSION(1), primarySourceId: null, additionalSourceRefs: null, signedDatesRaw: [] },
      ],
      coverages: [{ id: COVERAGE(1), basisSourceId: null }],
      coverageSigners: [{ id: SIGNER_ROW(1), sourceId: null }],
      events: [],
      correspondence: [{ id: MESSAGE, rawSourceId: null, attachmentsManifest: null }],
    } as unknown as CitingRows);
    expect(bare).toEqual([]);
    expect(thrown(() => sourceCitations({ ...rows, caseSources: [] }))).toBe(
      'a fact support names a case source outside the rows',
    );
  });
});

/** The four sources a record other than a message cites, besides the message's two. */
const VERSION_SOURCE = SRC(21);
const EVENT_SOURCE = SRC(22);
const LINK_SOURCE = SRC(23);
const POLICY_SOURCE = SRC(24);
const NOT_A_FINDING =
  'The citing records and the source are kept as recorded; this is a source-scope condition, not a finding about what the source shows or about any authority, right or gate.';

/** A case source link row of the case (the fields the context reads). */
function linkRow(linkId: string, sourceId: string, useRole = 'SYNTHETIC_SUPPORT') {
  return {
    id: linkId,
    caseId: CASE,
    sourceId,
    useRole,
    scopeNote: 'SYNTHETIC scope note',
    linkState: 'LINKED',
    rowVersion: 1,
    createdAt: RECORDED,
    createdById: USER,
  };
}

/**
 * The cited rows (a message citing RAW and ATTACHED) plus sources other records cite: a mandate
 * version's primary source, a whole-mandate event's source, a case source link's source that is
 * also a mapping's basis, a linked policy source, and ATTACHED linked to the case as well. The
 * citations are collected by the production collector; `problems` are the evaluation by source id.
 */
function listedRows(
  problems: Record<string, ApplicabilityProblem> = {},
  extraMappings: ReadonlyArray<{ id: string; basisSourceId: string }> = [],
): ContextRows {
  const base = citedRows();
  const caseSources = [
    linkRow(LINK(1), LINK_SOURCE),
    linkRow(LINK(2), POLICY_SOURCE, 'SYNTHETIC_POLICY'),
    linkRow(LINK(3), ATTACHED),
  ];
  const rows: ContextRows = {
    ...base,
    caseSources: caseSources as unknown as ContextRows['caseSources'],
    sources: [
      ...base.sources,
      sourceRow(VERSION_SOURCE, { legalSubjectIds: ['1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a'] }),
      sourceRow(EVENT_SOURCE, { legalSubjectIds: ['1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a'] }),
      sourceRow(LINK_SOURCE, null),
      { ...sourceRow(POLICY_SOURCE, null), sourceRole: 'POLICY_REFERENCE' },
    ] as unknown as ContextRows['sources'],
  };
  const citations = sourceCitations({
    ...rows,
    mappings: [{ id: MAPPING(1), basisSourceId: LINK_SOURCE }, ...extraMappings],
    versions: [
      {
        id: VERSION(1),
        primarySourceId: VERSION_SOURCE,
        additionalSourceRefs: null,
        signedDatesRaw: null,
      },
    ],
    events: [{ id: EVENT(1), sourceId: EVENT_SOURCE, coverageId: null }],
  } as unknown as CitingRows);
  return {
    ...rows,
    sourceCitations: citations,
    sourceApplicability: new Map(rows.sources.map((row) => [row.id, problems[row.id] ?? null])),
  };
}

describe('assembleContext — every listed source is checked against the case; one that does not apply is a recorded conflict, never clean support (R14-AUD-009, R14-AUD-010)', () => {
  const reply = () => scope({ authoritySelectionId: null, priorBindingIds: [] });
  const subject: ApplicabilityProblem = {
    code: 'SOURCE_SCOPE_UNRESOLVED',
    reason: 'SCOPED_TO_OTHER_SUBJECT',
  };
  const owner: ApplicabilityProblem = { code: 'CROSS_OWNER_REFERENCE', ownerId: SHARED };
  const at = (view: ContextView, sourceId: string) => {
    const index = view.context.sources.findIndex((entry) => entry.sourceId === sourceId);
    if (index >= 0) return `sources[${index}]`;
    return `policySources[${view.context.policySources.findIndex((e) => e.sourceId === sourceId)}]`;
  };
  const sourceConflicts = (view: ContextView) =>
    view.context.conflicts.filter((entry) => entry.code === SOURCE_NOT_APPLICABLE);

  it('one SOURCE_NOT_APPLICABLE per source at its manifest entry (sources or policySources), naming the reason and every record that cites it; the sources stay listed as recorded; an applicable one raises nothing', () => {
    const view = assembleContext(
      listedRows({
        [VERSION_SOURCE]: subject,
        [EVENT_SOURCE]: subject,
        [LINK_SOURCE]: owner,
        [POLICY_SOURCE]: owner,
      }),
      reply(),
    ).view;
    const byPath = new Map(sourceConflicts(view).map((entry) => [entry.fieldPath, entry]));
    expect(sourceConflicts(view)).toHaveLength(4);
    expect(byPath.get(at(view, VERSION_SOURCE))?.message).toBe(
      `Recorded source ${VERSION_SOURCE} is not applicable to the current Case scope (SOURCE_SCOPE_UNRESOLVED: SCOPED_TO_OTHER_SUBJECT). This context cites it as the primary source of mandate version ${VERSION(1)}. ${NOT_A_FINDING}`,
    );
    expect(byPath.get(at(view, EVENT_SOURCE))?.message).toBe(
      `Recorded source ${EVENT_SOURCE} is not applicable to the current Case scope (SOURCE_SCOPE_UNRESOLVED: SCOPED_TO_OTHER_SUBJECT). This context cites it as the source of whole-mandate authority event ${EVENT(1)}. ${NOT_A_FINDING}`,
    );
    expect(byPath.get(at(view, LINK_SOURCE))?.message).toBe(
      `Recorded source ${LINK_SOURCE} is not applicable to the current Case scope (CROSS_OWNER_REFERENCE). This context cites it as case source link ${LINK(1)} (SYNTHETIC_SUPPORT); the basis source of use mapping ${MAPPING(1)}. ${NOT_A_FINDING}`,
    );
    expect(at(view, POLICY_SOURCE)).toBe('policySources[0]');
    expect(byPath.get('policySources[0]')?.message).toBe(
      `Recorded source ${POLICY_SOURCE} is not applicable to the current Case scope (CROSS_OWNER_REFERENCE). This context cites it as case source link ${LINK(2)} (SYNTHETIC_POLICY). ${NOT_A_FINDING}`,
    );
    expect(SOURCE_NOT_APPLICABLE).toBe('SOURCE_NOT_APPLICABLE');
    // Traceability: every source stays listed exactly once, and in the closure.
    const listed = [...view.context.sources, ...view.context.policySources].map((e) => e.sourceId);
    expect(listed.sort()).toEqual(
      [RAW, ATTACHED, VERSION_SOURCE, EVENT_SOURCE, LINK_SOURCE, POLICY_SOURCE].sort(),
    );
    // No other owner's id, no verdict wording.
    expect(JSON.stringify(view.context.conflicts)).not.toContain(SHARED);
    expect(JSON.stringify(view.context.conflicts)).not.toMatch(
      /invalid|unauthori[sz]ed|no authority|infring|G[1-7]\b|verified|approved|current authority|valid authority|failed/i,
    );
    expect(ContextViewSchema.safeParse(view).success).toBe(true);
    const clean = assembleContext(listedRows(), reply()).view;
    expect(clean.context.conflicts).toEqual([]);
    expect(clean.context.sources).toEqual(view.context.sources);
    expect(clean.context.policySources).toEqual(view.context.policySources);
  });

  it('a source a captured message cites that another record cites too: the message’s citation keeps its CORRESPONDENCE_SOURCE_NOT_APPLICABLE (R14-AUD-001 wording), the other record is named once in SOURCE_NOT_APPLICABLE — no citation is reported twice', () => {
    const view = assembleContext(listedRows({ [ATTACHED]: owner }), reply()).view;
    expect(view.context.conflicts).toEqual([
      {
        code: 'SOURCE_NOT_APPLICABLE',
        message: `Recorded source ${ATTACHED} is not applicable to the current Case scope (CROSS_OWNER_REFERENCE). This context cites it as case source link ${LINK(3)} (SYNTHETIC_SUPPORT). ${NOT_A_FINDING}`,
        fieldPath: at(view, ATTACHED),
      },
      {
        code: 'CORRESPONDENCE_SOURCE_NOT_APPLICABLE',
        message: `Recorded source ${ATTACHED}, the source of attachment observation 1 of captured message ${MESSAGE}, is not applicable to the current Case scope (CROSS_OWNER_REFERENCE). The capture was checked against its agency only. The message and the source are kept as recorded; this is a source-scope condition, not a finding about what the source shows.`,
        fieldPath: 'correspondence[0].attachmentsManifest[1].sourceId',
      },
    ]);
    // A source only a message cites has no SOURCE_NOT_APPLICABLE (R14-AUD-001 exactly).
    const raw = assembleContext(listedRows({ [RAW]: subject }), reply()).view;
    expect(raw.context.conflicts.map((entry) => [entry.code, entry.fieldPath])).toEqual([
      ['CORRESPONDENCE_SOURCE_NOT_APPLICABLE', 'correspondence[0].rawSourceId'],
    ]);
  });

  it('one source cited hundreds of times is one conflict: at most 20 citations named, in a fixed order whatever the read order, the rest counted — within the contract', () => {
    const mappings = Array.from({ length: 25 }, (_, index) => ({
      id: MAPPING(100 + index),
      basisSourceId: LINK_SOURCE,
    }));
    const rows = listedRows({ [LINK_SOURCE]: owner }, mappings);
    const view = assembleContext(rows, reply()).view;
    const conflicts = sourceConflicts(view);
    expect(conflicts).toHaveLength(1);
    const message = conflicts[0]?.message ?? '';
    expect(NAMED_CITATIONS_MAXIMUM).toBe(20);
    expect(message).toContain(`case source link ${LINK(1)} (SYNTHETIC_SUPPORT); `);
    expect(message.match(/the basis source of use mapping /g)).toHaveLength(19);
    expect(message).toContain('; and 7 more citations.');
    expect(message).toContain(`the basis source of use mapping ${MAPPING(1)}`);
    expect(message).not.toContain(MAPPING(124));
    expect(ContextViewSchema.safeParse(view).success).toBe(true);
    const reversed = assembleContext(
      {
        ...rows,
        sourceCitations: [...rows.sourceCitations].reverse(),
        sources: [...rows.sources].reverse(),
      },
      reply(),
    ).view;
    expect(reversed.context.conflicts).toEqual(view.context.conflicts);
    expect(reversed.dependencyDigest).toBe(view.dependencyDigest);
  });

  it('a listed source the snapshot did not evaluate is an internal error, never listed as clean', () => {
    const rows = listedRows();
    const missing = new Map(rows.sourceApplicability);
    missing.delete(VERSION_SOURCE);
    expect(thrown(() => assembleContext({ ...rows, sourceApplicability: missing }, reply()))).toBe(
      'a listed source was not evaluated against the case',
    );
  });
});

describe('dependenciesOf — another owner’s use of ANY listed source is part of its fingerprint; recorded-scope reasons follow from the closure (R14-AUD-010)', () => {
  const reply = () => scope({ authoritySelectionId: null, priorBindingIds: [] });
  const owner: ApplicabilityProblem = { code: 'CROSS_OWNER_REFERENCE', ownerId: SHARED };
  const changedSources = (after: ContextView, before: ContextView) =>
    after.dependencies
      .filter((d, index) => d.fingerprint !== before.dependencies[index]?.fingerprint)
      .map((d) => `${d.entityType}:${d.entityId}`);

  it('for a source cited only by a mandate version, a whole-mandate event, a case source link and mapping, a policy link or a message: another owner’s use changes exactly that source’s fingerprint and the digest — the case, its revision and the source row unchanged', () => {
    const clean = assembleContext(listedRows(), reply()).view;
    for (const sourceId of [VERSION_SOURCE, EVENT_SOURCE, LINK_SOURCE, POLICY_SOURCE, RAW]) {
      const drifted = assembleContext(listedRows({ [sourceId]: owner }), reply()).view;
      expect(drifted.dependencyDigest, sourceId).not.toBe(clean.dependencyDigest);
      expect(changedSources(drifted, clean), sourceId).toEqual([`SourceReference:${sourceId}`]);
      expect(drifted.contextRevision, sourceId).toBe(clean.contextRevision);
    }
  });

  it('a recorded-scope reason changes no fingerprint: it follows from records in the closure (the source’s agency and scope bindings, the case, its route and association)', () => {
    const clean = assembleContext(listedRows(), reply()).view;
    const subject = assembleContext(
      listedRows({
        [VERSION_SOURCE]: { code: 'SOURCE_SCOPE_UNRESOLVED', reason: 'SCOPED_TO_OTHER_SUBJECT' },
      }),
      reply(),
    ).view;
    expect(subject.dependencies).toEqual(clean.dependencies);
    expect(subject.dependencyDigest).toBe(clean.dependencyDigest);
    expect(subject.context.conflicts).not.toEqual(clean.context.conflicts);
  });

  it('R14-AUD-013: the same rows under a definition that did not evaluate these citations (no conflict) and under the current one (SOURCE_NOT_APPLICABLE) have the same closure and fingerprints — only the digest definition identifier tells the two contexts apart: the v1 digest of this closure is never the current digest', () => {
    const identifiers = { contract: CONTRACT_BASELINE, schemaVersion: PFC_SCHEMA_VERSION };
    // What a deployment saw that never evaluated a mandate version's or a whole-mandate event's
    // source against the case: the same rows, every source clean.
    const unevaluated = assembleContext(listedRows(), reply()).view;
    const subject: ApplicabilityProblem = {
      code: 'SOURCE_SCOPE_UNRESOLVED',
      reason: 'SCOPED_TO_OTHER_SUBJECT',
    };
    const current = assembleContext(
      listedRows({ [VERSION_SOURCE]: subject, [EVENT_SOURCE]: subject }),
      reply(),
    ).view;
    const entryOf = (sourceId: string) =>
      `sources[${current.context.sources.findIndex((entry) => entry.sourceId === sourceId)}]`;
    expect(unevaluated.context.conflicts).toEqual([]);
    expect(
      current.context.conflicts
        .filter((entry) => entry.code === SOURCE_NOT_APPLICABLE)
        .map((entry) => entry.fieldPath)
        .sort(),
    ).toEqual([entryOf(VERSION_SOURCE), entryOf(EVENT_SOURCE)].sort());
    // Nothing persisted differs: the same revision, closure and fingerprints.
    expect(current.contextRevision).toBe(unevaluated.contextRevision);
    expect(current.dependencies).toEqual(unevaluated.dependencies);
    // Under v1 both contexts had one digest; v2 names the current semantics.
    const v1 = legacyV1Digest(identifiers, reply(), current.dependencies);
    expect(legacyV1Digest(identifiers, reply(), unevaluated.dependencies)).toBe(v1);
    expect(current.dependencyDigest).toBe(
      currentV2Digest(identifiers, reply(), current.dependencies),
    );
    expect(current.dependencyDigest).not.toBe(v1);
  });

  it('the fingerprint does not depend on the read order or on how often a source is cited', () => {
    const rows = listedRows({ [LINK_SOURCE]: owner });
    const view = assembleContext(rows, reply()).view;
    const twice = listedRows({ [LINK_SOURCE]: owner }, [
      { id: MAPPING(2), basisSourceId: LINK_SOURCE },
    ]);
    const cited = assembleContext(twice, reply()).view;
    expect(cited.dependencies).toEqual(view.dependencies);
    const reordered = assembleContext(
      {
        ...rows,
        sources: [...rows.sources].reverse(),
        sourceCitations: [...rows.sourceCitations].reverse(),
        sourceApplicability: new Map([...rows.sourceApplicability].reverse()),
      },
      reply(),
    ).view;
    expect(reordered.dependencyDigest).toBe(view.dependencyDigest);
  });
});

describe('exceededLimit — every contracted array bound, never a cut', () => {
  const base = (): ContextView =>
    assembleContext(
      bareRows(),
      scope({ authoritySelectionId: null, parentBindingId: null, priorBindingIds: [] }),
    ).view;
  // Entries are placeholders (only lengths are checked); a coverage block keeps its two lists.
  const filled = (count: number) => Array.from({ length: count }, () => ({}));
  const block = () => ({ signerScopes: [], authorityEvents: [] });
  const cases: Array<[string, number, (view: ContextView, list: unknown[]) => ContextView]> = [
    [
      'dependencies',
      1000,
      (view, list) => ({ ...view, dependencies: list as ContextView['dependencies'] }),
    ],
    ...(
      [
        ['reportedItems', 100],
        ['works', 100],
        ['mappings', 1000],
        ['facts', 1000],
        ['sources', 1000],
        ['priorCorrespondenceIds', 100],
        ['missing', 1000],
        ['conflicts', 1000],
        ['correspondence', 100],
        ['policySources', 100],
      ] as const
    ).map(
      ([field, maximum]): [string, number, (view: ContextView, list: unknown[]) => ContextView] => [
        field,
        maximum,
        (view, list) => ({ ...view, context: { ...view.context, [field]: list } }) as ContextView,
      ],
    ),
    [
      'authority.coverages',
      20,
      (view, list) =>
        ({
          ...view,
          context: {
            ...view.context,
            authority: { selection: {}, coverages: list.map(() => block()) },
          },
        }) as unknown as ContextView,
    ],
    [
      'authority.coverages.signerScopes',
      1000,
      (view, list) =>
        ({
          ...view,
          context: {
            ...view.context,
            authority: {
              selection: {},
              coverages: [
                { signerScopes: [], authorityEvents: [] },
                { signerScopes: list, authorityEvents: [] },
              ],
            },
          },
        }) as unknown as ContextView,
    ],
    [
      'authority.coverages.authorityEvents',
      1000,
      (view, list) =>
        ({
          ...view,
          context: {
            ...view.context,
            authority: { selection: {}, coverages: [{ signerScopes: [], authorityEvents: list }] },
          },
        }) as unknown as ContextView,
    ],
  ];

  it('accepts each array at its bound and names the first one exceeded, with its count and maximum', () => {
    expect(exceededLimit(base())).toBeNull();
    for (const [field, maximum, apply] of cases) {
      expect(exceededLimit(apply(base(), filled(maximum))), field).toBeNull();
      expect(exceededLimit(apply(base(), filled(maximum + 1))), field).toEqual({
        field,
        count: maximum + 1,
        maximum,
      });
    }
  });
});

describe('request scope — explicit selectors only, each once, and only where the task has them', () => {
  // The operation as the API sees it (the same contract instance the query lowering is keyed by).
  const query = contractOperation('getProductionContext');

  it('parses the contracted query: required task and mode, enum values, UUID selectors, priors as a list (one value or repeated), at most 100, nothing undeclared', () => {
    expect(parseQuery(query, { taskType: 'INITIAL', generationMode: 'PREPARATION' })).toEqual({
      taskType: 'INITIAL',
      generationMode: 'PREPARATION',
    });
    expect(
      parseQuery(query, {
        taskType: 'NMI_REPLY',
        generationMode: 'DRAFTING',
        parentBindingId: PARENT,
        priorBindingIds: PRIOR_A,
      }),
    ).toEqual({
      taskType: 'NMI_REPLY',
      generationMode: 'DRAFTING',
      parentBindingId: PARENT,
      priorBindingIds: [PRIOR_A],
    });
    expect(
      parseQuery(query, {
        taskType: 'NMI_REPLY',
        generationMode: 'DRAFTING',
        priorBindingIds: [PRIOR_B, PRIOR_A],
      })['priorBindingIds'],
    ).toEqual([PRIOR_B, PRIOR_A]);
    const hundredOne = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    );
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ generationMode: 'PREPARATION' }, 'taskType'],
      [{ taskType: 'INITIAL' }, 'generationMode'],
      [{ taskType: 'initial', generationMode: 'PREPARATION' }, 'taskType'],
      [{ taskType: 'INITIAL', generationMode: 'READY' }, 'generationMode'],
      [{ taskType: ['INITIAL', 'NMI_REPLY'], generationMode: 'PREPARATION' }, 'taskType'],
      [
        { taskType: 'INITIAL', generationMode: 'PREPARATION', authoritySelectionId: 'latest' },
        'authoritySelectionId',
      ],
      [
        { taskType: 'NMI_REPLY', generationMode: 'PREPARATION', parentBindingId: 'x' },
        'parentBindingId',
      ],
      [
        { taskType: 'NMI_REPLY', generationMode: 'PREPARATION', priorBindingIds: ['x'] },
        'priorBindingIds',
      ],
      [
        { taskType: 'NMI_REPLY', generationMode: 'PREPARATION', priorBindingIds: hundredOne },
        'priorBindingIds',
      ],
      [
        { taskType: 'NMI_REPLY', generationMode: 'PREPARATION', priorBindingIds: { 0: PRIOR_A } },
        'priorBindingIds',
      ],
      [{ taskType: 'INITIAL', generationMode: 'PREPARATION', caseId: CASE }, 'caseId'],
      [{ taskType: 'INITIAL', generationMode: 'PREPARATION', latest: 'true' }, 'latest'],
    ];
    for (const [raw, parameter] of bad) {
      expect(
        refusal(() => parseQuery(query, raw)),
        JSON.stringify(raw),
      ).toEqual([400, 'INVALID_QUERY_PARAMETER', { parameter }]);
    }
  });

  it('keeps the selectors exactly as named: a prior named twice is 400, INITIAL refuses a parent or priors (422 SELECTOR_NOT_FOR_TASK) rather than ignoring them, absent selectors stay null', () => {
    expect(contextScope(CASE, { taskType: 'INITIAL', generationMode: 'PREPARATION' })).toEqual({
      caseId: CASE,
      taskType: 'INITIAL',
      generationMode: 'PREPARATION',
      authoritySelectionId: null,
      parentBindingId: null,
      priorBindingIds: [],
    });
    expect(
      contextScope(CASE, {
        taskType: 'NMI_REPLY',
        generationMode: 'DRAFTING',
        authoritySelectionId: SELECTION,
        parentBindingId: PARENT,
        priorBindingIds: [PRIOR_B, PRIOR_A],
      }),
    ).toEqual(scope({ generationMode: 'DRAFTING', priorBindingIds: [PRIOR_B, PRIOR_A] }));
    expect(
      refusal(() =>
        contextScope(CASE, {
          taskType: 'NMI_REPLY',
          generationMode: 'PREPARATION',
          priorBindingIds: [PRIOR_A, PRIOR_A],
        }),
      ),
    ).toEqual([400, 'INVALID_QUERY_PARAMETER', { parameter: 'priorBindingIds' }]);
    expect(
      refusal(() =>
        contextScope(CASE, {
          taskType: 'INITIAL',
          generationMode: 'PREPARATION',
          parentBindingId: PARENT,
        }),
      ),
    ).toEqual([422, 'SELECTOR_NOT_FOR_TASK', { field: 'parentBindingId', taskType: 'INITIAL' }]);
    expect(
      refusal(() =>
        contextScope(CASE, {
          taskType: 'INITIAL',
          generationMode: 'DRAFTING',
          priorBindingIds: [PRIOR_A],
        }),
      ),
    ).toEqual([422, 'SELECTOR_NOT_FOR_TASK', { field: 'priorBindingIds', taskType: 'INITIAL' }]);
  });
});

describe('module source — a read and nothing else', () => {
  const files = readdirSync(PRODUCTION_MODULE).filter((name) => name.endsWith('.ts'));
  const source = (name: string) => readFileSync(path.join(PRODUCTION_MODULE, name), 'utf8');
  /** The code of a file without its comments (the comments name what the code must not do). */
  const code = (name: string) =>
    source(name)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('the production module issues no write, lock, raw SQL, audit or idempotency call, reads no clock and opens no network, mail, Drive or process client', () => {
    expect(files.sort()).toEqual([
      'context-assembly.ts',
      'context-dependencies.ts',
      'context-read-observer.ts',
      'context-scope.ts',
      'context-snapshot.ts',
      'context-sources.ts',
      'production-context.controller.ts',
      'production-context.service.ts',
      'production.module.ts',
    ]);
    const forbidden: Array<[string, RegExp]> = [
      ['write', /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/],
      ['raw SQL', /\$(executeRaw|queryRaw)/],
      ['lock', /FOR UPDATE|FOR SHARE|LOCK IN SHARE MODE/i],
      ['write layer', /WriteExecutor|AuditWriter|idempotenc|auditEvent/i],
      ['clock', /Date\.now|new Date\(|CLOCK\b/],
      ['network', /\bfetch\(|node:http|node:https|node:net|axios|undici|XMLHttpRequest/],
      ['mail or Drive', /nodemailer|smtp|imap|gmail|googleapis|drive\.google/i],
      ['process', /child_process|spawn\(|exec\(/],
      ['randomness', /randomUUID|Math\.random|randomBytes/],
    ];
    for (const name of files) {
      const text = code(name);
      for (const [label, pattern] of forbidden) {
        expect(pattern.test(text), `${name}: ${label}`).toBe(false);
      }
    }
  });

  it('the service reads in one REPEATABLE READ transaction and the controller routes exactly one GET', () => {
    const service = source('production-context.service.ts');
    expect(service).toMatch(/TransactionIsolationLevel\.RepeatableRead/);
    expect(service.match(/\$transaction\(/g)).toHaveLength(1);
    const controller = source('production-context.controller.ts');
    expect(controller.match(/@(Get|Post|Put|Patch|Delete)\(/g)).toEqual(['@Get(']);
  });
});
