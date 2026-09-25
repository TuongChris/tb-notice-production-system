// Production-context rules (P4D) that need no database: TB canonical JSON v1 parity with the frozen
// reference helper, the dependency digest (scope, order, row versions, identifiers), the assembly of
// a bare case (gaps listed, nothing filled in, row versions outside the digest), the contracted
// bounds, the request scope rules, the query parsing of array and required parameters, and the
// module's source: plain reads only — no write, lock, clock, network or process call. Database
// behaviour is covered over HTTP in tests/db/p4d-http.test.ts.
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
  DRAFTING_BLOCKING_CODES,
  exceededLimit,
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
    expect(DEPENDENCY_DIGEST_ALGORITHM).toBe('TB-PRODUCTION-CONTEXT-DIGEST-v1');
    expect(CONTRACT_BASELINE).toBe('TB-SCHEMA-API-v1.2.0');
    expect(PFC_SCHEMA_VERSION).toBe('PFC-YT-EMAIL-v1.1');
    expect(dependencyDigest(scope(), DEPENDENCIES)).toBe(
      tbCanonicalSha256({
        algorithm: 'TB-PRODUCTION-CONTEXT-DIGEST-v1',
        contract: 'TB-SCHEMA-API-v1.2.0',
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
