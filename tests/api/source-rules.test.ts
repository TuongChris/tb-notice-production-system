// P3A pure source rules: which recorded scope applies to which record (source-scope.ts, with the
// case dimension of P4A), and the capture / revision checks of a SourceReference (source-rules.ts).
// Database behaviour of the same rules is covered over HTTP in tests/db/p3a-http.test.ts and
// tests/db/p4a-http.test.ts.
import { describe, expect, it } from 'vitest';
import type { CreateSource } from '../../packages/contracts/src/index.js';
import {
  captureProblem,
  sameScopeBindings,
  sourceAuditRecord,
} from '../../apps/api/src/modules/sources/source-rules.js';
import {
  scopeBindingsOf,
  scopeProblem,
  type SourceTarget,
} from '../../apps/api/src/modules/sources/source-scope.js';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const L = '00000000-0000-4000-8000-0000000000c1';
const M = '00000000-0000-4000-8000-0000000000c2';
const X = '00000000-0000-4000-8000-0000000000d1';
const C1 = '00000000-0000-4000-8000-0000000000e1';
const C2 = '00000000-0000-4000-8000-0000000000e2';

const agency: SourceTarget = { kind: 'Agency', agencyId: A };
const route: SourceTarget = { kind: 'Route', agencyId: A, ownerId: X, legalSubjectId: L };
const subject: SourceTarget = { kind: 'LegalSubject', legalSubjectId: L };
const owner: SourceTarget = { kind: 'Owner', ownerId: X };
const association: SourceTarget = { kind: 'OwnerSubject', ownerId: X, legalSubjectId: L };
const unboundCase: SourceTarget = { kind: 'Case', caseId: C1, agencyId: A, route: null };
const boundCase: SourceTarget = {
  kind: 'Case',
  caseId: C1,
  agencyId: A,
  route: { ownerId: X, legalSubjectId: L },
};

const source = (agencyId: string | null, scopeBindings: unknown = null) => ({
  agencyId,
  scopeBindings: scopeBindings as never,
});

describe('scopeProblem — the recorded-scope applicability matrix', () => {
  const cases: Array<[string, ReturnType<typeof source>, SourceTarget, string | null]> = [
    // agency-scoped targets
    ['own agency source → Agency', source(A), agency, null],
    ['own agency source → Route', source(A), route, null],
    ['other agency source → Agency', source(B), agency, 'CROSS_AGENCY_REFERENCE'],
    ['other agency source → Route', source(B), route, 'CROSS_AGENCY_REFERENCE'],
    ['unscoped public source → Agency', source(null), agency, 'NOT_SCOPED_TO_AGENCY'],
    ['shared with A → Agency A', source(null, { agencyIds: [A] }), agency, null],
    ['shared with B → Agency A', source(null, { agencyIds: [B] }), agency, 'NOT_SCOPED_TO_AGENCY'],
    [
      'agency source scoped to L → Agency (no subject restriction)',
      source(A, { legalSubjectIds: [L] }),
      agency,
      null,
    ],
    ['agency source scoped to L → Route with L', source(A, { legalSubjectIds: [L] }), route, null],
    [
      'agency source scoped to M → Route with L',
      source(A, { legalSubjectIds: [M] }),
      route,
      'SCOPED_TO_OTHER_SUBJECT',
    ],
    // shared records without an agency
    ['scoped to L → LegalSubject L', source(null, { legalSubjectIds: [L] }), subject, null],
    [
      'scoped to M → LegalSubject L',
      source(null, { legalSubjectIds: [M] }),
      subject,
      'NOT_SCOPED_TO_SUBJECT',
    ],
    ['unscoped → LegalSubject', source(null), subject, 'NOT_SCOPED_TO_SUBJECT'],
    [
      'agency source scoped to L → LegalSubject',
      source(A, { legalSubjectIds: [L] }),
      subject,
      'AGENCY_OWNED_SOURCE',
    ],
    [
      'agency-restricted, scoped to L → LegalSubject',
      source(null, { legalSubjectIds: [L], agencyIds: [A] }),
      subject,
      'AGENCY_RESTRICTED_SOURCE',
    ],
    ['public → Owner', source(null), owner, null],
    ['agency source → Owner', source(A), owner, 'AGENCY_OWNED_SOURCE'],
    ['shared with A → Owner', source(null, { agencyIds: [A] }), owner, 'AGENCY_RESTRICTED_SOURCE'],
    [
      'scoped to L → Owner',
      source(null, { legalSubjectIds: [L] }),
      owner,
      'SUBJECT_SPECIFIC_SOURCE',
    ],
    ['public → OwnerSubject', source(null), association, null],
    [
      'scoped to L → OwnerSubject with L',
      source(null, { legalSubjectIds: [L] }),
      association,
      null,
    ],
    [
      'scoped to M → OwnerSubject with L',
      source(null, { legalSubjectIds: [M] }),
      association,
      'SCOPED_TO_OTHER_SUBJECT',
    ],
    ['agency source → OwnerSubject', source(A), association, 'AGENCY_OWNED_SOURCE'],
    // a case-scoped source supports only the cases it names — no directory, route or authority
    // record (P4A)
    ['case-scoped → Agency', source(A, { caseIds: [C1] }), agency, 'CASE_SCOPED_SOURCE'],
    ['case-scoped → Route', source(A, { caseIds: [C1] }), route, 'CASE_SCOPED_SOURCE'],
    ['case-scoped → Owner', source(null, { caseIds: [C1] }), owner, 'CASE_SCOPED_SOURCE'],
    [
      'case-scoped → LegalSubject',
      source(null, { caseIds: [C1], legalSubjectIds: [L] }),
      subject,
      'CASE_SCOPED_SOURCE',
    ],
    // case targets (P4A): the case, agency and subject dimensions
    ['own agency source → Case', source(A), unboundCase, null],
    ['other agency source → Case', source(B), unboundCase, 'CROSS_AGENCY_REFERENCE'],
    ['unscoped public source → Case', source(null), unboundCase, 'NOT_SCOPED_TO_AGENCY'],
    ['shared with A → Case of A', source(null, { agencyIds: [A] }), unboundCase, null],
    [
      'shared with B → Case of A',
      source(null, { agencyIds: [B] }),
      unboundCase,
      'NOT_SCOPED_TO_AGENCY',
    ],
    ['agency-less, scoped to this case → Case', source(null, { caseIds: [C1] }), unboundCase, null],
    ['own agency, scoped to this case → Case', source(A, { caseIds: [C1] }), unboundCase, null],
    [
      'this case, restricted to agency A → Case of A',
      source(null, { caseIds: [C1], agencyIds: [A] }),
      unboundCase,
      null,
    ],
    [
      'this case, restricted to agency B → Case of A',
      source(null, { caseIds: [C1], agencyIds: [B] }),
      unboundCase,
      'NOT_SCOPED_TO_AGENCY',
    ],
    [
      'scoped to another case → Case',
      source(null, { caseIds: [C2] }),
      unboundCase,
      'CROSS_CASE_REFERENCE',
    ],
    [
      'own agency, scoped to another case → Case',
      source(A, { caseIds: [C2] }),
      unboundCase,
      'CROSS_CASE_REFERENCE',
    ],
    [
      'other agency, naming this case → Case',
      source(B, { caseIds: [C1] }),
      unboundCase,
      'CROSS_AGENCY_REFERENCE',
    ],
    [
      'subject-scoped → Case without a route',
      source(A, { legalSubjectIds: [L] }),
      unboundCase,
      'CASE_SUBJECT_UNBOUND',
    ],
    ['subject L → Case bound to L', source(A, { legalSubjectIds: [L] }), boundCase, null],
    [
      'subject M → Case bound to L',
      source(A, { legalSubjectIds: [M] }),
      boundCase,
      'SCOPED_TO_OTHER_SUBJECT',
    ],
    [
      'this case, subject M → Case bound to L',
      source(null, { caseIds: [C1], legalSubjectIds: [M] }),
      boundCase,
      'SCOPED_TO_OTHER_SUBJECT',
    ],
    ['own agency source → Case bound to a route', source(A), boundCase, null],
  ];
  for (const [label, candidate, target, expected] of cases) {
    it(label, () => {
      const problem = scopeProblem(candidate, target);
      const actual = problem === null ? null : 'reason' in problem ? problem.reason : problem.code;
      expect(actual).toBe(expected);
    });
  }

  it('reads the stored scope object tolerantly (missing lists are empty)', () => {
    expect(scopeBindingsOf(null)).toEqual({
      caseIds: [],
      legalSubjectIds: [],
      agencyIds: [],
      limitation: null,
    });
    expect(scopeBindingsOf({ agencyIds: [A], limitation: 'x' })).toMatchObject({
      agencyIds: [A],
      legalSubjectIds: [],
      limitation: 'x',
    });
  });
});

const capture = (extra: Partial<CreateSource>): CreateSource => ({
  title: 'SYNTHETIC',
  sourceRole: 'CANONICAL_RECORD',
  scopeText: 'x',
  ...extra,
});

describe('captureProblem — request-only capture checks', () => {
  it('accepts a plain capture, a paired hash and an attributable review', () => {
    expect(captureProblem(capture({}))).toBeNull();
    expect(
      captureProblem(capture({ contentSha256: 'a'.repeat(64), hashTarget: 'RAW_FILE' })),
    ).toBeNull();
    expect(
      captureProblem(capture({ reportedProvenance: 'DOCUMENT_REVIEWED', reviewedByLabel: 'R' })),
    ).toBeNull();
    expect(captureProblem(capture({ agencyId: A, scopeBindings: { agencyIds: [A] } }))).toBeNull();
    // P4A: case scope is recorded as supplied; the named cases are checked in the database.
    expect(captureProblem(capture({ scopeBindings: { caseIds: [C1] } }))).toBeNull();
    expect(
      captureProblem(capture({ agencyId: A, scopeBindings: { caseIds: [C1, C2] } })),
    ).toBeNull();
  });

  it.each([
    [{ contentSha256: 'a'.repeat(64) }, 'CONTENT_HASH_INCOMPLETE', 'hashTarget'],
    [{ hashTarget: 'OTHER' }, 'CONTENT_HASH_INCOMPLETE', 'contentSha256'],
    [{ reportedProvenance: 'DOCUMENT_REVIEWED' }, 'REVIEW_UNATTRIBUTED', 'reviewedByLabel'],
    [
      { reportedProvenance: 'DOCUMENT_REVIEWED', reviewedByLabel: ' ' },
      'REVIEW_UNATTRIBUTED',
      'reviewedByLabel',
    ],
    [
      { agencyId: A, scopeBindings: { agencyIds: [A, B] } },
      'CROSS_AGENCY_REFERENCE',
      'scopeBindings.agencyIds.1',
    ],
  ] as const)('refuses %j', (extra, errorCode, field) => {
    const problem = captureProblem(capture(extra as Partial<CreateSource>));
    expect(problem?.code).toBe(errorCode);
    expect(problem?.details).toMatchObject({ field });
  });

  it('refuses observedAt / reviewedAt values the database cannot store exactly, first and per field', () => {
    const paths = (extra: Partial<CreateSource>) => {
      const problem = captureProblem(capture(extra));
      expect(problem?.code).toBe('VALIDATION_FAILED');
      const issues = (problem?.details['issues'] ?? []) as Array<{ path: string }>;
      return issues.map((issue) => issue.path);
    };
    expect(
      paths({ observedAt: '2016-12-31T23:59:60Z', reviewedAt: '2025-06-30T10:15:00.123456Z' }),
    ).toEqual(['observedAt', 'reviewedAt']);
    expect(paths({ observedAt: '0999-06-30T10:00:00Z' })).toEqual(['observedAt']);
    expect(paths({ reviewedAt: '9999-12-31T23:59:59.500Z' })).toEqual(['reviewedAt']);
    // A leap second written with an offset (local 15:59:60) is refused like …23:59:60Z.
    expect(paths({ reviewedAt: '2016-12-31T15:59:60-08:00' })).toEqual(['reviewedAt']);
    // Deterministic: an unstorable instant is reported before any other capture rule.
    expect(paths({ observedAt: '2016-12-31T23:59:60Z', contentSha256: 'a'.repeat(64) })).toEqual([
      'observedAt',
    ]);
    // Exactly storable values, whatever spelling the format admits, and nulls pass.
    expect(
      captureProblem(
        capture({ observedAt: '2025-06-30T15:45:00+0530', reviewedAt: '9999-12-31T23:59:59.499Z' }),
      ),
    ).toBeNull();
    expect(captureProblem(capture({ observedAt: null, reviewedAt: null }))).toBeNull();
  });
});

describe('sameScopeBindings — a revision keeps its scope', () => {
  it('compares id lists as sets and the limitation exactly; null equals an empty scope', () => {
    expect(sameScopeBindings({ agencyIds: [A, B] }, { agencyIds: [B, A] })).toBe(true);
    expect(sameScopeBindings(null, {})).toBe(true);
    expect(sameScopeBindings({ agencyIds: [A] }, { agencyIds: [A, B] })).toBe(false);
    expect(sameScopeBindings({ legalSubjectIds: [L] }, { legalSubjectIds: [M] })).toBe(false);
    expect(sameScopeBindings({ limitation: 'a' }, { limitation: 'b' })).toBe(false);
    expect(sameScopeBindings({ limitation: 'a' }, null)).toBe(false);
  });
});

describe('sourceAuditRecord — metadata, never copied source text', () => {
  it('redacts scope text, excerpt, limitations and the scope limitation; keeps the digest under guard-safe keys', () => {
    const record = sourceAuditRecord({
      id: A,
      agencyId: null,
      sourceGroupId: B,
      revision: 1,
      supersedesSourceId: null,
      title: 'SYNTHETIC title',
      canonicalUrl: null,
      providerFileId: null,
      providerRevisionId: null,
      sourceRole: 'CANONICAL_RECORD',
      accessState: 'NOT_CHECKED',
      contentSha256: 'f'.repeat(64),
      hashTarget: 'RAW_FILE',
      reportedProvenance: 'OPERATOR_REPORTED',
      rawProvenance: null,
      scopeText: 'secret-ish scope',
      scopeBindings: { limitation: 'limit text', agencyIds: [A] },
      observedAt: null,
      reviewedByLabel: null,
      reviewedAt: null,
      excerpt: 'quoted words',
      excerptLocator: 'p. 2',
      limitations: 'limits',
      createdAt: new Date('2026-09-24T00:00:00Z'),
      createdById: A,
    });
    expect(record).toMatchObject({
      scopeText: { redacted: true, codePoints: 16 },
      excerpt: { redacted: true, codePoints: 12 },
      limitations: { redacted: true, codePoints: 6 },
      contentDigest: { sha256: 'f'.repeat(64), target: 'RAW_FILE' },
      scopeBindings: { agencyIds: [A], limitation: { redacted: true, codePoints: 10 } },
    });
    const keys = JSON.stringify(record).match(/"[A-Za-z0-9]+":/g) ?? [];
    expect(keys.filter((key) => /password|token|secret|csrf|hash|cookie/i.test(key))).toEqual([]);
    for (const text of ['secret-ish scope', 'quoted words', 'limit text']) {
      expect(JSON.stringify(record)).not.toContain(text);
    }
  });
});
