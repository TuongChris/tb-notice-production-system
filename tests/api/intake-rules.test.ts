// Case intake rules (P4B) that need no database: the reported-item URL normalization
// (reported-url.ts), the use-mapping millisecond and interval rules, the fact scope rule and the
// request-only fact checks (intake-rules.ts, case-facts.service.ts). Database behaviour of the same
// rules is covered over HTTP in tests/db/p4b-http.test.ts.
import { describe, expect, it } from 'vitest';
import type { CreateFact } from '../../packages/contracts/src/index.js';
import { CreateFactSchema, CreateUseMappingSchema } from '../../packages/contracts/src/index.js';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import {
  factRequestProblem,
  FACT_TYPES,
} from '../../apps/api/src/modules/cases/case-facts.service.js';
import {
  BOUNDARY_CONVENTIONS,
  factScope,
  intervalProblem,
  mappingValueProblem,
  MAX_MILLISECONDS,
  toMilliseconds,
} from '../../apps/api/src/modules/cases/intake-rules.js';
import { normalizeReportedUrl } from '../../apps/api/src/modules/cases/reported-url.js';
import { auditValue } from '../../apps/api/src/modules/directory/changes.js';

const ID = 'dQw4w9WgXcQ';

describe('reported item URL normalization — deterministic, offline, recognize-or-reject', () => {
  /** [raw URL, the video id it names] — every accepted shape; nothing is fetched. */
  const ACCEPTED: Array<[string, string]> = [
    [`https://www.youtube.com/watch?v=${ID}`, ID],
    [`https://youtube.com/watch?v=${ID}`, ID],
    [`https://m.youtube.com/watch?v=${ID}`, ID],
    [`http://www.youtube.com/watch?v=${ID}`, ID],
    [`https://WWW.YouTube.COM/watch?v=${ID}`, ID],
    [`https://www.youtube.com/watch?feature=share&v=${ID}&t=42s&list=PL1#t=5`, ID],
    [`https://www.youtube.com:443/watch?v=${ID}`, ID],
    [`https://youtu.be/${ID}`, ID],
    [`https://youtu.be/${ID}?si=abc&t=10`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://www.youtube.com/shorts/${ID}?feature=share`, ID],
    [`https://www.youtube.com/live/${ID}?si=abc`, ID],
    ['https://www.youtube.com/watch?v=abcdefghijk', 'abcdefghijk'],
    ['https://www.youtube.com/watch?v=ABCDEFGHIJK', 'ABCDEFGHIJK'],
    ['https://www.youtube.com/watch?v=a-b_c-d_e-f', 'a-b_c-d_e-f'],
  ];

  it.each(ACCEPTED)(
    '%s names the video %s; the normalized URL is the canonical watch URL',
    (raw, id) => {
      expect(normalizeReportedUrl(raw)).toEqual({
        ok: true,
        externalItemId: id,
        normalizedUrl: `https://www.youtube.com/watch?v=${id}`,
      });
      // Deterministic: the same input always gives the same result.
      expect(normalizeReportedUrl(raw)).toEqual(normalizeReportedUrl(raw));
    },
  );

  it('keeps the video id exactly as written: ids differing only in case are different items', () => {
    const lower = normalizeReportedUrl('https://youtu.be/abcdefghijk');
    const upper = normalizeReportedUrl('https://youtu.be/ABCDEFGHIJK');
    expect(lower.ok && upper.ok && lower.externalItemId !== upper.externalItemId).toBe(true);
  });

  /** [raw URL, the refusal reason] — refused, never guessed. */
  const REFUSED: Array<[string, string]> = [
    ['not a url', 'UNPARSEABLE'],
    [`ftp://www.youtube.com/watch?v=${ID}`, 'UNPARSEABLE'],
    [`https://user@www.youtube.com/watch?v=${ID}`, 'CREDENTIALS_IN_URL'],
    [`https://user:secret@www.youtube.com/watch?v=${ID}`, 'CREDENTIALS_IN_URL'],
    [`https://www.youtube.com@evil.example.invalid/watch?v=${ID}`, 'CREDENTIALS_IN_URL'],
    [`https://www.youtube.com:8443/watch?v=${ID}`, 'PORT_IN_URL'],
    [`https://music.youtube.com/watch?v=${ID}`, 'NOT_YOUTUBE'],
    [`https://www.youtube-nocookie.com/embed/${ID}`, 'NOT_YOUTUBE'],
    [`https://www.youtube.com.evil.example.invalid/watch?v=${ID}`, 'NOT_YOUTUBE'],
    [`https://youtube.com./watch?v=${ID}`, 'NOT_YOUTUBE'],
    [`https://www.уoutube.com/watch?v=${ID}`, 'NOT_YOUTUBE'],
    [`https://www.youtube.com/embed/${ID}`, 'NOT_A_VIDEO_URL'],
    ['https://www.youtube.com/embed/videoseries?list=PL1', 'NOT_A_VIDEO_URL'],
    ['https://www.youtube.com/@channel', 'NOT_A_VIDEO_URL'],
    ['https://www.youtube.com/channel/UC123', 'NOT_A_VIDEO_URL'],
    ['https://www.youtube.com/playlist?list=PL1', 'NOT_A_VIDEO_URL'],
    ['https://www.youtube.com/watch?list=PL1', 'NOT_A_VIDEO_URL'],
    [`https://www.youtube.com/watch?V=${ID}`, 'NOT_A_VIDEO_URL'],
    [`https://www.youtube.com/WATCH?v=${ID}`, 'NOT_A_VIDEO_URL'],
    [`https://www.youtube.com/watch/${ID}`, 'NOT_A_VIDEO_URL'],
    [`https://www.youtube.com/v/${ID}`, 'NOT_A_VIDEO_URL'],
    [`https://www.youtube.com/shorts/${ID}/`, 'NOT_A_VIDEO_URL'],
    [`https://youtu.be/${ID}/extra`, 'NOT_A_VIDEO_URL'],
    ['https://youtu.be/', 'NOT_A_VIDEO_URL'],
    [`https://www.youtube.com/watch?v=${ID}&v=${ID}`, 'AMBIGUOUS_VIDEO_ID'],
    [`https://www.youtube.com/watch?%76=${ID}`, 'AMBIGUOUS_VIDEO_ID'],
    [`https://www.youtube.com/watch?v=${ID}&%76=x`, 'AMBIGUOUS_VIDEO_ID'],
    ['https://www.youtube.com/watch?v=short', 'INVALID_VIDEO_ID'],
    [`https://www.youtube.com/watch?v=${ID}Q`, 'INVALID_VIDEO_ID'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXc%51', 'INVALID_VIDEO_ID'],
    ['https://www.youtube.com/shorts/dQw4w9WgXc%51', 'INVALID_VIDEO_ID'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXc!', 'INVALID_VIDEO_ID'],
    ['https://www.youtube.com/watch?v=', 'INVALID_VIDEO_ID'],
  ];

  it.each(REFUSED)('%s is refused (%s)', (raw, reason) => {
    expect(normalizeReportedUrl(raw)).toEqual({ ok: false, reason });
  });
});

describe('use mapping values — unsigned milliseconds, known intervals, boundary convention', () => {
  it('accepts the contract pattern up to 9007199254740991 and refuses larger 16-digit values', () => {
    expect(MAX_MILLISECONDS).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    expect(mappingValueProblem({ sourceEndMs: '9007199254740991' })).toBeNull();
    for (const value of ['9007199254740992', '9999999999999999']) {
      // The contract pattern admits them; the domain bound does not.
      expect(
        CreateUseMappingSchema.safeParse({
          caseWorkId: '00000000-0000-4000-8000-000000000001',
          reportedItemId: '00000000-0000-4000-8000-000000000002',
          occurrence: 1,
          sourceEndMs: value,
        }).success,
      ).toBe(true);
      const problem = mappingValueProblem({ sourceEndMs: value });
      expect(problem).toBeInstanceOf(ApiError);
      expect([problem?.status, problem?.code, problem?.details]).toEqual([
        422,
        'VALIDATION_FAILED',
        {
          issues: [
            { path: 'sourceEndMs', message: 'Must be at most 9007199254740991 milliseconds' },
          ],
        },
      ]);
    }
    expect(toMilliseconds('108000000')).toBe(108000000n);
    expect(toMilliseconds(null)).toBeNull();
  });

  it('boundary conventions are exactly UNKNOWN, HALF_OPEN and INCLUSIVE', () => {
    expect(BOUNDARY_CONVENTIONS).toEqual(['UNKNOWN', 'HALF_OPEN', 'INCLUSIVE']);
    for (const convention of BOUNDARY_CONVENTIONS) {
      expect(mappingValueProblem({ boundaryConvention: convention })).toBeNull();
    }
    for (const convention of ['unknown', 'CLOSED', 'OPEN', 'EXCLUSIVE']) {
      expect(mappingValueProblem({ boundaryConvention: convention })?.code).toBe(
        'VALIDATION_FAILED',
      );
    }
  });

  it('a known end must exceed its known start; unknown bounds are never compared', () => {
    const none = {
      sourceStartMs: null,
      sourceEndMs: null,
      reportedStartMs: null,
      reportedEndMs: null,
    };
    expect(intervalProblem(none)).toBeNull();
    expect(intervalProblem({ ...none, sourceStartMs: '5' })).toBeNull();
    expect(intervalProblem({ ...none, sourceEndMs: '0' })).toBeNull();
    expect(intervalProblem({ ...none, sourceStartMs: '0', sourceEndMs: '1' })).toBeNull();
    expect(
      intervalProblem({
        ...none,
        sourceStartMs: '9007199254740990',
        sourceEndMs: '9007199254740991',
      }),
    ).toBeNull();
    for (const [start, end] of [
      ['1', '1'],
      ['2', '1'],
      ['9007199254740991', '9007199254740990'],
    ] as const) {
      expect(intervalProblem({ ...none, sourceStartMs: start, sourceEndMs: end })?.details).toEqual(
        { fields: ['sourceStartMs', 'sourceEndMs'] },
      );
      expect(intervalProblem({ ...none, reportedStartMs: start, reportedEndMs: end })?.code).toBe(
        'TIME_RANGE_INVALID',
      );
    }
    // Compared as integers, not as strings ("10" > "9").
    expect(intervalProblem({ ...none, sourceStartMs: '9', sourceEndMs: '10' })).toBeNull();
  });
});

describe('case fact scope and request checks', () => {
  const W = '00000000-0000-4000-8000-00000000000a';
  const I = '00000000-0000-4000-8000-00000000000b';
  const M = '00000000-0000-4000-8000-00000000000c';

  it('each scope kind names exactly its record', () => {
    expect(factScope({ scopeKind: 'CASE' }).targets).toEqual({
      caseWorkId: null,
      reportedItemId: null,
      mappingId: null,
    });
    expect(factScope({ scopeKind: 'WORK', caseWorkId: W }).targets.caseWorkId).toBe(W);
    expect(
      factScope({ scopeKind: 'REPORTED_ITEM', reportedItemId: I }).targets.reportedItemId,
    ).toBe(I);
    expect(factScope({ scopeKind: 'USE', mappingId: M }).targets.mappingId).toBe(M);
    const refusals: Array<[Parameters<typeof factScope>[0], string, string]> = [
      [{ scopeKind: 'CASE', caseWorkId: W }, 'caseWorkId', 'TARGET_NOT_ALLOWED'],
      [{ scopeKind: 'CASE', mappingId: M }, 'mappingId', 'TARGET_NOT_ALLOWED'],
      [{ scopeKind: 'WORK' }, 'caseWorkId', 'TARGET_REQUIRED'],
      [{ scopeKind: 'WORK', caseWorkId: null }, 'caseWorkId', 'TARGET_REQUIRED'],
      [{ scopeKind: 'WORK', caseWorkId: W, mappingId: M }, 'mappingId', 'TARGET_NOT_ALLOWED'],
      [{ scopeKind: 'REPORTED_ITEM', caseWorkId: W }, 'caseWorkId', 'TARGET_NOT_ALLOWED'],
      [
        { scopeKind: 'USE', mappingId: M, reportedItemId: I },
        'reportedItemId',
        'TARGET_NOT_ALLOWED',
      ],
      [{ scopeKind: 'USE' }, 'mappingId', 'TARGET_REQUIRED'],
    ];
    for (const [input, field, reason] of refusals) {
      let error: unknown;
      try {
        factScope(input);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ApiError);
      expect([
        (error as ApiError).status,
        (error as ApiError).code,
        (error as ApiError).details,
      ]).toEqual([422, 'FACT_SCOPE_INVALID', { field, scopeKind: input.scopeKind, reason }]);
    }
  });

  it('the fact types are exactly the contract’s nine', () => {
    expect(FACT_TYPES).toEqual([
      'RIGHTS_BASIS',
      'RIGHTS_SCOPE',
      'PERMISSION',
      'AV_COMPARISON',
      'EXCEPTION_REVIEW',
      'WORK_IDENTIFICATION',
      'REPORTED_IDENTIFICATION',
      'DUPLICATE_REVIEW',
      'AUTHORITY_CURRENTNESS',
    ]);
  });

  const CASE = '00000000-0000-4000-8000-0000000000c1';
  const base = (body: Record<string, unknown>): CreateFact =>
    CreateFactSchema.parse({
      factType: 'PERMISSION',
      value: { finding: 'UNKNOWN', assertion: '', reviewScope: '' },
      scopeKind: 'CASE',
      provenance: 'MISSING',
      scopeText: 'SYNTHETIC',
      changeReason: 'SYNTHETIC',
      sources: [],
      ...body,
    });
  const support = (caseSourceId: string, supportRole: string) => ({
    caseSourceId,
    supportRole,
    supportedAssertion: 'SYNTHETIC',
  });

  it('request-only checks: storable assertedAsOf, each support once per role, other cases once', () => {
    expect(factRequestProblem(CASE, base({}))).toBeNull();
    expect(factRequestProblem(CASE, base({ assertedAsOf: '2026-09-20T23:59:60Z' }))?.code).toBe(
      'VALIDATION_FAILED',
    );
    expect(
      factRequestProblem(
        CASE,
        base({ sources: [support(W, 'A'), support(W, 'B'), support(I, 'A')] }),
      ),
    ).toBeNull();
    expect(
      factRequestProblem(CASE, base({ sources: [support(W, 'A'), support(W, 'A')] }))?.details,
    ).toEqual({
      issues: [
        {
          path: 'sources.1.supportRole',
          message: 'Each case source supports a fact once per support role',
        },
      ],
    });
    const review = (relatedCaseIds: string[]) =>
      base({
        factType: 'DUPLICATE_REVIEW',
        value: {
          finding: 'UNCHECKED',
          coverageDescription: '',
          observedThrough: null,
          relatedCaseIds,
          reasoning: '',
        },
      });
    expect(factRequestProblem(CASE, review([W, I]))).toBeNull();
    expect(factRequestProblem(CASE, review([CASE]))?.details).toEqual({
      issues: [{ path: 'value.relatedCaseIds.0', message: 'Must name another case, each once' }],
    });
    expect(factRequestProblem(CASE, review([W, W]))?.code).toBe('VALIDATION_FAILED');
  });

  it('a fact support’s supported assertion is recorded in audit only as its length', () => {
    expect(auditValue('supportedAssertion', 'SYNTHETIC — quoted source text')).toEqual({
      redacted: true,
      codePoints: [...'SYNTHETIC — quoted source text'].length,
    });
  });
});
