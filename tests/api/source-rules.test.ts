// P3A pure source rules: which recorded scope applies to which record (source-scope.ts), and the
// capture / revision checks of a SourceReference (source-rules.ts). Database behaviour of the same
// rules is covered over HTTP in tests/db/p3a-http.test.ts.
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

const agency: SourceTarget = { kind: 'Agency', agencyId: A };
const route: SourceTarget = { kind: 'Route', agencyId: A, ownerId: X, legalSubjectId: L };
const subject: SourceTarget = { kind: 'LegalSubject', legalSubjectId: L };
const owner: SourceTarget = { kind: 'Owner', ownerId: X };
const association: SourceTarget = { kind: 'OwnerSubject', ownerId: X, legalSubjectId: L };

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
    // no case scope before the Case phase — for every target
    ['case-scoped → Agency', source(A, { caseIds: [M] }), agency, 'CASE_SCOPED_SOURCE'],
    ['case-scoped → Owner', source(null, { caseIds: [M] }), owner, 'CASE_SCOPED_SOURCE'],
    [
      'case-scoped → LegalSubject',
      source(null, { caseIds: [M], legalSubjectIds: [L] }),
      subject,
      'CASE_SCOPED_SOURCE',
    ],
  ];
  for (const [label, candidate, target, expected] of cases) {
    it(label, () => {
      const problem = scopeProblem(candidate, target);
      const actual =
        problem === null
          ? null
          : problem.code === 'CROSS_AGENCY_REFERENCE'
            ? problem.code
            : problem.reason;
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
  });

  it.each([
    [{ scopeBindings: { caseIds: [A] } }, 'CASE_SCOPE_UNAVAILABLE', 'scopeBindings.caseIds'],
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
