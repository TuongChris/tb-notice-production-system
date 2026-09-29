// Candidate-assessment rules (P4H; ADR-0008 and ADR-0009, accepted by the operator with the
// independent review deferred) that need no database: the request-only checks a capture runs before
// an idempotency claim (NUL, a storable assessedAt, each case source and each ask once, the D-4
// provenance rule), the exact ruleset binding, the evaluation epoch (all four values, never a partial
// match), the D-3 applicability rule, supersession (same case, candidate and gate, the head only; the
// epoch may differ), chain heads and current heads (a stale head never counts), the integrity of
// stored chains, and the module's source: no network, AI provider, clock in the rules, readiness,
// waiver, disposition, signature or sending. Database behaviour is covered over HTTP in
// tests/db/p4h-http.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CaptureAssessment } from '../../packages/contracts/src/index.js';
import { CaptureAssessmentSchema } from '../../packages/contracts/src/index.js';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import {
  assessmentHeads,
  captureRequestProblem,
  currentHeads,
  epochOf,
  GATES,
  provenanceProblem,
  rulesetProblem,
  sameEpoch,
  supersessionIntegrity,
  supersessionProblem,
  supportsMustApply,
  textLength,
  type AssessmentEpoch,
  type ChainRecord,
  type Gate,
} from '../../apps/api/src/modules/assessments/assessment-rules.js';
import { TECHNICAL_RULESET_VERSION } from '../../apps/api/src/modules/validation/technical-ruleset.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const ASSESSMENTS_MODULE = path.join(repoRoot, 'apps/api/src/modules/assessments');

const CASE = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER_CASE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CANDIDATE = '16fd2706-8baf-433b-82eb-8c7fada847da';
const OTHER_CANDIDATE = '886313e1-3b8a-4372-9b90-0c9aee199e5d';
const LINK_A = 'a3bb189e-8bf9-4888-9912-ace4e6543002';
const LINK_B = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
const BINDING = '9f0f4b52-5d7e-4c8e-9a4b-0d6f1d3c2b1a';

const outcome = (error: ApiError | null) =>
  error === null ? null : [error.status, error.code, error.details];

/** A contract-valid capture body; every field explicit (no substantive default exists). */
function body(overrides: Partial<CaptureAssessment> = {}): CaptureAssessment {
  const value = {
    gate: 'G2',
    result: 'HOLD',
    expectedArtifactSha256: 'a'.repeat(64),
    expectedDependencyDigest: 'b'.repeat(64),
    rulesetVersion: TECHNICAL_RULESET_VERSION,
    scopeState: 'RECORDED_NOT_ADOPTED',
    performerKind: 'HUMAN',
    performerLabel: 'SYNTHETIC reviewer',
    provenance: 'OPERATOR_REPORTED',
    rationale: 'SYNTHETIC rationale',
    scopeText: 'SYNTHETIC scope of the review',
    sources: [{ caseSourceId: LINK_A, supportedConclusion: 'SYNTHETIC supported conclusion' }],
    ...overrides,
  };
  // Every body a test uses is first a contract-valid body: the rules run after the contract parse.
  expect(CaptureAssessmentSchema.safeParse(value).success, JSON.stringify(value)).toBe(true);
  return value as CaptureAssessment;
}

const EPOCH: AssessmentEpoch = {
  candidateId: CANDIDATE,
  artifactSha256: 'a'.repeat(64),
  dependencyDigest: 'b'.repeat(64),
  rulesetVersion: 'TB-TECHNICAL-RULESET-v3',
};

describe('the evaluation epoch E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion)', () => {
  it('is exactly its four values: equal only when all four are equal — no partial match, no mixing', () => {
    expect(sameEpoch(EPOCH, { ...EPOCH })).toBe(true);
    for (const key of Object.keys(EPOCH) as Array<keyof AssessmentEpoch>) {
      const changed = { ...EPOCH, [key]: key === 'candidateId' ? OTHER_CANDIDATE : 'c'.repeat(64) };
      expect(sameEpoch(EPOCH, changed), key).toBe(false);
      expect(sameEpoch(changed, EPOCH), key).toBe(false);
    }
    // Two of four equal is not the same epoch either.
    expect(
      sameEpoch(EPOCH, { ...EPOCH, dependencyDigest: 'c'.repeat(64), rulesetVersion: 'x' }),
    ).toBe(false);
    const record = { ...EPOCH, id: 'x', gate: 'G1', result: 'PASS', extra: true };
    expect(epochOf(record)).toEqual(EPOCH);
    expect(Object.keys(epochOf(record))).toEqual([
      'candidateId',
      'artifactSha256',
      'dependencyDigest',
      'rulesetVersion',
    ]);
  });

  it('the ruleset of a new assessment is the one the server runs now (v3); a historical v1 or v2 identifier, a lookalike or an arbitrary text is 422 RULESET_NOT_CURRENT naming the current one', () => {
    expect(TECHNICAL_RULESET_VERSION).toBe('TB-TECHNICAL-RULESET-v3');
    expect(rulesetProblem(TECHNICAL_RULESET_VERSION, TECHNICAL_RULESET_VERSION)).toBeNull();
    for (const requested of [
      'TB-TECHNICAL-RULESET-v1',
      'TB-TECHNICAL-RULESET-v2',
      'TB-TECHNICAL-RULESET-v4',
      'tb-technical-ruleset-v3',
      'TB-TECHNICAL-RULESET-v3 ',
      ' TB-TECHNICAL-RULESET-v3',
      'TB-TECHNICAL-RULESET-V3',
      'SYNTHETIC arbitrary ruleset',
    ]) {
      expect(outcome(rulesetProblem(requested, TECHNICAL_RULESET_VERSION)), requested).toEqual([
        422,
        'RULESET_NOT_CURRENT',
        { field: 'rulesetVersion', currentRulesetVersion: 'TB-TECHNICAL-RULESET-v3' },
      ]);
    }
  });
});

describe('D-3: applicability by result; D-4: provenance by performer', () => {
  it('only a PASS needs every cited support to apply to the case now; HOLD, BLOCKED, MISSING and CONFLICT may cite a linked source that no longer applies', () => {
    expect(supportsMustApply('PASS')).toBe(true);
    for (const result of ['HOLD', 'BLOCKED', 'MISSING', 'CONFLICT'] as const) {
      expect(supportsMustApply(result), result).toBe(false);
    }
  });

  it('an AI_ASSISTED performer never records DOCUMENT_REVIEWED (422 REVIEW_UNSUPPORTED); a HUMAN or a DOCUMENTED_EXTERNAL_REVIEW may record it as the explicit statement of an actual review; every other provenance is stored as supplied', () => {
    expect(
      outcome(provenanceProblem({ performerKind: 'AI_ASSISTED', provenance: 'DOCUMENT_REVIEWED' })),
    ).toEqual([
      422,
      'REVIEW_UNSUPPORTED',
      { field: 'provenance', reason: 'AI_ASSISTED_PERFORMER' },
    ]);
    const error = provenanceProblem({
      performerKind: 'AI_ASSISTED',
      provenance: 'DOCUMENT_REVIEWED',
    });
    expect(error?.message).toContain('DOCUMENT_REVIEWED requires an actual human document review');
    for (const performerKind of ['HUMAN', 'AI_ASSISTED', 'DOCUMENTED_EXTERNAL_REVIEW'] as const) {
      for (const provenance of [
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ] as const) {
        const refused = performerKind === 'AI_ASSISTED' && provenance === 'DOCUMENT_REVIEWED';
        expect(
          provenanceProblem({ performerKind, provenance }) === null,
          `${performerKind} ${provenance}`,
        ).toBe(!refused);
      }
    }
  });
});

describe('captureRequestProblem — the request-only checks, before any claim', () => {
  it('a contract-valid body with explicit values passes; every text is kept as decoded (no trimming or normalization)', () => {
    expect(captureRequestProblem(body())).toBeNull();
    expect(
      captureRequestProblem(
        body({
          rationale: '  SYNTHETIC café\r\ncafé  ',
          scopeText: '\tSYNTHETIC scope ',
          limitations: '',
          assessedAt: null,
        }),
      ),
    ).toBeNull();
  });

  it('a NUL anywhere — a text, a support conclusion, a disposition — is 422 VALIDATION_FAILED at its path', () => {
    const cases: Array<[Partial<CaptureAssessment>, string]> = [
      [{ performerLabel: 'SYNTHETIC\u0000reviewer' }, 'performerLabel'],
      [{ rationale: 'SYNTHETIC\u0000' }, 'rationale'],
      [{ scopeText: '\u0000' }, 'scopeText'],
      [{ limitations: 'SYNTHETIC \u0000 limit' }, 'limitations'],
      [
        { sources: [{ caseSourceId: LINK_A, supportedConclusion: 'SYNTHETIC\u0000' }] },
        'sources.0.supportedConclusion',
      ],
      [
        {
          askDispositions: [
            {
              askId: 'Q1',
              questionText: 'SYNTHETIC question\u0000',
              parentBindingId: BINDING,
              disposition: 'MISSING_FACT',
              sourceIds: [],
            },
          ],
        },
        'askDispositions.0.questionText',
      ],
    ];
    for (const [overrides, fieldPath] of cases) {
      const error = captureRequestProblem(body(overrides));
      expect([error?.status, error?.code], fieldPath).toEqual([422, 'VALIDATION_FAILED']);
      expect(JSON.stringify(error?.details), fieldPath).toContain(`"path":"${fieldPath}"`);
    }
  });

  it('assessedAt is stored exactly as supplied or refused (R7 storability): a leap second, a non-zero digit beyond the milliseconds or an instant MySQL cannot store is 422 before any claim; hour 24 is already refused by the contract', () => {
    expect(captureRequestProblem(body({ assessedAt: '2026-09-28T10:11:12.345Z' }))).toBeNull();
    expect(captureRequestProblem(body({ assessedAt: '2026-09-28T17:11:12.345+07:00' }))).toBeNull();
    expect(captureRequestProblem(body({ assessedAt: '2026-09-28T10:11:12.3450Z' }))).toBeNull();
    for (const assessedAt of [
      '2026-06-30T23:59:60Z',
      '2026-09-28T10:11:12.3456Z',
      '0999-12-31T23:59:59Z',
      '9999-12-31T23:59:59.500Z',
    ]) {
      const error = captureRequestProblem(body({ assessedAt }));
      expect([error?.status, error?.code], assessedAt).toEqual([422, 'VALIDATION_FAILED']);
      expect(JSON.stringify(error?.details), assessedAt).toContain('"path":"assessedAt"');
    }
    expect(
      CaptureAssessmentSchema.safeParse({ ...body(), assessedAt: '2026-09-28T24:00:00Z' }).success,
    ).toBe(false);
  });

  it('each case source supports an assessment once and each ask of a parent message has one disposition (422 VALIDATION_FAILED at the repeat) — never left to the database key', () => {
    const repeated = captureRequestProblem(
      body({
        sources: [
          { caseSourceId: LINK_A, supportedConclusion: 'SYNTHETIC one' },
          { caseSourceId: LINK_B, supportedConclusion: 'SYNTHETIC two' },
          { caseSourceId: LINK_A, supportedConclusion: 'SYNTHETIC three' },
        ],
      }),
    );
    expect([repeated?.status, repeated?.code]).toEqual([422, 'VALIDATION_FAILED']);
    expect(JSON.stringify(repeated?.details)).toContain('"path":"sources.2.caseSourceId"');
    const ask = {
      askId: 'Q1',
      questionText: 'SYNTHETIC question',
      parentBindingId: BINDING,
      disposition: 'MISSING_FACT' as const,
      sourceIds: [],
    };
    const asked = captureRequestProblem(body({ askDispositions: [ask, { ...ask }] }));
    expect([asked?.status, asked?.code]).toEqual([422, 'VALIDATION_FAILED']);
    expect(JSON.stringify(asked?.details)).toContain('"path":"askDispositions.1.askId"');
    // Another ask id, or the same ask id of another parent message, is another disposition.
    expect(
      captureRequestProblem(body({ askDispositions: [ask, { ...ask, askId: 'Q2' }] })),
    ).toBeNull();
    expect(
      captureRequestProblem(
        body({ askDispositions: [ask, { ...ask, parentBindingId: OTHER_CASE }] }),
      ),
    ).toBeNull();
  });

  it('the D-4 provenance rule runs last: a well-formed AI_ASSISTED DOCUMENT_REVIEWED body is 422 REVIEW_UNSUPPORTED', () => {
    expect(
      outcome(
        captureRequestProblem(
          body({ performerKind: 'AI_ASSISTED', provenance: 'DOCUMENT_REVIEWED' }),
        ),
      ),
    ).toEqual([
      422,
      'REVIEW_UNSUPPORTED',
      { field: 'provenance', reason: 'AI_ASSISTED_PERFORMER' },
    ]);
    // A NUL is reported first (the body is invalid before its provenance is considered).
    expect(
      captureRequestProblem(
        body({
          performerKind: 'AI_ASSISTED',
          provenance: 'DOCUMENT_REVIEWED',
          rationale: 'SYNTHETIC\u0000',
        }),
      )?.code,
    ).toBe('VALIDATION_FAILED');
  });

  it('no substantive default: the contract requires gate, result, scopeState, performer and provenance, and 1–100 supports — nothing defaults to PASS or SCOPE_CONFIRMED_FOR_CANDIDATE', () => {
    for (const key of [
      'gate',
      'result',
      'scopeState',
      'performerKind',
      'performerLabel',
      'provenance',
      'rationale',
      'scopeText',
      'sources',
      'expectedArtifactSha256',
      'expectedDependencyDigest',
      'rulesetVersion',
    ] as const) {
      const { [key]: _omitted, ...rest } = body();
      expect(CaptureAssessmentSchema.safeParse(rest).success, key).toBe(false);
    }
    expect(CaptureAssessmentSchema.safeParse({ ...body(), sources: [] }).success).toBe(false);
    const hundredOne = Array.from({ length: 101 }, (_, index) => ({
      caseSourceId: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
      supportedConclusion: 'SYNTHETIC',
    }));
    expect(CaptureAssessmentSchema.safeParse({ ...body(), sources: hundredOne }).success).toBe(
      false,
    );
    const conclusion = (length: number) => ({
      ...body(),
      sources: [{ caseSourceId: LINK_A, supportedConclusion: 'x'.repeat(length) }],
    });
    expect(CaptureAssessmentSchema.safeParse(conclusion(8000)).success).toBe(true);
    expect(CaptureAssessmentSchema.safeParse(conclusion(8001)).success).toBe(false);
    const parsed = CaptureAssessmentSchema.parse(body());
    expect(parsed.result).toBe('HOLD');
    expect(parsed.scopeState).toBe('RECORDED_NOT_ADOPTED');
  });
});

describe('supersession — same case, candidate and gate; the head only; the epoch may differ (D-2)', () => {
  const record = (overrides: Partial<ChainRecord> = {}): ChainRecord => ({
    id: 'p',
    caseId: CASE,
    candidateId: CANDIDATE,
    gate: 'G1',
    supersedesAssessmentId: null,
    ...overrides,
  });
  const successor = { caseId: CASE, candidateId: CANDIDATE, gate: 'G1' as Gate };

  it('a head of the same case, candidate and gate may be superseded (whatever the epochs)', () => {
    expect(supersessionProblem(record(), successor, null)).toBeNull();
  });

  it('another case is 422 CROSS_CASE_REFERENCE; another candidate or gate 422 REVISION_SCOPE_CHANGE; a predecessor with a successor 409 ASSESSMENT_ALREADY_SUPERSEDED naming it', () => {
    expect(outcome(supersessionProblem(record({ caseId: OTHER_CASE }), successor, null))).toEqual([
      422,
      'CROSS_CASE_REFERENCE',
      expect.objectContaining({ field: 'supersedesAssessmentId' }),
    ]);
    expect(
      outcome(supersessionProblem(record({ candidateId: OTHER_CANDIDATE }), successor, null)),
    ).toEqual([422, 'REVISION_SCOPE_CHANGE', { fields: ['candidateId'] }]);
    expect(outcome(supersessionProblem(record({ gate: 'G2' }), successor, null))).toEqual([
      422,
      'REVISION_SCOPE_CHANGE',
      { fields: ['gate'] },
    ]);
    expect(outcome(supersessionProblem(record(), successor, 'the-successor'))).toEqual([
      409,
      'ASSESSMENT_ALREADY_SUPERSEDED',
      { successorId: 'the-successor' },
    ]);
  });
});

describe('heads and current heads — staleness needs no supersession; several heads stay unreconciled', () => {
  type Row = ChainRecord & AssessmentEpoch;
  const row = (id: string, overrides: Partial<Row> = {}): Row => ({
    ...EPOCH,
    id,
    caseId: CASE,
    gate: 'G1',
    supersedesAssessmentId: null,
    ...overrides,
  });
  const STALE = { ...EPOCH, dependencyDigest: 'd'.repeat(64) };

  it('the heads of one candidate and gate are its assessments no assessment supersedes, in the order given; another gate or candidate is never a head of this one', () => {
    const rows = [
      row('a1'),
      row('a2', { supersedesAssessmentId: 'a1' }),
      row('b1'),
      row('g2', { gate: 'G2' }),
      row('x1', { candidateId: OTHER_CANDIDATE }),
    ];
    expect(assessmentHeads(rows, CANDIDATE, 'G1').map((entry) => entry.id)).toEqual(['a2', 'b1']);
    expect(assessmentHeads(rows, CANDIDATE, 'G2').map((entry) => entry.id)).toEqual(['g2']);
    expect(assessmentHeads(rows, CANDIDATE, 'G3')).toEqual([]);
    expect(assessmentHeads(rows, OTHER_CANDIDATE, 'G1').map((entry) => entry.id)).toEqual(['x1']);
  });

  it('a current head has exactly the current epoch: a head of another epoch is stale and never counts; a superseded record never counts even at the current epoch; a cross-epoch successor makes its epoch current', () => {
    const rows = [
      row('old', STALE),
      row('same-epoch-superseded'),
      row('successor', { ...STALE, supersedesAssessmentId: 'same-epoch-superseded' }),
    ];
    // The successor (another epoch) superseded the current-epoch record: nothing is current.
    expect(currentHeads(rows, 'G1', EPOCH)).toEqual([]);
    expect(currentHeads(rows, 'G1', STALE).map((entry) => entry.id)).toEqual(['old', 'successor']);
    // A new current-epoch head superseding the stale one.
    const renewed = [...rows, row('renewed', { supersedesAssessmentId: 'successor' })];
    expect(currentHeads(renewed, 'G1', EPOCH).map((entry) => entry.id)).toEqual(['renewed']);
    expect(currentHeads(renewed, 'G1', STALE).map((entry) => entry.id)).toEqual(['old']);
    for (const key of ['artifactSha256', 'rulesetVersion'] as const) {
      expect(currentHeads([row('h')], 'G1', { ...EPOCH, [key]: 'e'.repeat(64) }), key).toEqual([]);
    }
  });

  it('the gates are exactly G1–G6 (G7 is the human act outside the application)', () => {
    expect(GATES).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
  });
});

describe('supersessionIntegrity — stored chains are sound or a reader treats them as a 500', () => {
  const r = (id: string, supersedes: string | null, overrides: Partial<ChainRecord> = {}) => ({
    id,
    caseId: CASE,
    candidateId: CANDIDATE,
    gate: 'G1' as Gate,
    supersedesAssessmentId: supersedes,
    ...overrides,
  });

  it('sound chains report nothing', () => {
    expect(supersessionIntegrity([r('a', null), r('b', 'a'), r('c', 'b'), r('d', null)])).toEqual(
      [],
    );
  });

  it('a predecessor outside the set, of another case, candidate or gate, two successors and a loop are each reported', () => {
    expect(supersessionIntegrity([r('b', 'missing')])).toEqual([
      'b: supersedes an assessment outside the set',
    ]);
    for (const overrides of [
      { caseId: OTHER_CASE },
      { candidateId: OTHER_CANDIDATE },
      { gate: 'G2' as Gate },
    ]) {
      expect(supersessionIntegrity([r('a', null, overrides), r('b', 'a')])).toEqual([
        'b: supersedes another case, candidate or gate',
      ]);
    }
    expect(supersessionIntegrity([r('a', null), r('b', 'a'), r('c', 'a')])).toEqual([
      'a: has 2 successors',
    ]);
    expect(supersessionIntegrity([r('a', 'b'), r('b', 'a')])).toEqual([
      'a: its chain loops',
      'b: its chain loops',
    ]);
  });
});

describe('audit redaction', () => {
  it('a free text is recorded only as its length in code points', () => {
    expect(textLength('SYNTHETIC')).toEqual({ redacted: true, codePoints: 9 });
    expect(textLength('café 🙂')).toEqual({ redacted: true, codePoints: 6 });
    expect(textLength('')).toEqual({ redacted: true, codePoints: 0 });
  });
});

describe('the assessments module: no network, AI provider, readiness, waiver, disposition, signature or sending', () => {
  const sources = readdirSync(ASSESSMENTS_MODULE)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(path.join(ASSESSMENTS_MODULE, name), 'utf8')] as const);
  const code = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

  it('no module file calls a network, mail, file, process, curl or AI-provider API', () => {
    expect(sources.map(([name]) => name).sort()).toEqual([
      'assessment-rules.ts',
      'assessment-views.ts',
      'assessment-write-observer.ts',
      'assessments.controller.ts',
      'assessments.module.ts',
      'assessments.service.ts',
    ]);
    const forbidden =
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(http|https|http2|net|tls|dns|dgram|child_process|fs|os|worker_threads)|\bundici\b|\baxios\b|\bcurl\b|nodemailer|smtp|imap|googleapis|openai|anthropic|gemini|@google\/gen|generativelanguage|bedrock|vertex|mistral|cohere|ollama|langchain|process\.(env|exec|spawn)|\bexecSync\b|\bspawn\s*\(|\beval\s*\(|new Function\s*\(|completions|chat\.create|generateContent/i;
    for (const [name, text] of sources) expect(text, name).not.toMatch(forbidden);
  });

  it('the rules read no clock, randomness, locale or environment', () => {
    const rules = sources.find(([name]) => name === 'assessment-rules.ts')?.[1] ?? '';
    expect(code(rules)).not.toMatch(
      /\bDate\b|Math\.random|randomUUID|randomBytes|performance\.|process\.|toLocale|Intl\.|localeCompare|\.normalize\(|\.trim\(|hostname/,
    );
  });

  it('nothing computes readiness or writes a waiver, disposition, signature or send state; a run, issue, candidate, prompt, source, link or case is never updated, and an assessment or support is never updated or deleted', () => {
    for (const [name, text] of sources) {
      const body = code(text);
      expect(body, name).not.toMatch(
        /READY_FOR_SIGNER|readiness|STALE_REVALIDATION_REQUIRED|waive|override|dispos(e|ition)State|'SIGNED'|'ADOPTED'|'APPROVED'|G7_COMPLETE|'AS_SENT'/i,
      );
      expect(body, name).not.toMatch(
        /\.(candidateAssessment|assessmentSource|validationRun|validationIssue|noticeCandidate|promptSnapshot|sourceReference|caseSource|caseRecord)\.(update|updateMany|upsert|delete|deleteMany)\(/,
      );
      // Row locks (SELECT … FOR UPDATE / FOR SHARE) are reads; no raw SQL writes anything.
      expect(body, name).not.toMatch(
        /\bUPDATE\s+`?\w+`?\s+SET\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b/i,
      );
    }
    const service = code(sources.find(([name]) => name === 'assessments.service.ts')?.[1] ?? '');
    // The only writes: one assessment, its support rows (and the audit event and idempotency
    // record through the WriteExecutor).
    expect(service.match(/\.create\(/g)).toHaveLength(1);
    expect(service.match(/\.createMany\(/g)).toHaveLength(1);
    expect(service).toContain('tx.candidateAssessment');
    expect(service).toContain('tx.assessmentSource.createMany(');
    // The ruleset recorded is the server's, never the request's.
    expect(service).toContain('rulesetVersion: TECHNICAL_RULESET_VERSION,');
    expect(service).not.toMatch(/rulesetVersion: body\.rulesetVersion/);
  });
});
