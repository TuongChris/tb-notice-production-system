// P3B pure authority rules (authority-rules.ts): date order and storability, the claims a version may
// make about its documents, the sources a version cites, and the redacted audit values. Database
// behaviour of the same rules is covered over HTTP in tests/db/p3b-http.test.ts.
import { describe, expect, it } from 'vitest';
import { Prisma } from '../../apps/api/generated/prisma/client.js';
import {
  authorityAuditFields,
  authorityAuditValue,
  authorityWriteData,
  dateRangeProblem,
  eventReviewProblem,
  storabilityProblem,
  toDbDate,
  versionReviewProblem,
  versionSourceUses,
  versionTermsProblem,
  type VersionTerms,
} from '../../apps/api/src/modules/representation/authority-rules.js';

const S1 = '00000000-0000-4000-8000-0000000000a1';
const S2 = '00000000-0000-4000-8000-0000000000a2';
const S3 = '00000000-0000-4000-8000-0000000000a3';

const terms = (overrides: Partial<VersionTerms> = {}): VersionTerms => ({
  primarySourceId: null,
  additionalSourceRefs: null,
  signedDatesRaw: null,
  documentState: 'UNKNOWN',
  sourceReviewState: 'UNREVIEWED',
  effectiveOn: null,
  expiresOn: null,
  ...overrides,
});

const codeOf = (problem: { code: string } | null) => problem?.code ?? null;

describe('dateRangeProblem — only a known start after a known end is refused', () => {
  it.each([
    [null, null, null],
    ['2026-01-01', null, null],
    [null, '2026-01-01', null],
    ['2026-01-01', '2026-01-01', null],
    ['2025-12-31', '2026-01-01', null],
    ['2026-01-02', '2026-01-01', 'DATE_RANGE_INVALID'],
    ['1000-01-01', '9999-12-31', null],
  ])('%s → %s', (start, end, expected) => {
    expect(codeOf(dateRangeProblem('effectiveOn', start, 'expiresOn', end))).toBe(expected);
  });

  it('names both fields and carries the record id it was given', () => {
    expect(
      dateRangeProblem('effectiveOn', '2026-02-01', 'endsOn', '2026-01-01', {
        coverageSignerId: S1,
      })?.details,
    ).toEqual({ fields: ['effectiveOn', 'endsOn'], coverageSignerId: S1 });
  });
});

describe('storabilityProblem — values the database cannot store exactly are refused, never altered', () => {
  it.each([
    [{ effectiveOn: '1000-01-01' }, null],
    [{ effectiveOn: '9999-12-31' }, null],
    [{ effectiveOn: '0999-12-31' }, 'VALIDATION_FAILED'],
    [{ effectiveOn: null }, null],
    [{}, null],
  ])('date %j → %s', (body, expected) => {
    expect(codeOf(storabilityProblem(body, ['effectiveOn']))).toBe(expected);
  });

  it.each([
    ['2025-06-30T10:15:00Z', null],
    ['2025-06-30T10:15:00.123Z', null],
    ['2025-06-30T17:15:00.123+07:00', null],
    ['2025-06-30T10:15:00.1234Z', 'VALIDATION_FAILED'],
    ['2016-12-31T23:59:60Z', 'VALIDATION_FAILED'],
    ['0999-12-31T23:59:59Z', 'VALIDATION_FAILED'],
    ['9999-12-31T23:59:59.000-01:00', 'VALIDATION_FAILED'],
  ])('instant %s → %s', (effectiveAt, expected) => {
    expect(codeOf(storabilityProblem({ effectiveAt }, [], ['effectiveAt']))).toBe(expected);
  });

  it('reports every unstorable field', () => {
    const problem = storabilityProblem(
      { effectiveOn: '0001-01-01', effectiveAt: '2016-12-31T23:59:60Z' },
      ['effectiveOn'],
      ['effectiveAt'],
    );
    const issues = (problem?.details['issues'] ?? []) as Array<{ path: string }>;
    expect(issues.map((issue) => issue.path)).toEqual(['effectiveOn', 'effectiveAt']);
  });
});

describe('version terms — claims need their support; unknown stays unknown', () => {
  it.each([
    [terms(), null],
    [terms({ documentState: 'MISSING' }), null],
    [terms({ documentState: 'DRAFT' }), 'DOCUMENT_STATE_UNSUPPORTED'],
    [terms({ documentState: 'SIGNED_APPEARING' }), 'DOCUMENT_STATE_UNSUPPORTED'],
    [terms({ documentState: 'SIGNED_APPEARING', primarySourceId: S1 }), null],
    [terms({ effectiveOn: '2026-02-01', expiresOn: '2026-01-01' }), 'DATE_RANGE_INVALID'],
  ])('%j → %s', (value, expected) => {
    expect(codeOf(versionTermsProblem(value))).toBe(expected);
  });

  it('REVIEWED_WITH_LIMITS needs a cited primary or additional source that records a review', () => {
    const reviewed = new Set([S2]);
    const claim = (overrides: Partial<VersionTerms>) =>
      codeOf(
        versionReviewProblem(
          terms({ sourceReviewState: 'REVIEWED_WITH_LIMITS', ...overrides }),
          reviewed,
        ),
      );
    expect(claim({})).toBe('REVIEW_UNSUPPORTED');
    expect(claim({ primarySourceId: S1 })).toBe('REVIEW_UNSUPPORTED');
    expect(claim({ primarySourceId: S2 })).toBeNull();
    expect(
      claim({ additionalSourceRefs: [{ sourceId: S2, role: 'annex', scopeText: 'x' }] }),
    ).toBeNull();
    // A signed-date citation is not a review of the version's documents.
    expect(claim({ signedDatesRaw: [{ subjectLabel: 'x', dateRaw: 'x', sourceId: S2 }] })).toBe(
      'REVIEW_UNSUPPORTED',
    );
    // Other review states are never refused and never upgraded.
    expect(versionReviewProblem(terms({ sourceReviewState: 'CONFLICT' }), new Set())).toBeNull();
    expect(versionReviewProblem(terms({ primarySourceId: S2 }), reviewed)).toBeNull();
  });

  it('cites every source with the request path of its id', () => {
    expect(
      versionSourceUses(
        terms({
          primarySourceId: S1,
          additionalSourceRefs: [
            { sourceId: S2, role: 'annex', scopeText: 'x' },
            { sourceId: S3, role: 'annex', scopeText: 'y' },
          ],
          signedDatesRaw: [{ subjectLabel: 'x', dateRaw: 'x', sourceId: S1 }],
        }),
      ),
    ).toEqual([
      { field: 'primarySourceId', sourceId: S1 },
      { field: 'additionalSourceRefs.0.sourceId', sourceId: S2 },
      { field: 'additionalSourceRefs.1.sourceId', sourceId: S3 },
      { field: 'signedDatesRaw.0.sourceId', sourceId: S1 },
    ]);
  });
});

describe('event review — DOCUMENT_REVIEWED needs a source that records a review', () => {
  it.each([
    ['OPERATOR_REPORTED', 'OPERATOR_REPORTED', null],
    ['MISSING', 'DOCUMENT_REVIEWED', null],
    ['ANALYSIS', 'OPERATOR_REPORTED', null],
    ['CONFLICT', 'MISSING', null],
    ['DOCUMENT_REVIEWED', 'DOCUMENT_REVIEWED', null],
    ['DOCUMENT_REVIEWED', 'OPERATOR_REPORTED', 'REVIEW_UNSUPPORTED'],
    ['DOCUMENT_REVIEWED', 'ANALYSIS', 'REVIEW_UNSUPPORTED'],
  ])('event %s on a %s source → %s', (event, source, expected) => {
    expect(codeOf(eventReviewProblem(event, source))).toBe(expected);
  });
});

describe('write data and audit values', () => {
  it('dates become UTC midnight; null JSON is SQL NULL; other values are written as received', () => {
    const data = authorityWriteData(
      {
        effectiveOn: '2025-03-03',
        expiresOn: null,
        additionalSourceRefs: null,
        actionScope: ['PREPARE_NOTICE'],
        changeReason: 'x',
        omitted: undefined,
      },
      [
        'effectiveOn',
        'expiresOn',
        'additionalSourceRefs',
        'actionScope',
        'changeReason',
        'omitted',
      ],
    );
    expect(data).toEqual({
      effectiveOn: toDbDate('2025-03-03'),
      expiresOn: null,
      additionalSourceRefs: Prisma.DbNull,
      actionScope: ['PREPARE_NOTICE'],
      changeReason: 'x',
    });
    expect(toDbDate('2025-03-03').toISOString()).toBe('2025-03-03T00:00:00.000Z');
  });

  it('free text is redacted to its length; citations keep only their count and source ids', () => {
    expect(authorityAuditValue('interpretation', 'quoted clause')).toEqual({
      redacted: true,
      codePoints: 13,
    });
    expect(authorityAuditValue('effectiveOn', new Date('2025-03-03T00:00:00.000Z'))).toBe(
      '2025-03-03',
    );
    expect(
      authorityAuditFields(
        {
          additionalSourceRefs: [{ sourceId: S1, role: 'annex', scopeText: 'quoted clause' }],
          signedDatesRaw: [{ subjectLabel: 'Party', dateRaw: '3 March', sourceId: S2 }],
          provenance: 'OPERATOR_REPORTED',
        },
        ['additionalSourceRefs', 'signedDatesRaw', 'provenance', 'rawEffectiveText'],
      ),
    ).toEqual({
      additionalSourceRefs: { count: 1, sourceIds: [S1] },
      signedDatesRaw: { count: 1, sourceIds: [S2] },
      provenance: 'OPERATOR_REPORTED',
      rawEffectiveText: null,
    });
  });
});
