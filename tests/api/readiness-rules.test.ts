// Readiness rules (P4I; ADR-0011, accepted by the operator with the independent review deferred) that
// need no database: the pinned reason-code orders and status tiers, the current epoch, technical-run
// selection and conflicts (no convenient PASS, no waiver, full coverage), gate heads and summaries
// (never the latest PASS, no compensation among the six gates), support and ask integrity, the
// conservative temporal model (captured boundaries only, a date as the interval it is that date
// somewhere on earth, no invented midnight, no age rule, a missing review time never replaced), the
// signature slot and artifact hashes, and the module's source: no network, clock, randomness or
// write. Database behaviour is covered over HTTP in tests/db/p4i-http.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReadinessSchema } from '../../packages/contracts/src/index.js';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import {
  exactTextSha256,
  PENDING_SIGNATURE,
} from '../../apps/api/src/infrastructure/integrity/tb-canonical-json.js';
import { GATES, type Gate } from '../../apps/api/src/modules/assessments/assessment-rules.js';
import { candidateArtifactSha256 } from '../../apps/api/src/modules/candidates/candidate-artifact.js';
import {
  artifactIntact,
  ASK_DISPOSITION_CAUSE,
  askSourceIds,
  countableHeads,
  coverageComplete,
  dateWindow,
  effectiveDateCodes,
  epochRuns,
  evaluateGate,
  evaluateReadiness,
  exportRefusal,
  g1TemporalCauses,
  GATE_REASON_ORDER,
  READINESS_REASON_ORDER,
  readinessEpoch,
  reviewTiming,
  runCompleted,
  signatureSlotValid,
  statusOf,
  storedDispositions,
  technicalOutcome,
  temporalBoundaries,
  type AuthorityRecordTimes,
  type IssueRecord,
  type ReadinessAssessment,
  type ReadinessInput,
  type RunRecord,
  type SupportRecord,
} from '../../apps/api/src/modules/readiness/readiness-rules.js';
import {
  REQUIRED_RULES,
  TECHNICAL_RULESET_VERSION,
} from '../../apps/api/src/modules/validation/technical-ruleset.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const READINESS_MODULE = path.join(repoRoot, 'apps/api/src/modules/readiness');

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const CASE = uuid(1);
const OTHER_CASE = uuid(2);
const CANDIDATE = uuid(3);
const OTHER_CANDIDATE = uuid(4);
const PARENT = uuid(5);
const OTHER_BINDING = uuid(6);
const SOURCE_A = uuid(7);
const SOURCE_B = uuid(8);
const LINK_A = uuid(9);
const DIGEST = 'd'.repeat(64);
const OLD_DIGEST = 'e'.repeat(64);
const NOW = new Date('2026-09-29T12:00:00.000Z');
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

const SUBJECT = 'SYNTHETIC notice subject';
// CRLF, a trailing space and a composed letter: exact bytes, never normalized.
const BODY = `SYNTHETIC body line \r\nSYNTHETIC second line é\n${PENDING_SIGNATURE}\nSYNTHETIC Signer Name, Agent\n`;
const ENVELOPE = {
  from: 'agent@example.test',
  to: 'copyright@example.test',
  replyTo: null,
  parentBindingId: null,
};
const ARTIFACT = candidateArtifactSha256({
  subject: SUBJECT,
  bodyText: BODY,
  envelope: ENVELOPE,
  preparedDocuments: [],
});
const RULESET = {
  version: TECHNICAL_RULESET_VERSION,
  requiredRuleIds: REQUIRED_RULES.map((rule) => rule.id),
};
const FULL_COVERAGE = {
  requiredRuleIds: RULESET.requiredRuleIds,
  executedRuleIds: RULESET.requiredRuleIds,
  notExecutedRuleIds: [],
  semanticReviewRequired: true,
};
const EPOCH = {
  candidateId: CANDIDATE,
  artifactSha256: ARTIFACT,
  dependencyDigest: DIGEST,
  rulesetVersion: TECHNICAL_RULESET_VERSION,
};
const NO_AUTHORITY: AuthorityRecordTimes = {
  versions: [],
  coverages: [],
  coverageSigners: [],
  events: [],
};

function run(id: string, overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id,
    ...EPOCH,
    result: 'TECHNICAL_PASS',
    coverageManifest: FULL_COVERAGE,
    createdAt: at(-2 * HOUR),
    ...overrides,
  };
}

const issue = (overrides: Partial<IssueRecord> = {}): IssueRecord => ({
  ruleId: 'CONTEXT.CONFLICTS',
  checkKind: 'DETERMINISTIC',
  severity: 'REVIEW_REQUIRED',
  fieldPath: 'context.conflicts',
  ...overrides,
});

const gateNumber = (gate: Gate) => Number(gate.slice(1));
const assessmentId = (gate: Gate, n = 0) => uuid(0x100 + gateNumber(gate) * 0x10 + n);

function assessment(gate: Gate, overrides: Partial<ReadinessAssessment> = {}): ReadinessAssessment {
  return {
    id: assessmentId(gate),
    caseId: CASE,
    gate,
    supersedesAssessmentId: null,
    ...EPOCH,
    result: 'PASS',
    scopeState: 'SCOPE_CONFIRMED_FOR_CANDIDATE',
    performerLabel: 'SYNTHETIC reviewer, reviewer capacity',
    rationale: 'SYNTHETIC rationale',
    scopeText: 'SYNTHETIC scope',
    provenance: 'DOCUMENT_REVIEWED',
    assessedAt: at(-HOUR),
    askDispositions: null,
    ...overrides,
  };
}

const support = (overrides: Partial<SupportRecord> = {}): SupportRecord => ({
  caseSourceId: LINK_A,
  caseId: CASE,
  linkState: 'LINKED',
  sourceId: SOURCE_A,
  ...overrides,
});

/** A READY_FOR_SIGNER input: a full TECHNICAL_PASS of E and six confirmed PASS heads of E. */
function readyInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  const assessments = overrides.assessments ?? GATES.map((gate) => assessment(gate));
  return {
    candidate: {
      id: CANDIDATE,
      subject: SUBJECT,
      bodyText: BODY,
      bodySha256: exactTextSha256(BODY),
      artifactSha256: ARTIFACT,
      envelope: ENVELOPE,
      preparedDocuments: [],
      signatureState: 'HUMAN_PENDING',
      superseded: false,
    },
    caseId: CASE,
    context: {
      caseArchived: false,
      taskType: 'INITIAL',
      generationMode: 'DRAFTING',
      parentBindingId: null,
      dependencyDigest: DIGEST,
      blockingMissing: [],
      missingCount: 0,
      conflictCount: 0,
      tooLarge: false,
      listedSourceApplies: new Map([
        [SOURCE_A, true],
        [SOURCE_B, false],
      ]),
      authority: NO_AUTHORITY,
    },
    ruleset: RULESET,
    runs: [run(uuid(0x50))],
    issues: new Map([[uuid(0x50), []]]),
    assessments,
    supports: new Map(assessments.map((row) => [row.id, [support()]])),
    askSourceApplies: new Map(),
    ...overrides,
  };
}

const withContext = (overrides: Partial<ReadinessInput['context']>) => {
  const base = readyInput();
  return readyInput({ context: { ...base.context, ...overrides } });
};

/** Six PASS heads with one gate's head replaced. */
const withGate = (gate: Gate, overrides: Partial<ReadinessAssessment>) =>
  readyInput({
    assessments: GATES.map((each) =>
      each === gate ? assessment(each, overrides) : assessment(each),
    ),
  });

const evaluate = (input: ReadinessInput, now = NOW) => evaluateReadiness(input, now).readiness;
const gateOf = (input: ReadinessInput, gate: Gate, now = NOW) =>
  evaluateGate(gate, input, readinessEpoch(input.candidate, input.context, RULESET), now).summary;

describe('reason codes: stable identifiers in a pinned order, no record content', () => {
  it('pins the readiness order', () => {
    expect(READINESS_REASON_ORDER).toEqual([
      'CANDIDATE_SUPERSEDED',
      'CASE_ARCHIVED',
      'PREPARATION_MODE',
      'CONTEXT_INPUT_MISSING',
      'CONTEXT_TOO_LARGE',
      'ARTIFACT_INTEGRITY_FAILED',
      'SIGNATURE_SLOT_INVALID',
      'VALIDATION_MISSING',
      'VALIDATION_STALE',
      'VALIDATION_BLOCKED',
      'VALIDATION_ERROR',
      'TECHNICAL_RUN_CONFLICT',
      'VALIDATION_REVIEW_REQUIRED',
      'PLAN_SOURCE_NOT_IN_CONTEXT',
      'VALIDATION_COVERAGE_INCOMPLETE',
      'CONTEXT_MISSING_ITEMS',
      'CONTEXT_CONFLICTS',
      'AUTHORITY_EFFECTIVE_DATE_NOT_REACHED',
      'G1_BLOCKED',
      'G1_CONFLICT',
      'G1_MISSING',
      'G1_HOLD',
      'G1_UNASSESSED',
      'G2_BLOCKED',
      'G2_CONFLICT',
      'G2_MISSING',
      'G2_HOLD',
      'G2_UNASSESSED',
      'G3_BLOCKED',
      'G3_CONFLICT',
      'G3_MISSING',
      'G3_HOLD',
      'G3_UNASSESSED',
      'G4_BLOCKED',
      'G4_CONFLICT',
      'G4_MISSING',
      'G4_HOLD',
      'G4_UNASSESSED',
      'G5_BLOCKED',
      'G5_CONFLICT',
      'G5_MISSING',
      'G5_HOLD',
      'G5_UNASSESSED',
      'G6_BLOCKED',
      'G6_CONFLICT',
      'G6_MISSING',
      'G6_HOLD',
      'G6_UNASSESSED',
      'ASSESSMENT_INTEGRITY_FAILED',
      'ASSESSMENT_STALE',
      'G1_TEMPORAL_REVIEW_STALE',
      'GATE_HEADS_UNRECONCILED',
      'SCOPE_NOT_CONFIRMED',
      'ASSESSMENT_RECORD_INCOMPLETE',
      'ASSESSMENT_PROVENANCE_UNSUPPORTED',
      'G1_REVIEW_TIME_UNKNOWN',
      'TEMPORAL_BOUNDARY_AMBIGUOUS',
      'G6_ASK_DISPOSITIONS_MISSING',
      'G6_ASK_REQUIRES_DOCUMENT',
      'G6_ASK_MISSING_FACT',
      'G6_ASK_LEGAL_REVIEW_REQUIRED',
      'G6_ASK_SOURCE_NOT_APPLICABLE',
    ]);
  });

  it('pins the gate order', () => {
    expect(GATE_REASON_ORDER).toEqual([
      'GATE_BLOCKED',
      'GATE_CONFLICT',
      'GATE_MISSING',
      'GATE_HOLD',
      'GATE_UNASSESSED',
      'ASSESSMENT_INTEGRITY_FAILED',
      'ASSESSMENT_STALE',
      'G1_TEMPORAL_REVIEW_STALE',
      'GATE_HEADS_UNRECONCILED',
      'SCOPE_NOT_CONFIRMED',
      'ASSESSMENT_RECORD_INCOMPLETE',
      'ASSESSMENT_PROVENANCE_UNSUPPORTED',
      'G1_REVIEW_TIME_UNKNOWN',
      'TEMPORAL_BOUNDARY_AMBIGUOUS',
      'G6_ASK_DISPOSITIONS_MISSING',
      'G6_ASK_REQUIRES_DOCUMENT',
      'G6_ASK_MISSING_FACT',
      'G6_ASK_LEGAL_REVIEW_REQUIRED',
      'G6_ASK_SOURCE_NOT_APPLICABLE',
    ]);
  });

  it('every reason code the server reports has its own neutral copy on the candidate page (readiness.tsx REASON_TEXT; a gate status code is worded from its gate)', () => {
    const page = readFileSync(path.join(repoRoot, 'apps/web/src/app/cases/readiness.tsx'), 'utf8');
    const block = /const REASON_TEXT[^=]*=\s*\{([\s\S]*?)\n\};/.exec(page)?.[1] ?? '';
    const worded = new Set([...block.matchAll(/^ {2}([A-Z0-9_]+):/gm)].map((match) => match[1]));
    expect(worded.size).toBeGreaterThan(20);
    for (const code of [...READINESS_REASON_ORDER, ...GATE_REASON_ORDER]) {
      if (/^G[1-6]_(BLOCKED|CONFLICT|MISSING|HOLD|UNASSESSED)$/.test(code)) continue;
      expect(worded.has(code), code).toBe(true);
    }
  });

  it('includes the mission minimum set (gate-qualified at the readiness level, GATE_* per gate)', () => {
    for (const code of [
      'CANDIDATE_SUPERSEDED',
      'VALIDATION_MISSING',
      'VALIDATION_STALE',
      'VALIDATION_BLOCKED',
      'VALIDATION_ERROR',
      'VALIDATION_REVIEW_REQUIRED',
      'VALIDATION_COVERAGE_INCOMPLETE',
      'TECHNICAL_RUN_CONFLICT',
      'ASSESSMENT_STALE',
      ...GATES.map((gate) => `${gate}_UNASSESSED`),
      'SCOPE_NOT_CONFIRMED',
      'G1_TEMPORAL_REVIEW_STALE',
      'TEMPORAL_BOUNDARY_AMBIGUOUS',
      'AUTHORITY_EFFECTIVE_DATE_NOT_REACHED',
      'SIGNATURE_SLOT_INVALID',
    ]) {
      expect(READINESS_REASON_ORDER).toContain(code);
    }
    for (const code of ['GATE_HOLD', 'GATE_BLOCKED', 'GATE_MISSING', 'GATE_CONFLICT']) {
      expect(GATE_REASON_ORDER).toContain(code);
    }
    for (const code of [...READINESS_REASON_ORDER, ...GATE_REASON_ORDER]) {
      expect(code).toMatch(/^[A-Z0-9_]{1,100}$/);
    }
  });
});

describe('status tiers (ADR-0011 Decision 3): the strongest tier decides; READY only without a reason', () => {
  const status = (...codes: string[]) => statusOf(new Set(codes));

  it('no reason is READY_FOR_SIGNER; any other reason needs a review', () => {
    expect(status()).toBe('READY_FOR_SIGNER');
    expect(status('CONTEXT_CONFLICTS')).toBe('REVIEW_REQUIRED');
    expect(status('G3_HOLD')).toBe('REVIEW_REQUIRED');
    expect(status('G3_UNASSESSED')).toBe('REVIEW_REQUIRED');
    expect(status('TECHNICAL_RUN_CONFLICT')).toBe('REVIEW_REQUIRED');
  });

  it('orders SUPERSEDED > scope BLOCKED > UNVALIDATED > STALE (run) > BLOCKED (epoch) > STALE (reviews) > REVIEW_REQUIRED', () => {
    expect(status('CANDIDATE_SUPERSEDED', 'CASE_ARCHIVED', 'VALIDATION_MISSING')).toBe(
      'SUPERSEDED',
    );
    expect(status('PREPARATION_MODE', 'VALIDATION_MISSING')).toBe('BLOCKED');
    expect(status('SIGNATURE_SLOT_INVALID', 'VALIDATION_STALE')).toBe('BLOCKED');
    expect(status('VALIDATION_MISSING', 'G1_UNASSESSED')).toBe('UNVALIDATED');
    expect(status('VALIDATION_STALE', 'G2_BLOCKED')).toBe('STALE_REVALIDATION_REQUIRED');
    expect(status('VALIDATION_BLOCKED', 'ASSESSMENT_STALE')).toBe('BLOCKED');
    expect(status('G4_BLOCKED', 'G1_TEMPORAL_REVIEW_STALE')).toBe('BLOCKED');
    expect(status('ASSESSMENT_STALE', 'G2_HOLD', 'CONTEXT_CONFLICTS')).toBe(
      'STALE_REVALIDATION_REQUIRED',
    );
    expect(status('G1_TEMPORAL_REVIEW_STALE', 'G1_UNASSESSED')).toBe('STALE_REVALIDATION_REQUIRED');
  });
});

describe('the current epoch and the technical baseline (Decisions 1, 4, 5)', () => {
  it('derives E from the candidate, the current digest and the server ruleset — nothing else', () => {
    expect(
      readinessEpoch(
        { id: CANDIDATE, artifactSha256: ARTIFACT },
        { dependencyDigest: DIGEST },
        RULESET,
      ),
    ).toEqual(EPOCH);
  });

  it('counts only runs of exactly E, latest recorded first (createdAt DESC, id DESC)', () => {
    const runs = [
      run(uuid(0x51), { createdAt: at(-3 * HOUR) }),
      run(uuid(0x52), { createdAt: at(-HOUR) }),
      run(uuid(0x53), { createdAt: at(-HOUR) }),
      run(uuid(0x54), { dependencyDigest: OLD_DIGEST }),
      run(uuid(0x55), { rulesetVersion: 'TB-TECHNICAL-RULESET-v2' }),
      run(uuid(0x56), { artifactSha256: 'f'.repeat(64) }),
      run(uuid(0x57), { candidateId: OTHER_CANDIDATE }),
    ];
    expect(epochRuns(runs, EPOCH).map((row) => row.id)).toEqual([
      uuid(0x53),
      uuid(0x52),
      uuid(0x51),
    ]);
  });

  it('no run at all is VALIDATION_MISSING; runs of other epochs only (a v1/v2 run included) are VALIDATION_STALE', () => {
    expect([...technicalOutcome([], new Map(), EPOCH, RULESET).codes]).toEqual([
      'VALIDATION_MISSING',
    ]);
    const stale = [
      run(uuid(0x51), { dependencyDigest: OLD_DIGEST }),
      run(uuid(0x52), { rulesetVersion: 'TB-TECHNICAL-RULESET-v2' }),
      run(uuid(0x53), { rulesetVersion: 'TB-TECHNICAL-RULESET-v1' }),
    ];
    const outcome = technicalOutcome(stale, new Map(), EPOCH, RULESET);
    expect(outcome.counted).toBeNull();
    expect([...outcome.codes]).toEqual(['VALIDATION_STALE']);
  });

  it('a full TECHNICAL_PASS of E counts with no reason; equivalent runs → the latest counts', () => {
    const runs = [
      run(uuid(0x51), { createdAt: at(-3 * HOUR) }),
      run(uuid(0x52), { createdAt: at(-HOUR) }),
    ];
    const issues = new Map(runs.map((row) => [row.id, [] as IssueRecord[]]));
    const outcome = technicalOutcome(runs, issues, EPOCH, RULESET);
    expect(outcome.counted?.id).toBe(uuid(0x52));
    expect([...outcome.codes]).toEqual([]);
  });

  it('maps the counted result: BLOCKED → VALIDATION_BLOCKED, ERROR → VALIDATION_ERROR, REVIEW_REQUIRED → VALIDATION_REVIEW_REQUIRED', () => {
    const one = (result: RunRecord['result'], issues: IssueRecord[] = []) => [
      ...technicalOutcome(
        [run(uuid(0x51), { result })],
        new Map([[uuid(0x51), issues]]),
        EPOCH,
        RULESET,
      ).codes,
    ];
    expect(one('BLOCKED', [issue({ severity: 'BLOCKER' })])).toEqual(['VALIDATION_BLOCKED']);
    expect(one('ERROR', [issue({ severity: 'BLOCKER' })])).toEqual(['VALIDATION_ERROR']);
    expect(one('REVIEW_REQUIRED', [issue()])).toEqual(['VALIDATION_REVIEW_REQUIRED']);
  });

  it('never overlooks a stored BLOCKER or REVIEW_REQUIRED issue of the counted run, whatever its recorded result', () => {
    const codes = (issues: IssueRecord[]) => [
      ...technicalOutcome([run(uuid(0x51))], new Map([[uuid(0x51), issues]]), EPOCH, RULESET).codes,
    ];
    expect(codes([issue({ severity: 'BLOCKER' })])).toEqual(['VALIDATION_BLOCKED']);
    expect(codes([issue({ severity: 'REVIEW_REQUIRED', checkKind: 'HEURISTIC' })])).toEqual([
      'VALIDATION_REVIEW_REQUIRED',
    ]);
    expect(codes([issue({ severity: 'WARNING' }), issue({ severity: 'INFO' })])).toEqual([]);
  });

  it('PLAN.SOURCE_IN_CONTEXT is named and never waived (ADR-0008 Decision 2)', () => {
    const outcome = technicalOutcome(
      [run(uuid(0x51), { result: 'REVIEW_REQUIRED' })],
      new Map([
        [
          uuid(0x51),
          [issue({ ruleId: 'PLAN.SOURCE_IN_CONTEXT', fieldPath: 'preparedDocuments.0.sourceId' })],
        ],
      ]),
      EPOCH,
      RULESET,
    );
    expect([...outcome.codes]).toEqual([
      'VALIDATION_REVIEW_REQUIRED',
      'PLAN_SOURCE_NOT_IN_CONTEXT',
    ]);
  });

  it('a TECHNICAL_PASS counts only with every required rule executed and none not executed', () => {
    expect(coverageComplete(FULL_COVERAGE, RULESET.requiredRuleIds)).toBe(true);
    expect(
      coverageComplete(
        { ...FULL_COVERAGE, notExecutedRuleIds: ['ENVELOPE.REPLY_RECIPIENT'] },
        RULESET.requiredRuleIds,
      ),
    ).toBe(false);
    expect(
      coverageComplete(
        { ...FULL_COVERAGE, executedRuleIds: RULESET.requiredRuleIds.slice(1) },
        RULESET.requiredRuleIds,
      ),
    ).toBe(false);
    expect(coverageComplete(null, RULESET.requiredRuleIds)).toBe(false);
    expect(coverageComplete({ executedRuleIds: 'x' }, RULESET.requiredRuleIds)).toBe(false);
    const outcome = technicalOutcome(
      [run(uuid(0x51), { coverageManifest: { ...FULL_COVERAGE, notExecutedRuleIds: ['X'] } })],
      new Map([[uuid(0x51), []]]),
      EPOCH,
      RULESET,
    );
    expect(outcome.counted?.id).toBe(uuid(0x51));
    expect([...outcome.codes]).toEqual(['VALIDATION_COVERAGE_INCOMPLETE']);
  });

  it('completed runs of E that disagree → TECHNICAL_RUN_CONFLICT; none counts, never the latest PASS; a BLOCKED one among them decides BLOCKED (R-28)', () => {
    const pass = run(uuid(0x51), { createdAt: at(-HOUR) });
    const review = run(uuid(0x52), { result: 'REVIEW_REQUIRED', createdAt: at(-2 * HOUR) });
    const blocked = run(uuid(0x53), { result: 'BLOCKED', createdAt: at(-3 * HOUR) });
    const issues = new Map<string, IssueRecord[]>([
      [pass.id, []],
      [review.id, [issue()]],
      [blocked.id, [issue({ severity: 'BLOCKER' })]],
    ]);
    const conflict = technicalOutcome([pass, review], issues, EPOCH, RULESET);
    expect(conflict.counted).toBeNull();
    expect([...conflict.codes].sort()).toEqual([
      'TECHNICAL_RUN_CONFLICT',
      'VALIDATION_REVIEW_REQUIRED',
    ]);
    expect(statusOf(conflict.codes)).toBe('REVIEW_REQUIRED');
    const worse = technicalOutcome([pass, blocked], issues, EPOCH, RULESET);
    expect(worse.counted).toBeNull();
    expect([...worse.codes].sort()).toEqual(['TECHNICAL_RUN_CONFLICT', 'VALIDATION_BLOCKED']);
    expect(statusOf(worse.codes)).toBe('BLOCKED');
    const both = technicalOutcome([review, blocked], issues, EPOCH, RULESET);
    expect(both.counted).toBeNull();
    expect([...both.codes].sort()).toEqual([
      'TECHNICAL_RUN_CONFLICT',
      'VALIDATION_BLOCKED',
      'VALIDATION_REVIEW_REQUIRED',
    ]);
    expect(statusOf(both.codes)).toBe('BLOCKED');
  });

  it('compares the material outcome only: a deterministic field or coverage difference conflicts; messages and heuristic issues do not', () => {
    const a = run(uuid(0x51), { result: 'REVIEW_REQUIRED' });
    const b = run(uuid(0x52), { result: 'REVIEW_REQUIRED', createdAt: at(-HOUR) });
    const differentField = new Map([
      [a.id, [issue({ fieldPath: 'sources.0' })]],
      [b.id, [issue({ fieldPath: 'sources.1' })]],
    ]);
    expect(
      technicalOutcome([a, b], differentField, EPOCH, RULESET).codes.has('TECHNICAL_RUN_CONFLICT'),
    ).toBe(true);
    const heuristicOnly = new Map([
      [a.id, [issue(), issue({ checkKind: 'HEURISTIC', ruleId: 'WORDING.ATTACHMENT_CLAIM' })]],
      [b.id, [issue()]],
    ]);
    const same = technicalOutcome([a, b], heuristicOnly, EPOCH, RULESET);
    expect(same.codes.has('TECHNICAL_RUN_CONFLICT')).toBe(false);
    expect(same.counted?.id).toBe(b.id);
    const coverage = technicalOutcome(
      [
        run(uuid(0x51)),
        run(uuid(0x52), {
          coverageManifest: {
            ...FULL_COVERAGE,
            executedRuleIds: [...RULESET.requiredRuleIds].reverse(),
          },
        }),
      ],
      new Map([
        [uuid(0x51), []],
        [uuid(0x52), []],
      ]),
      EPOCH,
      RULESET,
    );
    expect(coverage.codes.has('TECHNICAL_RUN_CONFLICT')).toBe(true);
  });

  it('refuses to evaluate a run of E whose issues were not read (a loader error is never a clean run)', () => {
    expect(() => technicalOutcome([run(uuid(0x51))], new Map(), EPOCH, RULESET)).toThrow(
      /not read/,
    );
  });
});

describe('same-epoch run recovery (R14-AUD-015): a run that did not complete is a diagnostic, never a permanent poison', () => {
  const REQUIRED = RULESET.requiredRuleIds;
  const FAILED_RULE = 'ENVELOPE.SENDER';
  /** What the engine stores for a rule that failed while running, or was not executed. */
  const INCOMPLETE = {
    ...FULL_COVERAGE,
    executedRuleIds: REQUIRED.filter((id) => id !== FAILED_RULE),
    notExecutedRuleIds: [FAILED_RULE],
  };
  const hoursAgo = (hours: number) => at(-hours * HOUR);
  const passed = (n: number, hours: number) => run(uuid(n), { createdAt: hoursAgo(hours) });
  const errored = (n: number, hours: number) =>
    run(uuid(n), { result: 'ERROR', coverageManifest: INCOMPLETE, createdAt: hoursAgo(hours) });
  /** A REVIEW_REQUIRED run because a required rule was not executed. */
  const notExecuted = (n: number, hours: number) =>
    run(uuid(n), {
      result: 'REVIEW_REQUIRED',
      coverageManifest: INCOMPLETE,
      createdAt: hoursAgo(hours),
    });
  const completedAs = (n: number, hours: number, result: RunRecord['result']) =>
    run(uuid(n), { result, createdAt: hoursAgo(hours) });
  /** The issues the engine stores for each kind of run above. */
  const issuesOf = (row: RunRecord): IssueRecord[] => {
    if (row.result === 'ERROR') {
      return [issue({ ruleId: FAILED_RULE, severity: 'BLOCKER', fieldPath: null })];
    }
    if (row.result === 'BLOCKED') return [issue({ severity: 'BLOCKER' })];
    if (row.result === 'REVIEW_REQUIRED') {
      return row.coverageManifest === INCOMPLETE
        ? [issue({ ruleId: FAILED_RULE, fieldPath: null })]
        : [issue()];
    }
    return [];
  };
  const outcomeOf = (runs: RunRecord[]) => {
    const outcome = technicalOutcome(
      runs,
      new Map(runs.map((row) => [row.id, issuesOf(row)])),
      EPOCH,
      RULESET,
    );
    return {
      counted: outcome.counted?.id ?? null,
      codes: [...outcome.codes].sort(),
      status: statusOf(outcome.codes),
    };
  };
  const ERROR_CODES = ['VALIDATION_COVERAGE_INCOMPLETE', 'VALIDATION_ERROR'];

  it('a completed run is one whose result is not ERROR and whose coverage shows every required rule executed and none not executed', () => {
    expect(runCompleted(passed(0x51, 1), RULESET)).toBe(true);
    expect(runCompleted(completedAs(0x52, 1, 'BLOCKED'), RULESET)).toBe(true);
    expect(runCompleted(completedAs(0x53, 1, 'REVIEW_REQUIRED'), RULESET)).toBe(true);
    expect(runCompleted(errored(0x54, 1), RULESET)).toBe(false);
    // An ERROR is never complete, even with a coverage manifest that looks complete.
    expect(runCompleted(completedAs(0x55, 1, 'ERROR'), RULESET)).toBe(false);
    expect(runCompleted(notExecuted(0x56, 1), RULESET)).toBe(false);
    // A (corrupted) TECHNICAL_PASS lacking a required rule is not complete either.
    expect(
      runCompleted(
        run(uuid(0x57), {
          coverageManifest: { ...FULL_COVERAGE, executedRuleIds: REQUIRED.slice(1) },
        }),
        RULESET,
      ),
    ).toBe(false);
  });

  it('ERROR only → BLOCKED: the latest ERROR counts as the diagnostic it is; ERROR runs are never compared with each other', () => {
    expect(outcomeOf([errored(0x51, 1)])).toEqual({
      counted: uuid(0x51),
      codes: ERROR_CODES,
      status: 'BLOCKED',
    });
    const other = run(uuid(0x52), {
      result: 'ERROR',
      coverageManifest: { ...INCOMPLETE, notExecutedRuleIds: ['ARTIFACT.SHAPE'] },
      createdAt: hoursAgo(2),
    });
    expect(outcomeOf([errored(0x51, 1), other])).toEqual({
      counted: uuid(0x51),
      codes: ERROR_CODES,
      status: 'BLOCKED',
    });
  });

  it('ERROR → a run with a rule not executed → never READY: the latest run counts and is incomplete', () => {
    expect(outcomeOf([errored(0x51, 3), notExecuted(0x52, 1)])).toEqual({
      counted: uuid(0x52),
      codes: ['VALIDATION_COVERAGE_INCOMPLETE', 'VALIDATION_REVIEW_REQUIRED'],
      status: 'REVIEW_REQUIRED',
    });
    const corruptedPass = run(uuid(0x53), {
      coverageManifest: { ...FULL_COVERAGE, notExecutedRuleIds: [FAILED_RULE] },
      createdAt: hoursAgo(1),
    });
    expect(outcomeOf([errored(0x51, 3), corruptedPass])).toEqual({
      counted: uuid(0x53),
      codes: ['VALIDATION_COVERAGE_INCOMPLETE'],
      status: 'REVIEW_REQUIRED',
    });
  });

  it('ERROR → a completed TECHNICAL_PASS → the PASS counts; earlier diagnostics stay history and poison nothing', () => {
    expect(outcomeOf([errored(0x51, 3), passed(0x52, 1)])).toEqual({
      counted: uuid(0x52),
      codes: [],
      status: 'READY_FOR_SIGNER',
    });
    expect(
      outcomeOf([errored(0x51, 5), notExecuted(0x52, 4), errored(0x53, 3), passed(0x54, 1)]),
    ).toEqual({ counted: uuid(0x54), codes: [], status: 'READY_FOR_SIGNER' });
    // A completed run that is not a pass counts the same way after an ERROR.
    expect(outcomeOf([errored(0x51, 3), completedAs(0x52, 1, 'BLOCKED')])).toEqual({
      counted: uuid(0x52),
      codes: ['VALIDATION_BLOCKED'],
      status: 'BLOCKED',
    });
  });

  it('PASS → a newer ERROR or a newer run with a rule not executed → not READY: the newer run counts, no older PASS is relied on', () => {
    expect(outcomeOf([passed(0x51, 3), errored(0x52, 1)])).toEqual({
      counted: uuid(0x52),
      codes: ERROR_CODES,
      status: 'BLOCKED',
    });
    expect(outcomeOf([passed(0x51, 3), notExecuted(0x52, 1)])).toEqual({
      counted: uuid(0x52),
      codes: ['VALIDATION_COVERAGE_INCOMPLETE', 'VALIDATION_REVIEW_REQUIRED'],
      status: 'REVIEW_REQUIRED',
    });
    // Several agreeing PASS runs before it change nothing.
    expect(outcomeOf([passed(0x51, 5), passed(0x52, 3), errored(0x53, 1)]).counted).toBe(
      uuid(0x53),
    );
  });

  it('PASS → ERROR → PASS → the latest completed PASS counts', () => {
    expect(outcomeOf([passed(0x51, 5), errored(0x52, 3), passed(0x53, 1)])).toEqual({
      counted: uuid(0x53),
      codes: [],
      status: 'READY_FOR_SIGNER',
    });
  });

  it('equal createdAt: id DESC decides which run is the latest, whatever the input order', () => {
    const tie = (errorId: number, passId: number) => [errored(errorId, 1), passed(passId, 1)];
    for (const runs of [tie(0x5a, 0x59), [...tie(0x5a, 0x59)].reverse()]) {
      expect(outcomeOf(runs)).toEqual({
        counted: uuid(0x5a),
        codes: ERROR_CODES,
        status: 'BLOCKED',
      });
    }
    for (const runs of [tie(0x59, 0x5a), [...tie(0x59, 0x5a)].reverse()]) {
      expect(outcomeOf(runs)).toEqual({
        counted: uuid(0x5a),
        codes: [],
        status: 'READY_FOR_SIGNER',
      });
    }
  });

  it('completed runs that disagree stay TECHNICAL_RUN_CONFLICT — never "the latest PASS wins" — and a diagnostic run neither resolves nor hides the conflict', () => {
    // A newer complete PASS after an older complete BLOCKED or REVIEW_REQUIRED run.
    expect(outcomeOf([completedAs(0x51, 3, 'BLOCKED'), passed(0x52, 1)])).toEqual({
      counted: null,
      codes: ['TECHNICAL_RUN_CONFLICT', 'VALIDATION_BLOCKED'],
      status: 'BLOCKED',
    });
    expect(outcomeOf([completedAs(0x51, 3, 'REVIEW_REQUIRED'), passed(0x52, 1)])).toEqual({
      counted: null,
      codes: ['TECHNICAL_RUN_CONFLICT', 'VALIDATION_REVIEW_REQUIRED'],
      status: 'REVIEW_REQUIRED',
    });
    expect(
      outcomeOf([completedAs(0x51, 3, 'BLOCKED'), completedAs(0x52, 1, 'REVIEW_REQUIRED')]),
    ).toEqual({
      counted: null,
      codes: ['TECHNICAL_RUN_CONFLICT', 'VALIDATION_BLOCKED', 'VALIDATION_REVIEW_REQUIRED'],
      status: 'BLOCKED',
    });
    // An ERROR between them does not make the older complete run history.
    expect(outcomeOf([completedAs(0x51, 5, 'BLOCKED'), errored(0x52, 3), passed(0x53, 1)])).toEqual(
      {
        counted: null,
        codes: ['TECHNICAL_RUN_CONFLICT', 'VALIDATION_BLOCKED'],
        status: 'BLOCKED',
      },
    );
    // A newest diagnostic adds its own reasons to the conflict; nothing counts.
    expect(outcomeOf([completedAs(0x51, 5, 'BLOCKED'), passed(0x52, 3), errored(0x53, 1)])).toEqual(
      {
        counted: null,
        codes: ['TECHNICAL_RUN_CONFLICT', 'VALIDATION_BLOCKED', ...ERROR_CODES].sort(),
        status: 'BLOCKED',
      },
    );
  });

  it('the whole readiness and the export use the same derivation: ERROR → PASS is READY and exportable with the PASS; PASS → newer ERROR is BLOCKED and refused', () => {
    const recovered = evaluate(
      readyInput({
        runs: [errored(0x51, 3), run(uuid(0x50))],
        issues: new Map([
          [uuid(0x51), issuesOf(errored(0x51, 3))],
          [uuid(0x50), []],
        ]),
      }),
    );
    expect(recovered).toMatchObject({
      status: 'READY_FOR_SIGNER',
      technicalResult: 'TECHNICAL_PASS',
      validationRunId: uuid(0x50),
      reasonCodes: [],
    });
    const body = {
      expectedArtifactSha256: ARTIFACT,
      expectedDependencyDigest: DIGEST,
      validationRunId: uuid(0x50),
      format: 'PLAIN_TEXT' as const,
    };
    expect(exportRefusal(recovered, body)).toBeNull();
    // A body naming the ERROR run is refused: it is not the counted run.
    expect(exportRefusal(recovered, { ...body, validationRunId: uuid(0x51) })?.code).toBe(
      'VALIDATION_RUN_CHANGED',
    );

    const poisonedNow = evaluate(
      readyInput({
        runs: [run(uuid(0x50)), errored(0x51, 1)],
        issues: new Map([
          [uuid(0x51), issuesOf(errored(0x51, 1))],
          [uuid(0x50), []],
        ]),
      }),
    );
    expect(poisonedNow).toMatchObject({
      status: 'BLOCKED',
      technicalResult: 'ERROR',
      validationRunId: uuid(0x51),
      reasonCodes: ['VALIDATION_ERROR', 'VALIDATION_COVERAGE_INCOMPLETE'],
    });
    const refusal = exportRefusal(poisonedNow, body);
    expect([refusal?.status, refusal?.code, refusal?.details]).toEqual([
      409,
      'CANDIDATE_NOT_READY',
      { status: 'BLOCKED', reasonCodes: ['VALIDATION_ERROR', 'VALIDATION_COVERAGE_INCOMPLETE'] },
    ]);
  });
});

describe('time: captured boundaries only; a date is the interval it is that date somewhere (Decision 9)', () => {
  it('a date D is [(D−1)T10:00Z, (D+1)T12:00Z) — no invented midnight or timezone', () => {
    const window = dateWindow('2026-09-20');
    expect(new Date(window.start).toISOString()).toBe('2026-09-19T10:00:00.000Z');
    expect(new Date(window.end).toISOString()).toBe('2026-09-21T12:00:00.000Z');
    expect(() => dateWindow('2026-9-20')).toThrow();
    expect(() => dateWindow('not a date')).toThrow();
  });

  it('boundaries: the selected versions, coverages and signer associations, and each uncorrected event at its instant, else its date', () => {
    const boundaries = temporalBoundaries({
      versions: [{ effectiveOn: '2026-01-01', expiresOn: null }],
      coverages: [{ effectiveOn: null, expiresOn: '2027-01-01' }],
      coverageSigners: [{ effectiveOn: '2026-02-01', endsOn: '2026-12-31' }],
      events: [
        { id: uuid(0x61), supersedesEventId: null, effectiveAt: null, effectiveOn: '2026-05-01' },
        {
          id: uuid(0x62),
          supersedesEventId: uuid(0x61),
          effectiveAt: at(-HOUR),
          effectiveOn: '2026-06-01',
        },
        { id: uuid(0x63), supersedesEventId: null, effectiveAt: null, effectiveOn: null },
      ],
    });
    expect(boundaries).toEqual([
      { kind: 'DATE', date: '2026-01-01' },
      { kind: 'DATE', date: '2027-01-01' },
      { kind: 'DATE', date: '2026-02-01' },
      { kind: 'DATE', date: '2026-12-31' },
      { kind: 'INSTANT', at: at(-HOUR) },
    ]);
  });

  it('an instant stales the review exactly when assessedAt < e ≤ now (R-23, R-24)', () => {
    const boundary = { kind: 'INSTANT' as const, at: at(-HOUR) };
    expect(reviewTiming(boundary, at(-2 * HOUR), NOW)).toBe('STALE');
    expect(reviewTiming(boundary, at(-HOUR), NOW)).toBe('FRESH');
    expect(reviewTiming(boundary, at(-HOUR + 1), NOW)).toBe('FRESH');
    expect(reviewTiming({ kind: 'INSTANT', at: at(HOUR) }, at(-2 * HOUR), NOW)).toBe('FRESH');
    expect(reviewTiming({ kind: 'INSTANT', at: NOW }, at(-1), NOW)).toBe('STALE');
  });

  it('a date: after the window post-boundary, inside it ambiguous, before it stale once the window has passed (R-25)', () => {
    const boundary = { kind: 'DATE' as const, date: '2026-09-27' };
    // window [2026-09-26T10:00Z, 2026-09-28T12:00Z); NOW 2026-09-29T12:00Z is after it
    expect(reviewTiming(boundary, new Date('2026-09-28T12:00:00.000Z'), NOW)).toBe('FRESH');
    expect(reviewTiming(boundary, new Date('2026-09-28T11:59:59.999Z'), NOW)).toBe('AMBIGUOUS');
    expect(reviewTiming(boundary, new Date('2026-09-27T12:00:00.000Z'), NOW)).toBe('AMBIGUOUS');
    expect(reviewTiming(boundary, new Date('2026-09-26T10:00:00.000Z'), NOW)).toBe('AMBIGUOUS');
    expect(reviewTiming(boundary, new Date('2026-09-26T09:59:59.999Z'), NOW)).toBe('STALE');
    // the evaluation instant inside the window of a later date: possibly reached
    const today = { kind: 'DATE' as const, date: '2026-09-29' };
    expect(reviewTiming(today, new Date('2026-09-20T00:00:00.000Z'), NOW)).toBe('AMBIGUOUS');
    // a date still ahead everywhere: fresh
    const ahead = { kind: 'DATE' as const, date: '2026-10-02' };
    expect(reviewTiming(ahead, new Date('2026-09-20T00:00:00.000Z'), NOW)).toBe('FRESH');
  });

  it('a missing review time is never replaced by the recording time: unknown once a boundary is possibly reached (Decision 9)', () => {
    expect(reviewTiming({ kind: 'INSTANT', at: at(-HOUR) }, null, NOW)).toBe('UNKNOWN');
    expect(reviewTiming({ kind: 'INSTANT', at: at(HOUR) }, null, NOW)).toBe('FRESH');
    expect(reviewTiming({ kind: 'DATE', date: '2026-09-29' }, null, NOW)).toBe('UNKNOWN');
    expect(reviewTiming({ kind: 'DATE', date: '2026-10-02' }, null, NOW)).toBe('FRESH');
    // a review time after the evaluation instant cannot be placed either
    expect(reviewTiming({ kind: 'INSTANT', at: at(-HOUR) }, at(HOUR), NOW)).toBe('UNKNOWN');
    expect(
      reviewTiming({ kind: 'DATE', date: '2026-09-01' }, new Date('2099-01-01T00:00:00.000Z'), NOW),
    ).toBe('UNKNOWN');
  });

  it('collects the causes of every boundary', () => {
    const causes = g1TemporalCauses(
      [
        { kind: 'INSTANT', at: at(-HOUR) },
        { kind: 'DATE', date: '2026-09-29' },
      ],
      at(-2 * HOUR),
      NOW,
    );
    expect([...causes].sort()).toEqual(['G1_TEMPORAL_REVIEW_STALE', 'TEMPORAL_BOUNDARY_AMBIGUOUS']);
    expect([...g1TemporalCauses([], null, NOW)]).toEqual([]);
  });

  it('a selected start date ahead everywhere is AUTHORITY_EFFECTIVE_DATE_NOT_REACHED; on its date somewhere TEMPORAL_BOUNDARY_AMBIGUOUS; an event date is no start', () => {
    const times = (effectiveOn: string): AuthorityRecordTimes => ({
      ...NO_AUTHORITY,
      coverages: [{ effectiveOn, expiresOn: null }],
    });
    expect([...effectiveDateCodes(times('2026-10-01'), NOW)]).toEqual([
      'AUTHORITY_EFFECTIVE_DATE_NOT_REACHED',
    ]);
    expect([...effectiveDateCodes(times('2026-09-30'), NOW)]).toEqual([
      'TEMPORAL_BOUNDARY_AMBIGUOUS',
    ]);
    expect([...effectiveDateCodes(times('2026-09-29'), NOW)]).toEqual([
      'TEMPORAL_BOUNDARY_AMBIGUOUS',
    ]);
    // 2026-09-28 ends everywhere at 2026-09-29T12:00:00.000Z (UTC−12:00), exactly NOW
    expect([...effectiveDateCodes(times('2026-09-28'), at(-1))]).toEqual([
      'TEMPORAL_BOUNDARY_AMBIGUOUS',
    ]);
    expect([...effectiveDateCodes(times('2026-09-28'), NOW)]).toEqual([]);
    expect([...effectiveDateCodes(times('2026-09-27'), NOW)]).toEqual([]);
    expect([
      ...effectiveDateCodes(
        { ...NO_AUTHORITY, versions: [{ effectiveOn: '2027-01-01', expiresOn: null }] },
        NOW,
      ),
    ]).toEqual(['AUTHORITY_EFFECTIVE_DATE_NOT_REACHED']);
    expect([
      ...effectiveDateCodes(
        { ...NO_AUTHORITY, coverageSigners: [{ effectiveOn: '2027-01-01', endsOn: null }] },
        NOW,
      ),
    ]).toEqual(['AUTHORITY_EFFECTIVE_DATE_NOT_REACHED']);
    expect([
      ...effectiveDateCodes(
        {
          ...NO_AUTHORITY,
          events: [
            {
              id: uuid(0x61),
              supersedesEventId: null,
              effectiveAt: null,
              effectiveOn: '2027-01-01',
            },
          ],
        },
        NOW,
      ),
    ]).toEqual([]);
  });
});

describe('gates (Decisions 6–8): exact heads, never the latest PASS, no compensation', () => {
  it('a confirmed PASS head of E with intact supports is PASS with its id', () => {
    expect(gateOf(readyInput(), 'G3')).toEqual({
      gate: 'G3',
      status: 'PASS',
      assessmentId: assessmentId('G3'),
      reasonCodes: [],
    });
  });

  it('never assessed → UNASSESSED; assessments of other epochs only → UNASSESSED with ASSESSMENT_STALE (R-17)', () => {
    const none = readyInput({
      assessments: GATES.filter((gate) => gate !== 'G2').map((gate) => assessment(gate)),
    });
    expect(gateOf(none, 'G2')).toEqual({
      gate: 'G2',
      status: 'UNASSESSED',
      assessmentId: null,
      reasonCodes: ['GATE_UNASSESSED'],
    });
    const stale = withGate('G1', { dependencyDigest: OLD_DIGEST });
    expect(gateOf(stale, 'G1')).toEqual({
      gate: 'G1',
      status: 'UNASSESSED',
      assessmentId: null,
      reasonCodes: ['GATE_UNASSESSED', 'ASSESSMENT_STALE'],
    });
    const readiness = evaluate(stale);
    expect(readiness.status).toBe('STALE_REVALIDATION_REQUIRED');
    expect(readiness.reasonCodes).toEqual(['G1_UNASSESSED', 'ASSESSMENT_STALE']);
  });

  it('two current heads → CONFLICT without an id — never the latest or the PASS (R-15)', () => {
    const input = readyInput({
      assessments: [
        ...GATES.map((gate) => assessment(gate)),
        assessment('G4', { id: assessmentId('G4', 1), result: 'HOLD' }),
      ],
    });
    expect(gateOf(input, 'G4')).toEqual({
      gate: 'G4',
      status: 'CONFLICT',
      assessmentId: null,
      reasonCodes: ['GATE_CONFLICT', 'GATE_HEADS_UNRECONCILED'],
    });
    const twoPasses = readyInput({
      assessments: [
        ...GATES.map((gate) => assessment(gate)),
        assessment('G4', { id: assessmentId('G4', 1) }),
      ],
    });
    expect(evaluate(twoPasses).status).toBe('REVIEW_REQUIRED');
    expect(evaluate(twoPasses).reasonCodes).toEqual(['G4_CONFLICT', 'GATE_HEADS_UNRECONCILED']);
  });

  it('an explicit successor replaces its predecessor: only the successor counts (R-16)', () => {
    const predecessor = assessment('G5', { result: 'HOLD' });
    const successor = assessment('G5', {
      id: assessmentId('G5', 1),
      supersedesAssessmentId: predecessor.id,
    });
    const input = readyInput({
      assessments: [
        ...GATES.filter((gate) => gate !== 'G5').map((gate) => assessment(gate)),
        predecessor,
        successor,
      ],
      supports: new Map([
        ...GATES.map((gate) => [assessmentId(gate), [support()]] as const),
        [successor.id, [support()]],
      ]),
    });
    expect(gateOf(input, 'G5')).toMatchObject({ status: 'PASS', assessmentId: successor.id });
    const reversed = readyInput({
      assessments: [
        ...GATES.filter((gate) => gate !== 'G5').map((gate) => assessment(gate)),
        assessment('G5'),
        assessment('G5', {
          id: assessmentId('G5', 1),
          result: 'HOLD',
          supersedesAssessmentId: assessmentId('G5'),
        }),
      ],
    });
    expect(gateOf(reversed, 'G5')).toMatchObject({
      status: 'HOLD',
      assessmentId: assessmentId('G5', 1),
    });
  });

  it('maps a single head: HOLD, BLOCKED, MISSING, CONFLICT as recorded; PASS not adopted → HOLD SCOPE_NOT_CONFIRMED (R-18)', () => {
    for (const result of ['HOLD', 'BLOCKED', 'MISSING', 'CONFLICT'] as const) {
      expect(gateOf(withGate('G2', { result }), 'G2')).toEqual({
        gate: 'G2',
        status: result,
        assessmentId: assessmentId('G2'),
        reasonCodes: [`GATE_${result}`],
      });
    }
    expect(gateOf(withGate('G2', { scopeState: 'RECORDED_NOT_ADOPTED' }), 'G2')).toEqual({
      gate: 'G2',
      status: 'HOLD',
      assessmentId: assessmentId('G2'),
      reasonCodes: ['GATE_HOLD', 'SCOPE_NOT_CONFIRMED'],
    });
  });

  it("another candidate's assessments never count, whatever their artifact (R-19)", () => {
    const input = readyInput({
      assessments: [
        ...GATES.filter((gate) => gate !== 'G3').map((gate) => assessment(gate)),
        assessment('G3', { candidateId: OTHER_CANDIDATE }),
      ],
    });
    expect(gateOf(input, 'G3')).toEqual({
      gate: 'G3',
      status: 'UNASSESSED',
      assessmentId: null,
      reasonCodes: ['GATE_UNASSESSED'],
    });
  });

  it('a PASS needs intact supports: 1–100 rows of this case, LINKED now, listed as applying (else BLOCKED)', () => {
    const blocked = (rows: SupportRecord[] | undefined) => {
      const base = readyInput();
      const supports = new Map(base.supports);
      if (rows === undefined) supports.delete(assessmentId('G2'));
      else supports.set(assessmentId('G2'), rows);
      return gateOf(readyInput({ supports }), 'G2');
    };
    const failure = {
      gate: 'G2',
      status: 'BLOCKED',
      assessmentId: assessmentId('G2'),
      reasonCodes: ['GATE_BLOCKED', 'ASSESSMENT_INTEGRITY_FAILED'],
    };
    expect(blocked(undefined)).toEqual(failure);
    expect(blocked([])).toEqual(failure);
    expect(blocked(Array.from({ length: 101 }, () => support()))).toEqual(failure);
    expect(blocked([support({ caseId: OTHER_CASE })])).toEqual(failure);
    expect(blocked([support({ linkState: 'PAUSED' })])).toEqual(failure);
    expect(blocked([support({ linkState: 'UNLINKED' })])).toEqual(failure);
    expect(blocked([support({ sourceId: SOURCE_B })])).toEqual(failure);
    expect(blocked([support({ sourceId: uuid(0x99) })])).toEqual(failure);
    expect(blocked(Array.from({ length: 100 }, () => support()))).toMatchObject({ status: 'PASS' });
  });

  it('a PASS needs visible attribution and a provenance that does not contradict it (else HOLD)', () => {
    for (const overrides of [
      { performerLabel: ' \n\t' },
      { rationale: '   ' },
      { scopeText: ' ' },
      // Invisible code points alone show nothing either: zero-width space, word joiner, a bidi
      // mark, the soft hyphen, a byte-order mark, a control character, a Hangul filler.
      { performerLabel: '\u200B' },
      { rationale: '\u2060\u200E' },
      { scopeText: '\u00AD\uFEFF' },
      { performerLabel: '\u0001 \u3164' },
    ]) {
      expect(gateOf(withGate('G4', overrides), 'G4').reasonCodes).toEqual([
        'GATE_HOLD',
        'ASSESSMENT_RECORD_INCOMPLETE',
      ]);
    }
    // One visible character is enough, whatever surrounds it.
    for (const overrides of [
      { performerLabel: '\u200BX' },
      { rationale: 'e\u0301' },
      { scopeText: '🎵' },
    ]) {
      expect(gateOf(withGate('G4', overrides), 'G4').status).toBe('PASS');
    }
    for (const provenance of ['MISSING', 'CONFLICT']) {
      expect(gateOf(withGate('G4', { provenance }), 'G4').reasonCodes).toEqual([
        'GATE_HOLD',
        'ASSESSMENT_PROVENANCE_UNSUPPORTED',
      ]);
    }
    for (const provenance of ['DOCUMENT_REVIEWED', 'OPERATOR_REPORTED', 'ANALYSIS']) {
      expect(gateOf(withGate('G4', { provenance }), 'G4').status).toBe('PASS');
    }
  });

  it('ask dispositions: none on an INITIAL candidate, the prompt parent only on a reply, well formed (else BLOCKED)', () => {
    const disposition = (overrides: Record<string, unknown> = {}) => ({
      askId: 'ask-1',
      questionText: 'SYNTHETIC question',
      parentBindingId: PARENT,
      disposition: 'ANSWERED_SUPPORTED',
      sourceIds: [SOURCE_A],
      ...overrides,
    });
    expect(gateOf(withGate('G2', { askDispositions: [disposition()] }), 'G2').status).toBe(
      'BLOCKED',
    );
    expect(gateOf(withGate('G2', { askDispositions: 'x' }), 'G2').status).toBe('BLOCKED');
    expect(
      gateOf(withGate('G2', { askDispositions: [{ parentBindingId: PARENT }] }), 'G2').status,
    ).toBe('BLOCKED');
    const reply = (gate: Gate, askDispositions: unknown) => {
      const base = withGate(gate, { askDispositions });
      return gateOf(
        readyInput({
          ...base,
          context: { ...base.context, taskType: 'NMI_REPLY', parentBindingId: PARENT },
          askSourceApplies: new Map([
            [SOURCE_A, true],
            [SOURCE_B, false],
          ]),
        }),
        gate,
      );
    };
    expect(reply('G2', [disposition({ parentBindingId: OTHER_BINDING })]).reasonCodes).toEqual([
      'GATE_BLOCKED',
      'ASSESSMENT_INTEGRITY_FAILED',
    ]);
    expect(reply('G2', null).status).toBe('PASS');
    expect(reply('G6', [disposition()]).status).toBe('PASS');
  });

  describe('G6 of a reply (R14-AUD-016): the recorded disposition of each ask is its explicit status', () => {
    const replyInput = (askDispositions: unknown) => {
      const base = withGate('G6', { askDispositions });
      return readyInput({
        ...base,
        context: { ...base.context, taskType: 'NMI_REPLY', parentBindingId: PARENT },
        askSourceApplies: new Map([
          [SOURCE_A, true],
          [SOURCE_B, false],
        ]),
      });
    };
    const reply = (askDispositions: unknown) => gateOf(replyInput(askDispositions), 'G6');
    const disposition = (overrides: Record<string, unknown> = {}) => ({
      askId: 'ask-1',
      questionText: 'SYNTHETIC question',
      parentBindingId: PARENT,
      disposition: 'ANSWERED_SUPPORTED',
      sourceIds: [],
      ...overrides,
    });
    const second = (overrides: Record<string, unknown> = {}) =>
      disposition({ askId: 'ask-2', questionText: 'SYNTHETIC second question', ...overrides });
    const held = (...causes: string[]) => ['GATE_HOLD', ...causes];

    it('classifies every contracted disposition explicitly: three resolved, three unresolved', () => {
      expect(ASK_DISPOSITION_CAUSE).toEqual({
        ANSWERED_SUPPORTED: null,
        ANSWERED_WITH_LIMITATION: null,
        NOT_APPLICABLE_WITH_REASON: null,
        REQUIRES_DOCUMENT: 'G6_ASK_REQUIRES_DOCUMENT',
        MISSING_FACT: 'G6_ASK_MISSING_FACT',
        LEGAL_REVIEW_REQUIRED: 'G6_ASK_LEGAL_REVIEW_REQUIRED',
      });
    });

    it('REQUIRES_DOCUMENT, MISSING_FACT and LEGAL_REVIEW_REQUIRED each hold G6 with their own reason', () => {
      expect(reply([disposition({ disposition: 'REQUIRES_DOCUMENT' })]).reasonCodes).toEqual(
        held('G6_ASK_REQUIRES_DOCUMENT'),
      );
      expect(reply([disposition({ disposition: 'MISSING_FACT' })]).reasonCodes).toEqual(
        held('G6_ASK_MISSING_FACT'),
      );
      expect(reply([disposition({ disposition: 'LEGAL_REVIEW_REQUIRED' })]).reasonCodes).toEqual(
        held('G6_ASK_LEGAL_REVIEW_REQUIRED'),
      );
      expect(
        reply([
          disposition({ disposition: 'LEGAL_REVIEW_REQUIRED' }),
          second({ disposition: 'MISSING_FACT' }),
          disposition({ askId: 'ask-3', disposition: 'REQUIRES_DOCUMENT' }),
        ]).reasonCodes,
      ).toEqual(
        held('G6_ASK_REQUIRES_DOCUMENT', 'G6_ASK_MISSING_FACT', 'G6_ASK_LEGAL_REVIEW_REQUIRED'),
      );
    });

    it('a mixed list stays HOLD: answered asks never compensate for an unresolved one', () => {
      expect(
        reply([disposition(), second({ disposition: 'REQUIRES_DOCUMENT' })]).reasonCodes,
      ).toEqual(held('G6_ASK_REQUIRES_DOCUMENT'));
      expect(
        reply([
          disposition({ disposition: 'ANSWERED_WITH_LIMITATION' }),
          second({ disposition: 'MISSING_FACT' }),
        ]).reasonCodes,
      ).toEqual(held('G6_ASK_MISSING_FACT'));
      expect(
        reply([
          disposition({ disposition: 'NOT_APPLICABLE_WITH_REASON' }),
          second({ disposition: 'MISSING_FACT' }),
        ]).status,
      ).toBe('HOLD');
    });

    it('positive controls: ANSWERED_SUPPORTED, ANSWERED_WITH_LIMITATION and NOT_APPLICABLE_WITH_REASON may count — alone or together', () => {
      for (const kind of [
        'ANSWERED_SUPPORTED',
        'ANSWERED_WITH_LIMITATION',
        'NOT_APPLICABLE_WITH_REASON',
      ]) {
        expect(reply([disposition({ disposition: kind, sourceIds: [SOURCE_A] })]), kind).toEqual({
          gate: 'G6',
          status: 'PASS',
          assessmentId: assessmentId('G6'),
          reasonCodes: [],
        });
      }
      expect(
        reply([
          disposition(),
          second({ disposition: 'ANSWERED_WITH_LIMITATION' }),
          disposition({ askId: 'ask-3', disposition: 'NOT_APPLICABLE_WITH_REASON' }),
        ]).status,
      ).toBe('PASS');
    });

    it('no text is read: an unresolved remainder, answer locator or question naming a document, a fact or legal review never changes a resolved disposition (no keyword rule)', () => {
      const words =
        'SYNTHETIC requires document; missing fact; legal review required; not answered';
      expect(
        reply([
          disposition({
            disposition: 'ANSWERED_WITH_LIMITATION',
            questionText: words,
            answerLocator: words,
            unresolvedRemainder: words,
          }),
        ]).status,
      ).toBe('PASS');
      // …and an empty remainder never resolves an unresolved status.
      expect(
        reply([disposition({ disposition: 'MISSING_FACT', unresolvedRemainder: '' })]).status,
      ).toBe('HOLD');
    });

    it('negative controls: no disposition holds G6; a source that does not apply now holds it; another parent, an ask twice, an unknown or malformed disposition never count (BLOCKED)', () => {
      expect(reply(null).reasonCodes).toEqual(held('G6_ASK_DISPOSITIONS_MISSING'));
      expect(reply([]).reasonCodes).toEqual(held('G6_ASK_DISPOSITIONS_MISSING'));
      expect(reply([disposition({ sourceIds: [SOURCE_B] })]).reasonCodes).toEqual(
        held('G6_ASK_SOURCE_NOT_APPLICABLE'),
      );
      expect(reply([disposition({ sourceIds: [uuid(0x99)] })]).reasonCodes).toEqual(
        held('G6_ASK_SOURCE_NOT_APPLICABLE'),
      );
      const integrity = ['GATE_BLOCKED', 'ASSESSMENT_INTEGRITY_FAILED'];
      expect(reply([disposition({ parentBindingId: OTHER_BINDING })]).reasonCodes).toEqual(
        integrity,
      );
      expect(reply([disposition(), disposition({ questionText: 'again' })]).reasonCodes).toEqual(
        integrity,
      );
      for (const malformed of [
        disposition({ disposition: 'ANSWERED' }),
        disposition({ disposition: 'answered_supported' }),
        disposition({ disposition: null }),
        disposition({ askId: undefined }),
        disposition({ askId: 7 }),
        disposition({ sourceIds: 'x' }),
      ]) {
        expect(reply([malformed]).reasonCodes, JSON.stringify(malformed)).toEqual(integrity);
      }
    });

    it('the readiness: five PASS gates and a G6 PASS with an unresolved ask → REVIEW_REQUIRED with the reason; the export is refused (409 CANDIDATE_NOT_READY); a resolved successor makes it READY', () => {
      const unresolved = replyInput([disposition(), second({ disposition: 'REQUIRES_DOCUMENT' })]);
      const readiness = evaluate(unresolved);
      expect([readiness.status, readiness.reasonCodes]).toEqual([
        'REVIEW_REQUIRED',
        ['G6_HOLD', 'G6_ASK_REQUIRES_DOCUMENT'],
      ]);
      const refusal = exportRefusal(readiness, {
        expectedArtifactSha256: ARTIFACT,
        expectedDependencyDigest: DIGEST,
        validationRunId: uuid(0x50),
        format: 'PLAIN_TEXT',
      });
      expect([refusal?.status, refusal?.code, refusal?.details]).toEqual([
        409,
        'CANDIDATE_NOT_READY',
        { status: 'REVIEW_REQUIRED', reasonCodes: ['G6_HOLD', 'G6_ASK_REQUIRES_DOCUMENT'] },
      ]);
      // An explicit successor of the same epoch that records the ask as answered is the one head.
      const predecessor = unresolved.assessments.find((row) => row.gate === 'G6');
      const successor = assessment('G6', {
        id: assessmentId('G6', 1),
        supersedesAssessmentId: predecessor?.id ?? null,
        askDispositions: [disposition(), second({ disposition: 'ANSWERED_SUPPORTED' })],
      });
      const resolved = readyInput({
        ...unresolved,
        assessments: [...unresolved.assessments, successor],
        supports: new Map([...unresolved.supports, [successor.id, [support()]]]),
      });
      expect(evaluate(resolved).status).toBe('READY_FOR_SIGNER');
      expect(evaluate(resolved).gates[5]?.assessmentId).toBe(successor.id);
    });
  });

  it('G1: a review overtaken by a captured boundary is UNASSESSED (stale); ambiguous or unplaceable is HOLD; integrity wins', () => {
    const authority: AuthorityRecordTimes = {
      ...NO_AUTHORITY,
      events: [
        { id: uuid(0x61), supersedesEventId: null, effectiveAt: at(-HOUR), effectiveOn: null },
      ],
    };
    const g1 = (overrides: Partial<ReadinessAssessment>, extra: Partial<ReadinessInput> = {}) => {
      const base = withGate('G1', overrides);
      return gateOf(
        readyInput({ ...base, context: { ...base.context, authority }, ...extra }),
        'G1',
      );
    };
    expect(g1({ assessedAt: at(-2 * HOUR) })).toEqual({
      gate: 'G1',
      status: 'UNASSESSED',
      assessmentId: assessmentId('G1'),
      reasonCodes: ['GATE_UNASSESSED', 'G1_TEMPORAL_REVIEW_STALE'],
    });
    expect(g1({ assessedAt: at(-HOUR / 2) }).status).toBe('PASS');
    expect(g1({ assessedAt: null }).reasonCodes).toEqual(['GATE_HOLD', 'G1_REVIEW_TIME_UNKNOWN']);
    expect(g1({ assessedAt: at(-2 * HOUR) }, { supports: new Map() }).reasonCodes).toEqual([
      'GATE_BLOCKED',
      'ASSESSMENT_INTEGRITY_FAILED',
      'G1_TEMPORAL_REVIEW_STALE',
    ]);
    // the other gates never read time
    const g2 = withGate('G2', { assessedAt: null });
    expect(gateOf(readyInput({ ...g2, context: { ...g2.context, authority } }), 'G2').status).toBe(
      'PASS',
    );
  });

  it('countableHeads names the single confirmed PASS head of each gate; askSourceIds the G6 sources', () => {
    const input = readyInput({
      assessments: [
        ...GATES.filter((gate) => gate !== 'G2' && gate !== 'G3').map((gate) => assessment(gate)),
        assessment('G2', { scopeState: 'RECORDED_NOT_ADOPTED' }),
        assessment('G3'),
        assessment('G3', { id: assessmentId('G3', 1) }),
      ],
    });
    expect(countableHeads(input.assessments, EPOCH).map((row) => row.gate)).toEqual([
      'G1',
      'G4',
      'G5',
      'G6',
    ]);
    expect(
      askSourceIds(
        assessment('G6', {
          askDispositions: [
            {
              askId: 'ask-1',
              parentBindingId: PARENT,
              disposition: 'ANSWERED_SUPPORTED',
              sourceIds: [SOURCE_B, SOURCE_A],
            },
            {
              askId: 'ask-2',
              parentBindingId: PARENT,
              disposition: 'ANSWERED_SUPPORTED',
              sourceIds: [SOURCE_A],
            },
          ],
        }),
      ),
    ).toEqual([SOURCE_A, SOURCE_B].sort());
    expect(storedDispositions(null)).toEqual([]);
    expect(storedDispositions({})).toBeNull();
  });
});

describe('the candidate itself: exact hashes and the pending signature slot (Decision 10)', () => {
  const candidate = readyInput().candidate;

  it('the stored text hashes to its recorded hashes, and one changed character does not', () => {
    expect(artifactIntact(candidate)).toBe(true);
    expect(artifactIntact({ ...candidate, bodyText: BODY.replace('\r\n', '\n') })).toBe(false);
    expect(artifactIntact({ ...candidate, subject: `${SUBJECT} ` })).toBe(false);
    expect(artifactIntact({ ...candidate, artifactSha256: 'a'.repeat(64) })).toBe(false);
    expect(artifactIntact({ ...candidate, envelope: { from: 'x' } })).toBe(false);
    expect(artifactIntact({ ...candidate, preparedDocuments: {} })).toBe(false);
    expect(artifactIntact({ ...candidate, bodyText: `${BODY}\u0000` })).toBe(false);
    expect(artifactIntact({ ...candidate, bodyText: `${BODY}\ud800` })).toBe(false);
  });

  it('HUMAN_PENDING and the exact slot exactly once in the body, never in the subject; a name elsewhere is not a signature (R-21)', () => {
    expect(signatureSlotValid(candidate)).toBe(true);
    expect(
      signatureSlotValid({
        ...candidate,
        bodyText: BODY.replace(PENDING_SIGNATURE, 'SYNTHETIC Signer'),
      }),
    ).toBe(false);
    expect(signatureSlotValid({ ...candidate, bodyText: `${BODY}${PENDING_SIGNATURE}` })).toBe(
      false,
    );
    expect(signatureSlotValid({ ...candidate, subject: `${SUBJECT} ${PENDING_SIGNATURE}` })).toBe(
      false,
    );
    expect(signatureSlotValid({ ...candidate, signatureState: 'SIGNED' })).toBe(false);
    expect(
      signatureSlotValid({
        ...candidate,
        bodyText: BODY.replace(PENDING_SIGNATURE, PENDING_SIGNATURE.toLowerCase()),
      }),
    ).toBe(false);
  });
});

describe('readiness (the R matrix in pure form)', () => {
  it('R-09: a full TECHNICAL_PASS of E and six confirmed PASS heads of E → READY_FOR_SIGNER, contract-valid', () => {
    const readiness = evaluate(readyInput());
    expect(readiness).toEqual({
      candidateId: CANDIDATE,
      artifactSha256: ARTIFACT,
      dependencyDigest: DIGEST,
      rulesetVersion: TECHNICAL_RULESET_VERSION,
      status: 'READY_FOR_SIGNER',
      technicalResult: 'TECHNICAL_PASS',
      validationRunId: uuid(0x50),
      gates: GATES.map((gate) => ({
        gate,
        status: 'PASS',
        assessmentId: assessmentId(gate),
        reasonCodes: [],
      })),
      reasonCodes: [],
      signatureState: 'HUMAN_PENDING',
      externalAction: 'PROHIBITED',
      evaluatedAt: NOW.toISOString(),
    });
    expect(ReadinessSchema.safeParse(readiness).success).toBe(true);
  });

  it('R-02: a superseded candidate is SUPERSEDED — no successor is chosen', () => {
    const base = readyInput();
    const readiness = evaluate(readyInput({ candidate: { ...base.candidate, superseded: true } }));
    expect(readiness.status).toBe('SUPERSEDED');
    expect(readiness.candidateId).toBe(CANDIDATE);
    expect(readiness.reasonCodes).toEqual(['CANDIDATE_SUPERSEDED']);
  });

  it('R-03 / R-04: no run → UNVALIDATED; only runs of other epochs → STALE_REVALIDATION_REQUIRED', () => {
    const none = evaluate(
      readyInput({ runs: [], issues: new Map(), assessments: [], supports: new Map() }),
    );
    expect(none.status).toBe('UNVALIDATED');
    expect(none.technicalResult).toBeNull();
    expect(none.validationRunId).toBeNull();
    expect(none.reasonCodes).toEqual([
      'VALIDATION_MISSING',
      ...GATES.map((gate) => `${gate}_UNASSESSED`),
    ]);
    const stale = evaluate(
      readyInput({ runs: [run(uuid(0x51), { dependencyDigest: OLD_DIGEST })], issues: new Map() }),
    );
    expect(stale.status).toBe('STALE_REVALIDATION_REQUIRED');
    expect(stale.reasonCodes[0]).toBe('VALIDATION_STALE');
  });

  it('R-05 / R-06 / R-07 / R-08: BLOCKED → BLOCKED, ERROR → BLOCKED with VALIDATION_ERROR, REVIEW_REQUIRED → REVIEW_REQUIRED, an incomplete PASS is never READY', () => {
    const with_ = (
      result: RunRecord['result'],
      issues: IssueRecord[],
      coverageManifest: unknown = FULL_COVERAGE,
    ) =>
      evaluate(
        readyInput({
          runs: [run(uuid(0x51), { result, coverageManifest })],
          issues: new Map([[uuid(0x51), issues]]),
        }),
      );
    expect(with_('BLOCKED', [issue({ severity: 'BLOCKER' })])).toMatchObject({
      status: 'BLOCKED',
      reasonCodes: ['VALIDATION_BLOCKED'],
    });
    expect(with_('ERROR', [issue({ severity: 'BLOCKER' })])).toMatchObject({
      status: 'BLOCKED',
      reasonCodes: ['VALIDATION_ERROR'],
    });
    expect(with_('REVIEW_REQUIRED', [issue()])).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['VALIDATION_REVIEW_REQUIRED'],
    });
    expect(
      with_('TECHNICAL_PASS', [], {
        ...FULL_COVERAGE,
        notExecutedRuleIds: ['ENVELOPE.REPLY_RECIPIENT'],
      }),
    ).toMatchObject({
      status: 'REVIEW_REQUIRED',
      technicalResult: 'TECHNICAL_PASS',
      reasonCodes: ['VALIDATION_COVERAGE_INCOMPLETE'],
    });
  });

  it('R-10…R-14: five PASS gates and one HOLD / BLOCKED / MISSING / CONFLICT / UNASSESSED are never READY (no compensation)', () => {
    expect(evaluate(withGate('G3', { result: 'HOLD' }))).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['G3_HOLD'],
    });
    expect(evaluate(withGate('G3', { result: 'BLOCKED' }))).toMatchObject({
      status: 'BLOCKED',
      reasonCodes: ['G3_BLOCKED'],
    });
    expect(evaluate(withGate('G3', { result: 'MISSING' }))).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['G3_MISSING'],
    });
    expect(evaluate(withGate('G3', { result: 'CONFLICT' }))).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['G3_CONFLICT'],
    });
    const five = readyInput({
      assessments: GATES.filter((gate) => gate !== 'G6').map((gate) => assessment(gate)),
    });
    expect(evaluate(five)).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['G6_UNASSESSED'],
    });
  });

  it('R-20: a context change moves the digest: the run and the reviews of the old epoch are stale', () => {
    const base = readyInput();
    const readiness = evaluate(
      readyInput({ context: { ...base.context, dependencyDigest: OLD_DIGEST } }),
    );
    expect(readiness.status).toBe('STALE_REVALIDATION_REQUIRED');
    expect(readiness.dependencyDigest).toBe(OLD_DIGEST);
    expect(readiness.validationRunId).toBeNull();
    expect(readiness.reasonCodes).toEqual([
      'VALIDATION_STALE',
      ...GATES.map((gate) => `${gate}_UNASSESSED`),
      'ASSESSMENT_STALE',
    ]);
  });

  it('R-21 / R-22: an invalid slot or a PREPARATION prompt is BLOCKED whatever the rest', () => {
    const base = readyInput();
    expect(
      evaluate(
        readyInput({
          candidate: {
            ...base.candidate,
            bodyText: `${BODY}${PENDING_SIGNATURE}`,
            bodySha256: exactTextSha256(`${BODY}${PENDING_SIGNATURE}`),
          },
        }),
      ).reasonCodes,
    ).toEqual(['ARTIFACT_INTEGRITY_FAILED', 'SIGNATURE_SLOT_INVALID']);
    expect(evaluate(withContext({ generationMode: 'PREPARATION' }))).toMatchObject({
      status: 'BLOCKED',
      reasonCodes: ['PREPARATION_MODE'],
    });
  });

  it('R-23 / R-24: a timestamp boundary after the G1 review stales readiness with an unchanged digest; a review after it counts', () => {
    const authority: AuthorityRecordTimes = {
      ...NO_AUTHORITY,
      events: [
        { id: uuid(0x61), supersedesEventId: null, effectiveAt: at(HOUR), effectiveOn: null },
      ],
    };
    const input = withContext({ authority });
    expect(evaluate(input).status).toBe('READY_FOR_SIGNER');
    const later = evaluate(input, at(2 * HOUR));
    expect(later.status).toBe('STALE_REVALIDATION_REQUIRED');
    expect(later.dependencyDigest).toBe(DIGEST);
    expect(later.reasonCodes).toEqual(['G1_UNASSESSED', 'G1_TEMPORAL_REVIEW_STALE']);
    const reviewedAfter = withGate('G1', { assessedAt: at(90 * 60_000) });
    expect(
      evaluate(
        readyInput({ ...reviewedAfter, context: { ...reviewedAfter.context, authority } }),
        at(2 * HOUR),
      ).status,
    ).toBe('READY_FOR_SIGNER');
  });

  it('R-25: a date-only boundary on the review date is REVIEW_REQUIRED (TEMPORAL_BOUNDARY_AMBIGUOUS), never a clean pass', () => {
    const authority: AuthorityRecordTimes = {
      ...NO_AUTHORITY,
      coverages: [{ effectiveOn: null, expiresOn: '2026-09-29' }],
    };
    const input = withContext({ authority });
    expect(evaluate(input)).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['G1_HOLD', 'TEMPORAL_BOUNDARY_AMBIGUOUS'],
    });
  });

  it('R-26: time alone never stales anything — ten years later with no boundary the readiness is unchanged', () => {
    const later = evaluate(readyInput(), new Date('2036-09-29T12:00:00.000Z'));
    expect(later.status).toBe('READY_FOR_SIGNER');
    expect(later.reasonCodes).toEqual([]);
    // a missing expiry is UNKNOWN, never "until forever", and never a reason by itself
    const unknownExpiry = withContext({
      authority: { ...NO_AUTHORITY, versions: [{ effectiveOn: '2025-01-01', expiresOn: null }] },
    });
    expect(evaluate(unknownExpiry, new Date('2036-09-29T12:00:00.000Z')).status).toBe(
      'READY_FOR_SIGNER',
    );
  });

  it('a future effective date of the selected authority is REVIEW_REQUIRED (AUTHORITY_EFFECTIVE_DATE_NOT_REACHED), no invalidity stated', () => {
    const readiness = evaluate(
      withContext({
        authority: { ...NO_AUTHORITY, versions: [{ effectiveOn: '2026-12-01', expiresOn: null }] },
      }),
    );
    expect(readiness.status).toBe('REVIEW_REQUIRED');
    expect(readiness.reasonCodes).toEqual(['AUTHORITY_EFFECTIVE_DATE_NOT_REACHED']);
  });

  it('a missing G1 review time is never replaced by the recording time (temporal negative control)', () => {
    const authority: AuthorityRecordTimes = {
      ...NO_AUTHORITY,
      events: [
        { id: uuid(0x61), supersedesEventId: null, effectiveAt: at(-HOUR), effectiveOn: null },
      ],
    };
    const base = withGate('G1', { assessedAt: null });
    expect(
      evaluate(readyInput({ ...base, context: { ...base.context, authority } })),
    ).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['G1_HOLD', 'G1_REVIEW_TIME_UNKNOWN'],
    });
  });

  it('scope and context: archived case, missing DRAFTING input and an oversized context are BLOCKED; other gaps and conflicts need a review', () => {
    expect(evaluate(withContext({ caseArchived: true }))).toMatchObject({
      status: 'BLOCKED',
      reasonCodes: ['CASE_ARCHIVED'],
    });
    expect(
      evaluate(withContext({ blockingMissing: ['WORKS_ABSENT'], missingCount: 1 })),
    ).toMatchObject({
      status: 'BLOCKED',
      reasonCodes: ['CONTEXT_INPUT_MISSING', 'CONTEXT_MISSING_ITEMS'],
    });
    expect(evaluate(withContext({ tooLarge: true }))).toMatchObject({
      status: 'BLOCKED',
      reasonCodes: ['CONTEXT_TOO_LARGE'],
    });
    expect(evaluate(withContext({ missingCount: 2 }))).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['CONTEXT_MISSING_ITEMS'],
    });
    expect(evaluate(withContext({ conflictCount: 1 }))).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['CONTEXT_CONFLICTS'],
    });
  });

  it('corrupt supersession chains are never evaluated (500)', () => {
    const input = readyInput({
      assessments: [
        ...GATES.map((gate) => assessment(gate)),
        assessment('G2', { id: assessmentId('G2', 1), supersedesAssessmentId: uuid(0x99) }),
      ],
    });
    let caught: unknown;
    try {
      evaluate(input);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(500);
  });

  it('READY_FOR_SIGNER exactly when no reason code is present, and every output is contract-valid', () => {
    const inputs: ReadinessInput[] = [
      readyInput(),
      withGate('G1', { result: 'HOLD' }),
      withGate('G2', { dependencyDigest: OLD_DIGEST }),
      withContext({ conflictCount: 1 }),
      withContext({ generationMode: 'PREPARATION' }),
      readyInput({ runs: [], issues: new Map() }),
      readyInput({ candidate: { ...readyInput().candidate, superseded: true } }),
    ];
    for (const input of inputs) {
      for (const now of [NOW, at(365 * 24 * HOUR)]) {
        const readiness = evaluate(input, now);
        expect(readiness.status === 'READY_FOR_SIGNER').toBe(readiness.reasonCodes.length === 0);
        expect(ReadinessSchema.safeParse(readiness).success).toBe(true);
        expect(readiness.signatureState).toBe('HUMAN_PENDING');
        expect(readiness.externalAction).toBe('PROHIBITED');
        expect(readiness.gates.map((gate) => gate.gate)).toEqual([...GATES]);
      }
    }
  });
});

describe('the unsigned export refusal order (Decisions 14 and 17)', () => {
  const body = {
    expectedArtifactSha256: ARTIFACT,
    expectedDependencyDigest: DIGEST,
    validationRunId: uuid(0x50),
    format: 'PLAIN_TEXT' as const,
  };
  const outcome = (
    readiness: ReturnType<typeof evaluate>,
    overrides: Partial<typeof body> = {},
  ) => {
    const error = exportRefusal(readiness, { ...body, ...overrides });
    return error === null ? null : [error.status, error.code, error.details];
  };

  it('releases only a READY_FOR_SIGNER readiness of exactly the expected artifact, digest and run', () => {
    const ready = evaluate(readyInput());
    expect(outcome(ready)).toBeNull();
    expect(outcome(ready, { expectedArtifactSha256: 'a'.repeat(64) })).toEqual([
      412,
      'ARTIFACT_CHANGED',
      { field: 'expectedArtifactSha256' },
    ]);
    expect(outcome(ready, { expectedDependencyDigest: OLD_DIGEST })).toEqual([
      412,
      'CONTEXT_CHANGED',
      { field: 'expectedDependencyDigest' },
    ]);
    expect(outcome(ready, { validationRunId: uuid(0x51) })).toEqual([
      412,
      'VALIDATION_RUN_CHANGED',
      { field: 'validationRunId' },
    ]);
  });

  it('the caller’s view of the epoch first, then the status with its reasons, then the counted run', () => {
    const notReady = evaluate(withGate('G2', { result: 'HOLD' }));
    expect(outcome(notReady)).toEqual([
      409,
      'CANDIDATE_NOT_READY',
      { status: 'REVIEW_REQUIRED', reasonCodes: ['G2_HOLD'] },
    ]);
    expect(outcome(notReady, { expectedDependencyDigest: OLD_DIGEST })?.[1]).toBe(
      'CONTEXT_CHANGED',
    );
    expect(outcome(notReady, { validationRunId: uuid(0x51) })?.[1]).toBe('CANDIDATE_NOT_READY');
    const superseded = evaluate(
      readyInput({ candidate: { ...readyInput().candidate, superseded: true } }),
    );
    expect(outcome(superseded)).toEqual([
      409,
      'CANDIDATE_NOT_READY',
      { status: 'SUPERSEDED', reasonCodes: ['CANDIDATE_SUPERSEDED'] },
    ]);
  });
});

describe('the readiness module: no network, clock, randomness or write', () => {
  const sources = readdirSync(READINESS_MODULE)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(path.join(READINESS_MODULE, name), 'utf8')] as const);
  const code = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

  it('no module file calls a network, mail, file, process, curl or AI-provider API', () => {
    const forbidden =
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|node:(http|https|http2|net|tls|dns|dgram|child_process|fs|os|worker_threads)|\bundici\b|\baxios\b|\bcurl\b|nodemailer|smtp|imap|googleapis|openai|anthropic|gemini|@google\/gen|generativelanguage|bedrock|vertex|mistral|cohere|ollama|langchain|process\.(env|exec|spawn)|\bexecSync\b|\bspawn\s*\(|\beval\s*\(|new Function\s*\(|completions|chat\.create|generateContent/i;
    for (const [name, text] of sources) expect(text, name).not.toMatch(forbidden);
  });

  it('writes nothing but the export audit event EXPORT_UNSIGNED: no create, update or delete; no signed, sent or submitted state', () => {
    for (const [name, text] of sources) {
      const body = code(text);
      expect(body, name).not.toMatch(
        /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/,
      );
      expect(body, name).not.toMatch(
        /\bUPDATE\s+`?\w+`?\s+SET\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b/i,
      );
      expect(body, name).not.toMatch(
        /'SIGNED'|'SENT'|'AS_SENT'|'SUBMITTED'|'NOTICE_SENT'|'ADOPTED'|'APPROVED'|sendPerformed: true|G7_COMPLETE/,
      );
    }
    const service = code(sources.find(([name]) => name === 'readiness.service.ts')?.[1] ?? '');
    expect(service.match(/action: '/g)).toHaveLength(1);
    expect(service).toContain("action: 'EXPORT_UNSIGNED'");
    expect(service).toContain('sendPerformed: false');
    expect(service).toContain("externalAction: 'PROHIBITED'");
  });

  it('the rules read no clock, randomness, locale or environment (the instant is an argument)', () => {
    const rules = code(sources.find(([name]) => name === 'readiness-rules.ts')?.[1] ?? '');
    expect(rules).not.toMatch(
      /Date\.now|new Date\(|Math\.random|randomUUID|randomBytes|performance\.|process\.|toLocale|Intl\.|localeCompare|\.normalize\(|\.trim\(|hostname/,
    );
  });
});
